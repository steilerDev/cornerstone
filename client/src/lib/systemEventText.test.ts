/**
 * @jest-environment jsdom
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import i18n from '../i18n/index.js';
import { createFormatters } from './formatters.js';
import { renderSystemEvent } from './systemEventText.js';
import type { SystemEventFormatters } from './systemEventText.js';

// ── Harness: the real i18n instance, fixed to one language per call ─────────────────────────────

const LOCALES = { en: 'en-US', de: 'de-DE' } as const;
type Lang = keyof typeof LOCALES;

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function setup(lang: Lang) {
  const t = i18n.getFixedT(lang) as unknown as TFunction;
  const all = createFormatters(LOCALES[lang], 'EUR');
  const f: SystemEventFormatters = {
    formatDate: (d) => all.formatDate(d),
    formatCurrency: all.formatCurrency,
  };
  return { t, f, all };
}

function render(entry: DiaryEntrySummary, lang: Lang = 'en') {
  const { t, f } = setup(lang);
  return renderSystemEvent(entry, t, f);
}

function makeEntry(overrides: Partial<DiaryEntrySummary> = {}): DiaryEntrySummary {
  return {
    id: 'ev-1',
    entryType: 'work_item_status',
    entryDate: '2026-03-14',
    title: null,
    body: '',
    metadata: null,
    isAutomatic: true,
    isSigned: false,
    status: 'saved',
    sourceEntityType: 'work_item',
    sourceEntityId: 'wi-1',
    sourceEntityArea: null,
    sourceEntityTitle: 'Kitchen tiling',
    sourceEntityExists: true,
    photoCount: 0,
    createdBy: null,
    createdAt: '2026-03-14T10:00:00.000Z',
    updatedAt: '2026-03-14T10:00:00.000Z',
    ...overrides,
  };
}

const statusMeta = (over: Record<string, unknown> = {}) => ({
  v: 1,
  event: 'status_changed',
  from: 'not_started',
  to: 'in_progress',
  subjectLabel: 'Snapshot name',
  ...over,
});

const task = (over: Partial<DiaryEntrySummary> = {}, meta: Record<string, unknown> = {}) =>
  makeEntry({ metadata: statusMeta(meta) as never, ...over });

const invoice = (over: Partial<DiaryEntrySummary> = {}, meta: Record<string, unknown> = {}) =>
  makeEntry({
    entryType: 'invoice_status',
    sourceEntityType: 'invoice',
    sourceEntityId: 'inv-1',
    sourceEntityTitle: '2026-014',
    metadata: statusMeta({
      from: 'pending',
      to: 'claimed',
      subjectLabel: '2026-014',
      ...meta,
    }) as never,
    ...over,
  });

const deposit = (over: Partial<DiaryEntrySummary> = {}, meta: Record<string, unknown> = {}) =>
  invoice(over, { to: 'paid', depositId: 'dep-1', depositEntryType: 'deposit', ...meta });

const grant = (over: Partial<DiaryEntrySummary> = {}, meta: Record<string, unknown> = {}) =>
  makeEntry({
    entryType: 'subsidy_status',
    sourceEntityType: 'subsidy_program',
    sourceEntityId: 'gr-1',
    sourceEntityTitle: 'Energy bonus',
    metadata: statusMeta({
      from: 'applied',
      to: 'approved',
      subjectLabel: 'Energy bonus',
      ...meta,
    }) as never,
    ...over,
  });

const milestone = (over: Partial<DiaryEntrySummary> = {}, meta: Record<string, unknown> = {}) =>
  makeEntry({
    entryType: 'milestone_delay',
    sourceEntityType: 'milestone',
    sourceEntityId: 'ms-1',
    sourceEntityTitle: 'Roof closed',
    metadata: {
      v: 1,
      event: 'milestone_delayed',
      targetDate: '2026-03-01',
      projectedDate: '2026-03-08',
      delayDays: 7,
      subjectLabel: 'Roof closed',
      ...meta,
    } as never,
    ...over,
  });

const recorded = (over: Partial<DiaryEntrySummary> = {}, meta: Record<string, unknown> = {}) =>
  makeEntry({
    entryType: 'invoice_created',
    sourceEntityType: 'invoice',
    sourceEntityId: 'inv-2',
    sourceEntityTitle: '2026-015',
    metadata: {
      v: 1,
      event: 'invoice_created',
      subjectLabel: '2026-015',
      vendorId: 'c-1',
      vendorName: 'Example Roofing Ltd',
      ...meta,
    } as never,
    ...over,
  });

// ── Sentences and type labels (en) ──────────────────────────────────────────────────────────────

describe('renderSystemEvent: sentences and type labels (en)', () => {
  it('task status change', () => {
    const view = render(task());
    expect(view.kind).toBe('statusChange');
    expect(view.typeLabel).toBe('Task status');
    expect(view.sentence).toBe('Kitchen tiling went from Not started to In progress');
    expect(view.isLegacyText).toBe(false);
    expect(view.heading).toBe('Kitchen tiling');
    expect(view.detail).toBeNull();
  });

  it('invoice pending to claimed without a batch is a plain Status change (#2224)', () => {
    const view = render(invoice());
    expect(view.kind).toBe('statusChange');
    expect(view.typeLabel).toBe('Invoice status');
    expect(view.sentence).toBe('Invoice 2026-014 went from To pay to Submitted');
    expect(view.heading).toBe('Invoice 2026-014');
    expect(view.extraBadge).toBeNull();
  });

  it('an uncollapsed batch member (metadata.batchId, no batch summary) is a Submission', () => {
    const view = render(invoice({}, { batchId: 'b-1' }));
    expect(view.kind).toBe('submission');
    expect(view.sentence).toBe('Invoice 2026-014 went from To pay to Submitted');
    expect(view.extraBadge).toBe('Submission');
  });

  it('a batch id wins over a paid target', () => {
    expect(render(invoice({}, { to: 'paid', batchId: 'b-1' })).kind).toBe('submission');
  });

  it('invoice to paid is a Payment, with the amount when stored', () => {
    const plain = render(invoice({}, { to: 'paid' }));
    expect(plain.kind).toBe('payment');
    expect(plain.typeLabel).toBe('Invoice status');
    expect(plain.sentence).toBe('Invoice 2026-014 went from To pay to Paid');
    const withAmount = render(invoice({}, { to: 'paid', amount: 1234.5 }));
    expect(withAmount.sentence).toBe('Invoice 2026-014 of €1,234.50 went from To pay to Paid');
  });

  it('invoice to another status is a plain Status change, even with an amount', () => {
    const view = render(invoice({}, { from: 'claimed', to: 'pending', amount: 50 }));
    expect(view.kind).toBe('statusChange');
    expect(view.sentence).toBe('Invoice 2026-014 went from Submitted to To pay');
  });

  it('progress payment (deposit) with and without an amount', () => {
    expect(render(deposit()).sentence).toBe(
      'Progress payment for invoice 2026-014 went from To pay to Paid',
    );
    const view = render(deposit({}, { amount: 1000 }));
    expect(view.sentence).toBe(
      'Progress payment of €1,000.00 for invoice 2026-014 went from To pay to Paid',
    );
    expect(view.kind).toBe('payment');
    expect(view.heading).toBe('Invoice 2026-014');
  });

  it('a refund deposit says Refund', () => {
    const view = render(deposit({}, { depositEntryType: 'refund', amount: 200 }));
    expect(view.sentence).toBe('Refund of €200.00 for invoice 2026-014 went from To pay to Paid');
  });

  it('a deposit to claimed is a Submission only when it belongs to a batch', () => {
    expect(render(deposit({}, { to: 'claimed' })).kind).toBe('statusChange');
    const claimed = render(deposit({}, { to: 'claimed', batchId: 'b-1' }));
    expect(claimed.kind).toBe('submission');
    expect(claimed.typeLabel).toBe('Invoice status');
    expect(render(deposit({}, { to: 'claimed', batchId: 'b-1' }), 'de').typeLabel).toBe(
      'Rechnungsstatus',
    );
  });

  it('grant status', () => {
    const view = render(grant());
    expect(view.kind).toBe('grantStatus');
    expect(view.typeLabel).toBe('Grant status');
    expect(view.sentence).toBe('Grant Energy bonus went from Applied to Approved');
    expect(view.heading).toBe('Energy bonus');
  });

  it('milestone moved: singular and plural days, dates by locale', () => {
    const { all } = setup('en');
    const many = render(milestone());
    expect(many.kind).toBe('milestoneMoved');
    expect(many.typeLabel).toBe('Milestone moved');
    expect(many.sentence).toBe(
      `Roof closed is 7 days late. Projected ${all.formatDate('2026-03-08')}, target ${all.formatDate('2026-03-01')}.`,
    );
    expect(render(milestone({}, { delayDays: 1 })).sentence).toContain(
      'Roof closed is 1 day late.',
    );
    expect(render(milestone({}, { delayDays: 13 })).sentence).toContain('is 13 days late.');
  });

  it('invoice recorded, with and without a company, with the amount as a detail line', () => {
    const view = render(recorded({}, { amount: 480 }));
    expect(view.kind).toBe('invoiceRecorded');
    expect(view.typeLabel).toBe('Invoice recorded');
    expect(view.sentence).toBe('Invoice 2026-015 recorded for Example Roofing Ltd');
    expect(view.detail).toBe('€480.00');
    expect(view.heading).toBe('Invoice 2026-015');
    const none = render(recorded({}, { vendorName: null, vendorId: null }));
    expect(none.sentence).toBe('Invoice 2026-015 recorded');
    expect(none.detail).toBeNull();
  });

  it('a quotation is an Offer with an Open offer link', () => {
    const view = render(recorded({}, { invoiceStatus: 'quotation' }));
    expect(view.sentence).toBe('Offer 2026-015 recorded for Example Roofing Ltd');
    expect(view.heading).toBe('Offer 2026-015');
    expect(view.link?.label).toBe('Open offer');
  });
});

// ── Edge rows ───────────────────────────────────────────────────────────────────────────────────

describe('renderSystemEvent: edge rows', () => {
  it('from null uses the "changed to" form for every subject', () => {
    expect(render(task({}, { from: null, to: 'completed' })).sentence).toBe(
      'Kitchen tiling changed to Done',
    );
    expect(render(invoice({}, { from: null, to: 'paid' })).sentence).toBe(
      'Invoice 2026-014 changed to Paid',
    );
    expect(render(deposit({}, { from: null })).sentence).toBe(
      'Progress payment for invoice 2026-014 changed to Paid',
    );
    expect(render(grant({}, { from: null, to: 'received' })).sentence).toBe(
      'Grant Energy bonus changed to Received',
    );
  });

  it('shows an unknown status value raw', () => {
    expect(render(task({}, { to: 'mystery' })).sentence).toBe(
      'Kitchen tiling went from Not started to mystery',
    );
    expect(render(invoice({}, { from: 'odd', to: 'paid' })).sentence).toBe(
      'Invoice 2026-014 went from odd to Paid',
    );
  });

  it('prefers the live name and falls back to the snapshot, then to a placeholder', () => {
    expect(render(task({ sourceEntityTitle: 'Live name' })).sentence).toContain('Live name');
    expect(render(task({ sourceEntityTitle: null })).sentence).toContain('Snapshot name went');
    expect(render(task({ sourceEntityTitle: '  ' })).sentence).toContain('Snapshot name went');
    const bare = render(task({ sourceEntityTitle: null }, { subjectLabel: null }));
    expect(bare.sentence).toBe('Untitled task went from Not started to In progress');
    expect(bare.heading).toBe('Untitled task');
    expect(render(milestone({ sourceEntityTitle: null }, { subjectLabel: '' })).sentence).toContain(
      'Untitled milestone is 7 days late.',
    );
    expect(render(grant({ sourceEntityTitle: null }, { subjectLabel: null })).sentence).toBe(
      'Grant (no name) went from Applied to Approved',
    );
  });

  it('an invoice without a number reads "(no number)"', () => {
    const view = render(invoice({ sourceEntityTitle: null }, { subjectLabel: null }));
    expect(view.sentence).toBe('Invoice (no number) went from To pay to Submitted');
    expect(view.heading).toBe('Invoice (no number)');
  });

  it('never shows server text: a v1 row with a title and body renders from parameters only', () => {
    const view = render(task({ title: 'Tampered English title', body: 'Tampered English body' }));
    expect(view.sentence).toBe('Kitchen tiling went from Not started to In progress');
    expect(view.sentence).not.toContain('Tampered');
    expect(view.heading).toBe('Kitchen tiling');
  });
});

// ── Legacy and pre-v1 rows ──────────────────────────────────────────────────────────────────────

describe('renderSystemEvent: legacy rows', () => {
  it('pre-v1 metadata shows the stored body, flagged as legacy text', () => {
    const view = render(
      makeEntry({
        title: 'Stored title',
        body: ' Work item "Kitchen" changed status to in_progress. ',
        metadata: { changeSummary: 'Status changed to in_progress' } as never,
      }),
    );
    expect(view.kind).toBe('legacy');
    expect(view.isLegacyText).toBe(true);
    expect(view.sentence).toBe('Work item "Kitchen" changed status to in_progress.');
    expect(view.heading).toBe('Stored title');
    expect(view.typeLabel).toBe('Task status');
    expect(view.detail).toBeNull();
  });

  it('null metadata and a legacy event both take the stored text; empty body falls back to title', () => {
    expect(render(makeEntry({ metadata: null, body: 'Stored' })).sentence).toBe('Stored');
    expect(
      render(
        makeEntry({ metadata: { v: 1, event: 'legacy' } as never, body: '', title: 'Only title' }),
      ).sentence,
    ).toBe('Only title');
    expect(render(makeEntry({ metadata: null, body: '', title: null })).sentence).toBe('');
  });

  it('uses the renamed stored-type labels for every automatic type', () => {
    const labels: Record<string, string> = {
      work_item_status: 'Task status',
      invoice_status: 'Invoice status',
      subsidy_status: 'Grant status',
      milestone_delay: 'Milestone moved',
      invoice_created: 'Invoice recorded',
      budget_breach: 'Over budget',
      auto_reschedule: 'Schedule update',
    };
    for (const [entryType, label] of Object.entries(labels)) {
      expect(render(makeEntry({ entryType: entryType as never, metadata: null })).typeLabel).toBe(
        label,
      );
    }
  });

  it('a legacy deposit row keeps the payment link', () => {
    const view = render(
      makeEntry({
        entryType: 'invoice_status',
        sourceEntityType: 'invoice',
        sourceEntityId: 'inv-1',
        sourceEntityTitle: '2026-014',
        title: 'Stored',
        body: 'Stored text',
        metadata: { v: 1, event: 'legacy', depositId: 'dep-9' } as never,
      }),
    );
    expect(view.link?.to).toBe('/budget/invoices/inv-1?payment=dep-9');
    expect(view.link?.label).toBe('Open progress payment');
  });

  it('a legacy row links by its subject, but not for a budget source', () => {
    expect(render(makeEntry({ metadata: null })).link?.to).toBe('/project/work-items/wi-1');
    expect(
      render(
        makeEntry({
          metadata: null,
          entryType: 'subsidy_status',
          sourceEntityType: 'subsidy_program',
          sourceEntityId: 'gr-1',
        }),
      ).link?.to,
    ).toBe('/budget/financing/grants/gr-1');
    const budgetSource = render(
      makeEntry({
        metadata: null,
        entryType: 'budget_breach',
        sourceEntityType: 'budget_source',
        sourceEntityId: 'bs-1',
      }),
    );
    expect(budgetSource.link).toBeNull();
    expect(budgetSource.removed).toBe(false);
  });

  it('a legacy row with a deleted subject is removed and has no link', () => {
    const view = render(makeEntry({ metadata: null, sourceEntityExists: false }));
    expect(view.link).toBeNull();
    expect(view.removed).toBe(true);
  });

  it('a legacy row with a subject type the router cannot open has no link', () => {
    const view = render(
      makeEntry({
        metadata: null,
        sourceEntityType: 'unknown_thing' as never,
        sourceEntityId: 'x',
      }),
    );
    expect(view.link).toBeNull();
  });
});

// ── Links ───────────────────────────────────────────────────────────────────────────────────────

describe('renderSystemEvent: links', () => {
  it.each([
    ['task', task(), '/project/work-items/wi-1', 'Open task'],
    ['invoice', invoice(), '/budget/invoices/inv-1', 'Open invoice'],
    [
      'progress payment',
      deposit(),
      '/budget/invoices/inv-1?payment=dep-1',
      'Open progress payment',
    ],
    [
      'refund',
      deposit({}, { depositEntryType: 'refund' }),
      '/budget/invoices/inv-1?payment=dep-1',
      'Open refund',
    ],
    ['milestone', milestone(), '/project/milestones/ms-1', 'Open milestone'],
    ['grant page', grant(), '/budget/financing/grants/gr-1', 'Open grant'],
    ['recorded invoice', recorded(), '/budget/invoices/inv-2', 'Open invoice'],
  ])('%s: href and visible label', (_name, entry, to, label) => {
    const view = render(entry as DiaryEntrySummary);
    expect(view.link?.to).toBe(to);
    expect(view.link?.label).toBe(label);
    expect(view.removed).toBe(false);
  });

  it('a grant status event without a stored grant id has no link (nothing to open, #2242)', () => {
    const view = render(grant({ sourceEntityId: null }));
    expect(view.link).toBeNull();
  });

  it('the accessible name starts with the visible text', () => {
    for (const entry of [task(), invoice(), milestone(), grant(), recorded()]) {
      const link = render(entry).link!;
      expect(link.ariaLabel.startsWith(link.label)).toBe(true);
    }
    expect(render(task()).link?.ariaLabel).toBe('Open task: Kitchen tiling');
  });

  it('the payment link is named with amount, invoice and date (event.link.paymentNamed)', () => {
    const { all } = setup('en');
    const link = render(deposit({ entryDate: '2026-03-14' }, { amount: 1000 })).link!;
    expect(link.ariaLabel).toBe(
      `Open progress payment of €1,000.00 for invoice 2026-014, ${all.formatDate('2026-03-14')}`,
    );
    expect(link.ariaLabel.startsWith(link.label)).toBe(true);
  });

  it('a payment link without a stored amount falls back to the generic name', () => {
    expect(render(deposit()).link?.ariaLabel).toBe('Open progress payment: Invoice 2026-014');
  });

  it('a gone or missing subject gives no link and a removed flag', () => {
    for (const over of [{ sourceEntityExists: false }, { sourceEntityId: null }]) {
      const view = render(task(over as Partial<DiaryEntrySummary>));
      expect(view.link).toBeNull();
      expect(view.removed).toBe(true);
    }
  });

  it('a deposit event without a deposit id in the link still opens the invoice', () => {
    expect(render(invoice()).link?.to).toBe('/budget/invoices/inv-1');
  });

  it('a budget_breach row never counts as removed (no subject type)', () => {
    const view = render(
      makeEntry({
        entryType: 'budget_breach',
        metadata: null,
        sourceEntityType: 'budget_source',
        sourceEntityId: null,
      }),
    );
    expect(view.removed).toBe(false);
    expect(view.link).toBeNull();
  });
});

// ── Repeat and hidden ───────────────────────────────────────────────────────────────────────────

describe('renderSystemEvent: repeat and hidden', () => {
  it('a repeat on one day reads "N times on <date>", over a range "N times, <from> to <to>"', () => {
    const { all } = setup('en');
    const same = render(
      task({
        repeat: { count: 3, firstAt: '2026-03-12T08:00:00Z', lastAt: '2026-03-12T17:00:00Z' },
      }),
    );
    expect(same.repeat?.badge).toBe('×3');
    expect(same.repeat?.detail).toBe(`3 times on ${all.formatDate('2026-03-12')}`);
    const range = render(
      task({
        repeat: { count: 2, firstAt: '2026-03-12T08:00:00Z', lastAt: '2026-03-19T08:00:00Z' },
      }),
    );
    expect(range.repeat?.badge).toBe('×2');
    expect(range.repeat?.detail).toBe(
      `2 times, ${all.formatDate('2026-03-12')} to ${all.formatDate('2026-03-19')}`,
    );
  });

  it('has no repeat or afterReached by default', () => {
    const view = render(task());
    expect(view.repeat).toBeNull();
    expect(view.afterReached).toBeNull();
  });

  it('a hidden row says "After reached"', () => {
    const view = render(milestone({ hidden: true }));
    expect(view.afterReached).toEqual({
      badge: 'After reached',
      detail: 'Logged after the milestone was reached.',
    });
  });
});

// ── German ──────────────────────────────────────────────────────────────────────────────────────

describe('renderSystemEvent: German', () => {
  it('uses German status labels, nouns, dates and amounts', () => {
    const { all } = setup('de');
    const status = render(task({}, { to: 'completed' }), 'de');
    expect(status.typeLabel).toBe('Aufgabenstatus');
    expect(status.sentence).toBe('Kitchen tiling wechselte von Nicht begonnen zu Abgeschlossen');

    const paid = render(deposit({}, { amount: 1234.5 }), 'de');
    expect(paid.typeLabel).toBe('Rechnungsstatus');
    expect(paid.sentence).toBe(
      `Abschlagszahlung über ${all.formatCurrency(1234.5)} zu Rechnung 2026-014 wechselte von Zu zahlen zu Bezahlt`,
    );
    expect(all.formatCurrency(1234.5)).toContain('1.234,50');

    const late = render(milestone(), 'de');
    expect(late.sentence).toBe(
      `Roof closed ist 7 Tage verspätet. Voraussichtlich ${all.formatDate('2026-03-08')}, Ziel ${all.formatDate('2026-03-01')}.`,
    );
    expect(render(milestone({}, { delayDays: 1 }), 'de').sentence).toContain('1 Tag verspätet');
  });

  it('links, removal and repeats are localised', () => {
    expect(render(task(), 'de').link?.label).toBe('Aufgabe öffnen');
    expect(render(grant(), 'de').typeLabel).toBe('Förderstatus');
    const repeat = render(
      task({
        repeat: { count: 2, firstAt: '2026-03-12T08:00:00Z', lastAt: '2026-03-19T08:00:00Z' },
      }),
      'de',
    );
    expect(repeat.repeat?.detail).toMatch(/^2 Mal, .+ bis .+$/);
    expect(render(task(), 'de').afterReached).toBeNull();
    expect(render(milestone({ hidden: true }), 'de').afterReached?.badge).toBe('Nach Erreichen');
  });

  it('the same event renders differently per language (live vs snapshot name stays the same)', () => {
    const en = render(task({ sourceEntityTitle: null }));
    const de = render(task({ sourceEntityTitle: null }), 'de');
    expect(en.sentence).toContain('Snapshot name');
    expect(de.sentence).toContain('Snapshot name');
    expect(en.sentence).not.toBe(de.sentence);
  });
});

// ── Extra badge and the batch submission view (#2224) ───────────────────────────────────────────

const batchSummary = (over: Record<string, unknown> = {}) => ({
  batchId: 'b-1',
  invoiceCount: 2,
  amount: 1500,
  invoiceLabels: ['T-001', 'T-002'],
  budgetSourceId: 'src-1',
  budgetSourceName: 'Bank A',
  budgetSourceExists: true,
  ...over,
});

const submission = (batchOver: Record<string, unknown> = {}) =>
  invoice({ batch: batchSummary(batchOver) as never }, { batchId: 'b-1' });

describe('renderSystemEvent: extra badge', () => {
  it('a Payment carries the Payment badge as real text', () => {
    expect(render(invoice({}, { to: 'paid' })).extraBadge).toBe('Payment');
    expect(render(deposit()).extraBadge).toBe('Payment');
  });

  it('a Payment badge is localized', () => {
    expect(render(invoice({}, { to: 'paid' }), 'de').extraBadge).toBe('Zahlung');
  });

  it('a plain status change, a task, a grant, a milestone and a legacy row carry no extra badge', () => {
    expect(render(task()).extraBadge).toBeNull();
    expect(render(grant()).extraBadge).toBeNull();
    expect(render(invoice({}, { to: 'pending', from: 'claimed' })).extraBadge).toBeNull();
    expect(render(milestone()).extraBadge).toBeNull();
    const legacy = makeEntry({
      entryType: 'invoice_status',
      title: 'Old title',
      body: 'Old body',
      metadata: null,
    });
    expect(render(legacy).extraBadge).toBeNull();
  });
});

describe('renderSystemEvent: submission (batch) view', () => {
  it('names the count and amount in the sentence and the invoice numbers in the detail', () => {
    const view = render(submission());
    expect(view.kind).toBe('submission');
    expect(view.typeLabel).toBe('Invoice status');
    expect(view.extraBadge).toBe('Submission');
    expect(view.sentence).toBe('2 invoices submitted to the bank, €1,500.00');
    expect(view.detail).toBe('Invoices T-001, T-002');
    expect(view.heading).toBeNull();
    expect(view.isLegacyText).toBe(false);
    expect(view.removed).toBe(false);
  });

  it('uses the singular for one invoice', () => {
    const view = render(submission({ invoiceCount: 1, invoiceLabels: ['T-001'] }));
    expect(view.sentence).toBe('1 invoice submitted to the bank, €1,500.00');
    expect(view.detail).toBe('Invoice T-001');
  });

  it('drops the amount from the sentence when the batch has none', () => {
    expect(render(submission({ amount: null })).sentence).toBe('2 invoices submitted to the bank');
    const one = submission({ amount: null, invoiceCount: 1, invoiceLabels: ['T-001'] });
    expect(render(one).sentence).toBe('1 invoice submitted to the bank');
  });

  it('adds "and N more" when the batch has more invoices than labels', () => {
    const view = render(
      submission({ invoiceCount: 5, invoiceLabels: ['T-001', 'T-002', 'T-003'] }),
    );
    expect(view.sentence).toBe('5 invoices submitted to the bank, €1,500.00');
    expect(view.detail).toBe('Invoices T-001, T-002, T-003 and 2 more');
  });

  it('shows "(no number)" for an invoice without a number', () => {
    expect(render(submission({ invoiceLabels: ['T-001', null] })).detail).toBe(
      'Invoices T-001, (no number)',
    );
  });

  it('links to the bank report of the funding source when it still exists', () => {
    expect(render(submission()).link).toEqual({
      to: '/budget/reports?sourceId=src-1',
      label: 'Open Bank A',
      ariaLabel: 'Open Bank A',
    });
  });

  it('has no link and is not "removed" when the batch names no source', () => {
    const view = render(
      submission({ budgetSourceId: null, budgetSourceName: null, budgetSourceExists: null }),
    );
    expect(view.link).toBeNull();
    expect(view.removed).toBe(false);
  });

  it('shows "removed" with no link when the funding source was deleted', () => {
    const view = render(submission({ budgetSourceName: null, budgetSourceExists: false }));
    expect(view.link).toBeNull();
    expect(view.removed).toBe(true);
  });

  it('renders in German', () => {
    const view = render(submission(), 'de');
    expect(view.extraBadge).toBe('Einreichung');
    expect(view.typeLabel).toBe('Rechnungsstatus');
  });
});

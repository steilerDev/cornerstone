/**
 * Unit tests for client/src/components/reports/ReportContentEditor.tsx
 *
 * Story #1900. Renders effective (overrides pre-applied) ReportContent: an optional cover-letter
 * card, a desktop table, a mobile card list, summary rows, and read-only footnotes. It performs NO
 * state management — onFieldChange/onFieldReset are called with the field's override key and the
 * component derives `isEdited` purely from `key in overrides`.
 *
 * QA re-verification round (story #1900 fix batch): two prior production defects are now fixed
 * and covered here as regression guards instead of intentionally-failing BUG tests:
 *
 *  1. Mobile card layout: ReportContentEditor.tsx now renders a `.mobileCardList` of `.mobileCard`
 *     rows (one per `content.rows` entry) alongside the desktop `<table>`, mirroring the
 *     desktop-table/mobile-card CSS-only responsive pattern used elsewhere (see
 *     ReportInvoiceList/WizardStepper) — BOTH trees are always present in the DOM (no JS viewport
 *     branch); only `@media (max-width: 767px)` toggles which one is visible. Because jsdom does
 *     not evaluate CSS media queries, every row's content (vendor, amounts, usage text, etc.) now
 *     appears TWICE in the rendered tree — once in the desktop `<table class="table">` and once in
 *     the mobile `.mobileCardList`. Tests that assert on row content therefore scope queries with
 *     `within(table)` or `within(mobileList)` to disambiguate, per the same pattern used in
 *     WizardStepper.test.tsx.
 *
 *     CSS FINDING (reported separately, not fixable from a test file): unlike ReportInvoiceList's
 *     and WizardStepper's `.module.css` files, ReportContentEditor.module.css has no *base* rule
 *     setting `.mobileCardList { display: none; }` outside the `@media (max-width: 767px)` block —
 *     only `.table { display: none; }` is set inside that block. A plain `<div>` defaults to
 *     `display: block`, so on real desktop/tablet viewports (>767px) the mobile card list would
 *     render VISIBLY beneath the desktop table, duplicating every row's content on screen. This is
 *     undetectable via jsdom (no real CSS cascade is computed here) and is out of scope to fix from
 *     a test file — flagged as a bug finding instead.
 *
 *  2. Status badge coloring: the table's Badge is now invoked as `<Badge value={row.status}
 *     variants={statusBadgeVariants} />` — the RAW status ('pending'/'paid'/'claimed'/'quotation'),
 *     not the pre-translated `row.statusText`. `statusBadgeVariants` is keyed by that same raw
 *     status, so `variants[row.status]` now matches and the badge's rendered label comes from
 *     `variant.label` (i.e. `t('sources.lines.invoiceStatus.<status>')`) with the correct
 *     status-specific `className`. `row.statusText` is retained only as a truthiness gate
 *     alongside `row.status`, not rendered directly.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { ReportContent, ReportContentRow } from '../../lib/reportContent/index.js';
import { ReportContentEditor } from './ReportContentEditor.js';
import styles from './ReportContentEditor.module.css';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

function makeRow(overrides: Partial<ReportContentRow> = {}): ReportContentRow {
  return {
    invoiceId: 'inv-1',
    vendor: 'ACME',
    invoiceNumber: 'INV-001',
    dateText: '01/10/2026',
    status: null,
    statusText: null,
    invoiceAmountText: '€100.00',
    allocatedAmountValueText: '€100.00',
    allocatedMarkers: '',
    isRefund: false,
    refundNoteText: '',
    usageText: 'Baseline usage',
    attachmentsNote: null,
    ...overrides,
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    tableTitle: 'Title',
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: '01/15/2026',
    },
    coverLetter: null,
    rows: [makeRow()],
    summaryRows: [{ key: 'total', label: 'Total', amountText: '€100.00' }],
    footnotes: [],
    ...overrides,
  };
}

// The desktop `<table class="table">` and the mobile `.mobileCardList` both render the same row
// content unconditionally (CSS-only responsive — see header comment). Scope queries to one tree
// or the other to disambiguate; getDesktopTable() picks the invoice table specifically (there is
// also a separate `.summaryTable` `<table>` for summary rows).
function getDesktopTable(container: HTMLElement): HTMLElement {
  return container.querySelector('table.table') as HTMLElement;
}

function getMobileList(container: HTMLElement): HTMLElement {
  return container.querySelector(`.${styles.mobileCardList}`) as HTMLElement;
}

function renderEditor(overridesProp: Partial<Parameters<typeof ReportContentEditor>[0]> = {}) {
  const onFieldChange = jest.fn();
  const onFieldReset = jest.fn();
  const utils = render(
    <ReportContentEditor
      content={makeContent()}
      overrides={{}}
      onFieldChange={onFieldChange}
      onFieldReset={onFieldReset}
      t={t}
      {...overridesProp}
    />,
  );
  return { ...utils, onFieldChange, onFieldReset };
}

describe('ReportContentEditor — cover letter card', () => {
  it('does not render a cover-letter card when content.coverLetter is null', () => {
    renderEditor({ content: makeContent({ coverLetter: null }) });
    expect(screen.queryByText('sourceReports.editable.coverLetterHeading')).not.toBeInTheDocument();
  });

  it('renders sender/subject/body EditableFields and the read-only dateLine when coverLetter is present', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'The Smiths\n123 Main St',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Subject text',
        body: 'Body text',
        signature: 'The Smiths',
      },
    });
    renderEditor({ content });

    expect(screen.getByText('sourceReports.editable.coverLetterHeading')).toBeInTheDocument();
    expect(screen.getByLabelText('sourceReports.editable.senderLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('sourceReports.editable.subjectLabel')).toBeInTheDocument();
    expect(screen.getByLabelText('sourceReports.editable.bodyLabel')).toBeInTheDocument();
    // dateLine is read-only: rendered as plain text, not an editable input.
    expect(screen.getByText('01/15/2026')).toBeInTheDocument();
    expect(screen.queryByLabelText(/dateLabel/)).not.toBeInTheDocument();
  });

  it('renders the recipient EditableField only when recipient is non-null', () => {
    const withRecipient = makeContent({
      coverLetter: {
        sender: '',
        recipient: '456 Bank Ave',
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: '',
      },
    });
    const { rerender } = renderEditor({ content: withRecipient });
    expect(screen.getByLabelText('sourceReports.editable.recipientLabel')).toBeInTheDocument();

    const withoutRecipient = makeContent({
      coverLetter: {
        sender: '',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: '',
      },
    });
    rerender(
      <ReportContentEditor
        content={withoutRecipient}
        overrides={{}}
        onFieldChange={jest.fn()}
        onFieldReset={jest.fn()}
        t={t}
      />,
    );
    expect(
      screen.queryByLabelText('sourceReports.editable.recipientLabel'),
    ).not.toBeInTheDocument();
  });

  it('renders the reference EditableField only when reference is non-null (distinct from sourceInfo.referenceText)', () => {
    const content = makeContent({
      sourceInfo: {
        sourceName: 'Home Loan',
        sourceTypeText: 'Bank Loan',
        referenceText: 'SOURCE-SEED-REF',
        generatedAtText: '01/15/2026',
      },
      coverLetter: {
        sender: '',
        recipient: null,
        dateLine: '01/15/2026',
        reference: 'LETTER-REF',
        subject: 'S',
        body: 'B',
        signature: '',
      },
    });
    renderEditor({ content });
    const refField = screen.getByLabelText('sourceReports.editable.referenceLabel');
    expect(refField).toHaveValue('LETTER-REF');
  });

  it('calls onFieldChange with the correct coverLetter.<field> key when a letter field changes', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Baseline sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'Baseline subject',
        body: 'Baseline body',
        signature: 'Baseline sender',
      },
    });
    const { onFieldChange } = renderEditor({ content });
    const subjectField = screen.getByLabelText('sourceReports.editable.subjectLabel');
    fireEvent.change(subjectField, { target: { value: 'New subject' } });
    expect(onFieldChange).toHaveBeenCalledWith('coverLetter.subject', 'New subject');
  });

  it('calls onFieldReset with the correct key when a letter field reset button is clicked (edited state)', () => {
    const content = makeContent({
      coverLetter: {
        sender: 'Overridden sender',
        recipient: null,
        dateLine: '01/15/2026',
        reference: null,
        subject: 'S',
        body: 'B',
        signature: 'Overridden sender',
      },
    });
    const { onFieldReset } = renderEditor({
      content,
      overrides: { 'coverLetter.sender': 'Overridden sender' },
    });
    const resetButtons = screen.getAllByRole('button', {
      name: /resetFieldAriaLabel/,
    });
    fireEvent.click(resetButtons[0]!);
    expect(onFieldReset).toHaveBeenCalledWith('coverLetter.sender');
  });
});

describe('ReportContentEditor — full field-wiring matrix (onChange + onReset per field)', () => {
  // Each EditableField's onChange/onReset prop is itself an inline arrow function whose BODY is a
  // distinct statement from the JSX attribute assignment that creates it — coverage only counts
  // the body as hit once the callback actually fires. This block exercises every editable field
  // (both cover-letter and per-row) via both onChange and onReset, closing that gap explicitly
  // rather than relying on it being incidentally covered by the behavior-focused tests above.
  function fullContent(): ReportContent {
    return makeContent({
      coverLetter: {
        sender: 'Sender baseline',
        recipient: 'Recipient baseline',
        dateLine: '01/15/2026',
        reference: 'Reference baseline',
        subject: 'Subject baseline',
        body: 'Body baseline',
        signature: 'Sender baseline',
      },
      rows: [makeRow({ invoiceId: 'inv-1', attachmentsNote: 'Note baseline' })],
    });
  }

  it.each([
    ['coverLetter.sender', 'sourceReports.editable.senderLabel'],
    ['coverLetter.recipient', 'sourceReports.editable.recipientLabel'],
    ['coverLetter.reference', 'sourceReports.editable.referenceLabel'],
    ['coverLetter.subject', 'sourceReports.editable.subjectLabel'],
    ['coverLetter.body', 'sourceReports.editable.bodyLabel'],
  ])('calls onFieldChange("%s", ...) when that letter field is edited', (key, labelKey) => {
    const { onFieldChange } = renderEditor({ content: fullContent() });
    const field = screen.getByLabelText(labelKey);
    fireEvent.change(field, { target: { value: 'edited value' } });
    expect(onFieldChange).toHaveBeenCalledWith(key, 'edited value');
  });

  it.each([
    ['coverLetter.sender', 'sourceReports.editable.senderLabel'],
    ['coverLetter.recipient', 'sourceReports.editable.recipientLabel'],
    ['coverLetter.reference', 'sourceReports.editable.referenceLabel'],
    ['coverLetter.subject', 'sourceReports.editable.subjectLabel'],
    ['coverLetter.body', 'sourceReports.editable.bodyLabel'],
  ])('calls onFieldReset("%s") when that letter field\'s reset button is clicked', (key) => {
    const { onFieldReset } = renderEditor({
      content: fullContent(),
      overrides: { [key]: 'edited value' },
    });
    const resetButtons = screen.getAllByRole('button', { name: /resetFieldAriaLabel/ });
    // Every rendered field is edited (all keys present in overrides), so click each in turn and
    // confirm the specific key under test is among the calls made.
    for (const btn of resetButtons) fireEvent.click(btn);
    expect(onFieldReset).toHaveBeenCalledWith(key);
  });

  it('calls onFieldChange for the row-level attachmentsNote field', () => {
    const { onFieldChange, container } = renderEditor({ content: fullContent() });
    const table = getDesktopTable(container);
    const field = within(table).getByDisplayValue('Note baseline');
    fireEvent.change(field, { target: { value: 'edited note' } });
    expect(onFieldChange).toHaveBeenCalledWith('row.inv-1.attachmentsNote', 'edited note');
  });

  it('calls onFieldReset for the row-level usageText field', () => {
    const content = fullContent();
    const { onFieldReset, container } = renderEditor({
      content,
      overrides: { 'row.inv-1.usageText': content.rows[0]!.usageText },
    });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue(content.rows[0]!.usageText);
    const resetBtn = usageInput.parentElement!.parentElement!.querySelector(
      'button',
    ) as HTMLElement;
    fireEvent.click(resetBtn);
    expect(onFieldReset).toHaveBeenCalledWith('row.inv-1.usageText');
  });
});

describe('ReportContentEditor — table rows', () => {
  it('renders exactly one <tr> per content.rows entry, matching vendor/invoiceNumber/date', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'ACME', invoiceNumber: 'A-1' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Beta', invoiceNumber: 'B-2' }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(within(table).getByText('ACME')).toBeInTheDocument();
    expect(within(table).getByText('A-1')).toBeInTheDocument();
    expect(within(table).getByText('Beta')).toBeInTheDocument();
    expect(within(table).getByText('B-2')).toBeInTheDocument();
  });

  it('renders invoiceAmountText/allocatedAmountValueText as plain text cells, never as inputs', () => {
    const rows = [makeRow({ invoiceAmountText: '€777.00', allocatedAmountValueText: '€555.00' })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('€777.00')).toBeInTheDocument();
    expect(within(table).getByText('€555.00')).toBeInTheDocument();
    // No <input>/<textarea> exists that carries either amount as its value.
    expect(within(table).queryByDisplayValue('€777.00')).not.toBeInTheDocument();
    expect(within(table).queryByDisplayValue('€555.00')).not.toBeInTheDocument();
  });

  it('composes the allocated cell as valueText + markers + refund note when isRefund', () => {
    const rows = [
      makeRow({
        allocatedAmountValueText: '€-200.00',
        allocatedMarkers: '†1',
        isRefund: true,
        refundNoteText: '(refund)',
      }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('€-200.00†1 (refund)')).toBeInTheDocument();
  });

  it('renders a Usage EditableField per row, wired to row.<invoiceId>.usageText', () => {
    const rows = [makeRow({ invoiceId: 'inv-9', usageText: 'Kitchen work' })];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue('Kitchen work');
    expect(usageInput.tagName).toBe('INPUT');
  });

  it('marks the usage field as edited (edited-dot present) only when its override key exists', () => {
    const rows = [makeRow({ invoiceId: 'inv-9', usageText: 'Edited usage' })];
    const { container } = renderEditor({
      content: makeContent({ rows }),
      overrides: { 'row.inv-9.usageText': 'Edited usage' },
    });
    expect(container.querySelector('.editedDot')).toBeInTheDocument();
  });

  it('does not mark the usage field as edited when no override key exists for it', () => {
    const rows = [makeRow({ invoiceId: 'inv-9' })];
    const { container } = renderEditor({ content: makeContent({ rows }), overrides: {} });
    expect(container.querySelector('.editedDot')).not.toBeInTheDocument();
  });

  it('renders no Status column/badge when isOverview is false', () => {
    const rows = [makeRow({ statusText: null })];
    renderEditor({ content: makeContent({ isOverview: false, rows }) });
    expect(screen.queryByText('sourceReports.table.status')).not.toBeInTheDocument();
  });

  it('renders a Status column and a Badge whose label comes from statusBadgeVariants[row.status], not row.statusText', () => {
    // row.status is the raw value fed to Badge; row.statusText is only a truthiness gate now.
    const rows = [makeRow({ status: 'paid', statusText: 'Paid' })];
    const { container } = renderEditor({ content: makeContent({ isOverview: true, rows }) });
    const table = getDesktopTable(container);
    expect(within(table).getByText('sourceReports.table.status')).toBeInTheDocument();
    // Badge renders variants['paid'].label = t('sources.lines.invoiceStatus.paid'), NOT the
    // pre-translated row.statusText ("Paid") — the mock t() returns the raw key verbatim.
    expect(within(table).getByText('sources.lines.invoiceStatus.paid')).toBeInTheDocument();
    expect(within(table).queryByText('Paid')).not.toBeInTheDocument();
  });

  it('gives the status Badge the status-specific className via the raw row.status key (regression guard — previously mismatched against row.statusText)', () => {
    const rows = [makeRow({ status: 'paid', statusText: 'Paid' })];
    const { container } = renderEditor({ content: makeContent({ isOverview: true, rows }) });
    const table = getDesktopTable(container);
    const badge = within(table).getByText('sources.lines.invoiceStatus.paid');
    expect(badge.className).toContain(styles.statusPaid);
  });

  it('renders an Attachments Note column and EditableField only for rows with a non-null note', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', attachmentsNote: '1 attachment: Invoice' }),
      makeRow({ invoiceId: 'inv-2', attachmentsNote: null }),
    ];
    const { container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    expect(
      within(table).getByText('sourceReports.editable.attachmentsNoteLabel'),
    ).toBeInTheDocument();
    expect(within(table).getByDisplayValue('1 attachment: Invoice')).toBeInTheDocument();
  });

  it('omits the Attachments Note column entirely when no row has a non-null note', () => {
    const rows = [makeRow({ attachmentsNote: null })];
    renderEditor({ content: makeContent({ rows }) });
    expect(
      screen.queryByText('sourceReports.editable.attachmentsNoteLabel'),
    ).not.toBeInTheDocument();
  });

  it('calls onFieldChange with the correct row.<invoiceId>.usageText key on edit', () => {
    const rows = [makeRow({ invoiceId: 'inv-42', usageText: 'Baseline' })];
    const { onFieldChange, container } = renderEditor({ content: makeContent({ rows }) });
    const table = getDesktopTable(container);
    const usageInput = within(table).getByDisplayValue('Baseline');
    fireEvent.change(usageInput, { target: { value: 'Changed' } });
    expect(onFieldChange).toHaveBeenCalledWith('row.inv-42.usageText', 'Changed');
  });

  it('calls onFieldReset with the correct row.<invoiceId>.attachmentsNote key on reset (desktop table)', () => {
    const rows = [makeRow({ invoiceId: 'inv-42', attachmentsNote: 'Edited note' })];
    const { onFieldReset, container } = renderEditor({
      content: makeContent({ rows }),
      overrides: { 'row.inv-42.attachmentsNote': 'Edited note' },
    });
    const table = getDesktopTable(container);
    const resetButtons = within(table).getAllByRole('button', { name: /resetFieldAriaLabel/ });
    fireEvent.click(resetButtons[resetButtons.length - 1]!);
    expect(onFieldReset).toHaveBeenCalledWith('row.inv-42.attachmentsNote');
  });

  it('calls onFieldReset with the correct row.<invoiceId>.attachmentsNote key on reset (mobile card)', () => {
    const rows = [makeRow({ invoiceId: 'inv-42', attachmentsNote: 'Edited note' })];
    const { onFieldReset, container } = renderEditor({
      content: makeContent({ rows }),
      overrides: { 'row.inv-42.attachmentsNote': 'Edited note' },
    });
    const mobileList = getMobileList(container);
    const resetButtons = within(mobileList).getAllByRole('button', {
      name: /resetFieldAriaLabel/,
    });
    fireEvent.click(resetButtons[resetButtons.length - 1]!);
    expect(onFieldReset).toHaveBeenCalledWith('row.inv-42.attachmentsNote');
  });
});

describe('ReportContentEditor — summary rows and footnotes', () => {
  it('renders each summaryRow as a plain (non-editable) row with label and amount', () => {
    const content = makeContent({
      // Distinct amount strings from the default row's own €100.00 to avoid ambiguous matches
      // against the table body (which also renders the fixture row's amount cells).
      summaryRows: [
        { key: 'subtotal-paid', label: 'Paid Subtotal', amountText: '€150.00' },
        { key: 'total', label: 'Total', amountText: '€550.00' },
      ],
    });
    renderEditor({ content });
    expect(screen.getByText('Paid Subtotal')).toBeInTheDocument();
    expect(screen.getByText('€150.00')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('€550.00')).toBeInTheDocument();
  });

  it('renders no summary table when summaryRows is empty', () => {
    const content = makeContent({ summaryRows: [] });
    const { container } = renderEditor({ content });
    expect(container.querySelector('table + table')).not.toBeInTheDocument();
  });

  it('renders each footnote with its marker and text, read-only', () => {
    const content = makeContent({
      footnotes: [
        { id: 'split-1', marker: '†1', text: 'ACME (A-1) — split footnote' },
        { id: 'deposit-1', marker: '‡1', text: 'Beta (B-2) — deposit footnote' },
      ],
    });
    renderEditor({ content });
    expect(screen.getByText('†1:')).toBeInTheDocument();
    expect(screen.getByText(/ACME \(A-1\) — split footnote/)).toBeInTheDocument();
    expect(screen.getByText('‡1:')).toBeInTheDocument();
  });

  it('renders no footnotes block when footnotes is empty', () => {
    const content = makeContent({ footnotes: [] });
    renderEditor({ content });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe(
  'ReportContentEditor — mobile card list (CSS-only responsive, ' +
    'always rendered alongside the desktop table — see header comment)',
  () => {
    it('renders one .mobileCard per content.rows entry with visible field labels', () => {
      const rows = [
        makeRow({
          invoiceId: 'inv-1',
          vendor: 'ACME',
          invoiceNumber: 'A-1',
          dateText: '01/10/2026',
          invoiceAmountText: '€777.00',
          allocatedAmountValueText: '€555.00',
          usageText: 'Kitchen work',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const mobileList = getMobileList(container);
      expect(mobileList).not.toBeNull();
      expect(mobileList.querySelectorAll(`.${styles.mobileCard}`)).toHaveLength(1);

      const card = within(mobileList);
      expect(card.getByText('sourceReports.table.vendor')).toBeInTheDocument();
      expect(card.getByText('ACME')).toBeInTheDocument();
      expect(card.getByText('sourceReports.table.invoiceNumber')).toBeInTheDocument();
      expect(card.getByText('A-1')).toBeInTheDocument();
      expect(card.getByText('sourceReports.table.date')).toBeInTheDocument();
      expect(card.getByText('01/10/2026')).toBeInTheDocument();
      expect(card.getByText('sourceReports.table.invoiceAmount')).toBeInTheDocument();
      expect(card.getByText('€777.00')).toBeInTheDocument();
      expect(card.getByText('sourceReports.table.allocatedAmount')).toBeInTheDocument();
      expect(card.getByText('€555.00')).toBeInTheDocument();
      expect(card.getByText('sourceReports.table.usage')).toBeInTheDocument();
      expect(card.getByDisplayValue('Kitchen work')).toBeInTheDocument();
    });

    it('renders the mobile card Status label/Badge and Attachments Note field consistently with the desktop table', () => {
      const rows = [
        makeRow({
          invoiceId: 'inv-1',
          status: 'paid',
          statusText: 'Paid',
          attachmentsNote: '1 attachment: Invoice',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ isOverview: true, rows }) });
      const card = within(getMobileList(container));
      expect(card.getByText('sourceReports.table.status')).toBeInTheDocument();
      expect(card.getByText('sources.lines.invoiceStatus.paid')).toBeInTheDocument();
      expect(card.getByText('sourceReports.editable.attachmentsNoteLabel')).toBeInTheDocument();
      expect(card.getByDisplayValue('1 attachment: Invoice')).toBeInTheDocument();
    });

    it('omits the mobile card Status row when isOverview is false, mirroring the desktop table', () => {
      const rows = [makeRow({ invoiceId: 'inv-1', status: null, statusText: null })];
      const { container } = renderEditor({ content: makeContent({ isOverview: false, rows }) });
      const card = within(getMobileList(container));
      expect(card.queryByText('sourceReports.table.status')).not.toBeInTheDocument();
    });

    it('omits the mobile card Attachments Note row when the row has no note', () => {
      const rows = [makeRow({ invoiceId: 'inv-1', attachmentsNote: null })];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));
      expect(
        card.queryByText('sourceReports.editable.attachmentsNoteLabel'),
      ).not.toBeInTheDocument();
    });

    it('composes the mobile card allocated amount as valueText + markers + refund note when isRefund, matching the desktop cell', () => {
      const rows = [
        makeRow({
          allocatedAmountValueText: '€-200.00',
          allocatedMarkers: '†1',
          isRefund: true,
          refundNoteText: '(refund)',
        }),
      ];
      const { container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));
      expect(card.getByText('€-200.00†1 (refund)')).toBeInTheDocument();
    });

    it('wires the mobile card usage/attachmentsNote EditableFields to the same onFieldChange keys as the desktop table', () => {
      const rows = [
        makeRow({
          invoiceId: 'inv-7',
          usageText: 'Baseline usage',
          attachmentsNote: 'Baseline note',
        }),
      ];
      const { onFieldChange, container } = renderEditor({ content: makeContent({ rows }) });
      const card = within(getMobileList(container));

      const usageInput = card.getByDisplayValue('Baseline usage');
      fireEvent.change(usageInput, { target: { value: 'Changed usage' } });
      expect(onFieldChange).toHaveBeenCalledWith('row.inv-7.usageText', 'Changed usage');

      const noteInput = card.getByDisplayValue('Baseline note');
      fireEvent.change(noteInput, { target: { value: 'Changed note' } });
      expect(onFieldChange).toHaveBeenCalledWith('row.inv-7.attachmentsNote', 'Changed note');
    });

    it('wires the mobile card usage reset button to the same onFieldReset key as the desktop table', () => {
      const rows = [makeRow({ invoiceId: 'inv-7', usageText: 'Baseline usage' })];
      const { onFieldReset, container } = renderEditor({
        content: makeContent({ rows }),
        overrides: { 'row.inv-7.usageText': 'Baseline usage' },
      });
      const card = within(getMobileList(container));
      const usageInput = card.getByDisplayValue('Baseline usage');
      const resetBtn = usageInput.parentElement!.parentElement!.querySelector(
        'button',
      ) as HTMLElement;
      fireEvent.click(resetBtn);
      expect(onFieldReset).toHaveBeenCalledWith('row.inv-7.usageText');
    });
  },
);

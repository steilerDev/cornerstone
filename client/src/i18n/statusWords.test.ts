import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * AC5 + AC7 (#2195): one word per status concept, in both locales.
 * Locale files are read from disk (not imported) so the walk covers every namespace file.
 *
 * Mutation per assertion (revert and the named test must fail):
 *  - en `invoices.summaryPending` back to "Pending"        -> "no en value contains a legacy status word"
 *  - de `statusVocabulary.purchase.scheduled` = "Geplant"   -> "planned and scheduled differ (de)"
 *  - en `statusVocabulary.invoice.claimed` = "Claimed"      -> "canonical invoice words"
 *  - re-add `householdItems:status` to de                   -> "deleted legacy keys are gone"
 */
const i18nRoot = path.dirname(fileURLToPath(import.meta.url));

type Json = string | { [key: string]: Json };

function loadLocale(locale: 'en' | 'de'): Record<string, Json> {
  const dir = path.join(i18nRoot, locale);
  const result: Record<string, Json> = {};
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.json')) {
      result[file.replace(/\.json$/, '')] = JSON.parse(
        fs.readFileSync(path.join(dir, file), 'utf8'),
      ) as Json;
    }
  }
  return result;
}

function flatten(node: Json, prefix: string, out: Map<string, string>): void {
  if (typeof node === 'string') {
    out.set(prefix, node);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

function flatLocale(locale: 'en' | 'de'): Map<string, string> {
  const out = new Map<string, string>();
  for (const [ns, tree] of Object.entries(loadLocale(locale))) flatten(tree, ns, out);
  return out;
}

const en = flatLocale('en');
const de = flatLocale('de');

describe('canonical invoice words (AC7)', () => {
  it('en: To pay / Paid / Submitted / Offer', () => {
    expect(en.get('common.statusVocabulary.invoice.pending')).toBe('To pay');
    expect(en.get('common.statusVocabulary.invoice.paid')).toBe('Paid');
    expect(en.get('common.statusVocabulary.invoice.claimed')).toBe('Submitted');
    expect(en.get('common.statusVocabulary.invoice.quotation')).toBe('Offer');
  });

  it('de: Zu zahlen / Bezahlt / Eingereicht / Angebot', () => {
    expect(de.get('common.statusVocabulary.invoice.pending')).toBe('Zu zahlen');
    expect(de.get('common.statusVocabulary.invoice.paid')).toBe('Bezahlt');
    expect(de.get('common.statusVocabulary.invoice.claimed')).toBe('Eingereicht');
    expect(de.get('common.statusVocabulary.invoice.quotation')).toBe('Angebot');
  });
});

describe('no legacy invoice status word in any en value (AC7)', () => {
  const BANNED = /\b(pending|claimed|claimable|unclaimed)\b/i;

  it('no en value contains pending / claimed / claimable / unclaimed', () => {
    const offenders = [...en].filter(([, value]) => BANNED.test(value)).map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('the checked set is non-trivial (guards against an empty walk)', () => {
    expect(en.size).toBeGreaterThan(1000);
  });

  it('the specific rewritten summary labels and banners use the new words', () => {
    expect(en.get('budget.invoices.summaryPending')).toBe('To pay');
    expect(en.get('budget.invoices.summaryClaimed')).toBe('Submitted');
    expect(en.get('budget.invoices.summaryClaimable')).toBe('Ready to submit');
    expect(en.get('budget.invoices.summaryQuotation')).toBe('Offers');
    expect(en.get('budget.sources.barChart.claimed')).toBe('Submitted');
    expect(en.get('budget.sourceReports.confirmClaimTitle')).toBe('Mark invoices as submitted?');
    expect(en.get('common.statusAction.progressPayment.markSubmitted')).toBe('Mark submitted');
    expect(en.get('errors.INVOICES_NOT_CLAIMABLE')).toContain('marked as submitted');
    expect(en.get('common.statusVocabulary.milestone.upcoming')).toBe('Upcoming');
    expect(en.get('common.statusVocabulary.milestone.reached')).toBe('Reached');
    expect(de.get('common.statusVocabulary.milestone.upcoming')).toBe('Anstehend');
    expect(en.has('schedule.milestones.status.pending')).toBe(false);
    expect(de.has('schedule.milestones.status.pending')).toBe(false);
    expect(en.get('workItems.create.pendingDeps.ariaLabel')).toBe('Dependencies to add');
  });
});

describe('no "ausstehend" status word in de values (AC7)', () => {
  const BANNED_DE = /\bausstehend\w*\b/i;

  it('only keys whose en value says "Outstanding" may keep it', () => {
    const offenders = [...de]
      .filter(([, value]) => BANNED_DE.test(value))
      .filter(([key]) => !/\boutstanding\b/i.test(en.get(key) ?? ''))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it('the Outstanding exception list is the three company-figure keys, not a loophole', () => {
    const exempt = [...de]
      .filter(([, value]) => BANNED_DE.test(value))
      .map(([key]) => key)
      .sort();
    for (const key of exempt) {
      expect(en.get(key)).toMatch(/\boutstanding\b/i);
    }
    expect(exempt.length).toBeLessThanOrEqual(6);
  });
});

describe('D-32: planned and scheduled are different words (AC5)', () => {
  it('en', () => {
    expect(en.get('common.statusVocabulary.purchase.planned')).not.toBe(
      en.get('common.statusVocabulary.purchase.scheduled'),
    );
  });

  it('de', () => {
    expect(de.get('common.statusVocabulary.purchase.planned')).toBeDefined();
    expect(de.get('common.statusVocabulary.purchase.planned')).not.toBe(
      de.get('common.statusVocabulary.purchase.scheduled'),
    );
    expect(de.get('common.statusVocabulary.purchase.planned')).toBe('Geplant');
    expect(de.get('common.statusVocabulary.purchase.scheduled')).toBe('Lieferung geplant');
  });

  it('the four purchase words are pairwise distinct in each locale', () => {
    for (const map of [en, de]) {
      const words = ['planned', 'purchased', 'scheduled', 'arrived'].map((s) =>
        map.get(`common.statusVocabulary.purchase.${s}`),
      );
      expect(new Set(words).size).toBe(4);
    }
  });
});

describe('deleted legacy status keys are gone from both locales (#2195)', () => {
  const DELETED_PREFIXES = [
    'budget.sources.lines.invoiceStatus.pending',
    'budget.sources.lines.invoiceStatus.paid',
    'budget.sources.lines.invoiceStatus.claimed',
    'budget.sources.lines.invoiceStatus.quotation',
    'budget.invoices.statusLabels',
    'budget.invoiceDetail.statusLabels',
    'budget.vendorDetail.invoiceStatusLabels',
    'budget.vendorDetail.invoiceForm.statusPending',
    'budget.vendorDetail.invoiceForm.statusPaid',
    'budget.vendorDetail.invoiceForm.statusClaimed',
    'budget.vendorDetail.invoiceForm.statusQuotation',
    'budget.subsidies.statusLabels',
    'budget.sourceReports.markClaimed',
    'budget.invoices.form.placeholders.amount',
    'budget.invoiceDetail.deposits.form.amountPlaceholder',
    'dashboard.cards.subsidyPipeline.statuses',
    'householdItems.status',
    'householdItems.detail.status.planned',
    'householdItems.detail.status.purchased',
    'householdItems.detail.status.scheduled',
    'householdItems.detail.status.arrived',
    'workItems.create.fields.statusOptions',
    'workItems.detail.statusOptions',
    'workItems.detail.householdItems.statuses',
    'schedule.gantt.tooltip.status',
    'schedule.gantt.status',
    'schedule.milestones.status',
    'schedule.milestones.detail.view.status',
    'diary.entryTypeChips',
    'diary.entryTypes.daily_log',
    'diary.entryTypes.site_visit',
    'diary.entryTypes.delivery',
    'diary.entryTypes.issue',
    'diary.entryTypes.general_note',
    'diary.createPage.typeCardDaily',
    'diary.createPage.typeCardSiteVisit',
    'diary.createPage.typeCardDelivery',
    'diary.createPage.typeCardIssue',
    'diary.createPage.typeCardGeneralNote',
  ];

  it.each(['en', 'de'] as const)('%s has none of the deleted keys', (locale) => {
    const map = locale === 'en' ? en : de;
    const present = DELETED_PREFIXES.filter((prefix) =>
      [...map.keys()].some((key) => key === prefix || key.startsWith(`${prefix}.`)),
    );
    expect(present).toEqual([]);
  });

  it('the automatic diary entry types and the type-card descriptions are kept', () => {
    for (const map of [en, de]) {
      expect(map.has('diary.entryTypes.work_item_status')).toBe(true);
      expect(map.has('diary.createPage.typeCardDailyDesc')).toBe(true);
    }
  });
});

describe('Step 5 plural keys exist in both locales with one/other forms (AC6)', () => {
  const PLURAL_BASES = [
    'budget.sourceReports.markSubmitted',
    'budget.sourceReports.invoiceCount',
    'budget.sourceReports.progressPaymentCount',
    'budget.sourceReports.confirmClaimBody',
    'budget.sourceReports.confirmClaimExcludedItemsWarning',
  ];

  it.each(['en', 'de'] as const)('%s has _one and _other for every plural key', (locale) => {
    const map = locale === 'en' ? en : de;
    for (const base of PLURAL_BASES) {
      expect(map.get(`${base}_one`)).toBeTruthy();
      expect(map.get(`${base}_other`)).toBeTruthy();
    }
    expect(map.get('budget.sourceReports.markSubmittedNone')).toBeTruthy();
  });

  it('en wording', () => {
    expect(en.get('budget.sourceReports.markSubmitted_one')).toBe(
      'Mark {{count}} invoice as submitted',
    );
    expect(en.get('budget.sourceReports.markSubmitted_other')).toBe(
      'Mark {{count}} invoices as submitted',
    );
  });

  it('de wording says eingereicht', () => {
    expect(de.get('budget.sourceReports.markSubmitted_one')).toMatch(/eingereicht/);
    expect(de.get('budget.sourceReports.markSubmitted_other')).toMatch(/eingereicht/);
  });
});

describe('AC4: no US-dollar labels and no fake money placeholders', () => {
  it('Sources "Total amount" and Subsidies "Value" carry no currency symbol', () => {
    expect(en.get('budget.sources.form.totalAmount')).toBe('Total amount');
    expect(en.get('budget.subsidies.form.valueFixed')).toBe('Value');
    expect(de.get('budget.sources.form.totalAmount')).toBe('Gesamtbetrag');
    expect(de.get('budget.subsidies.form.valueFixed')).toBe('Wert');
  });

  it('no en/de value contains a "($)" label', () => {
    for (const map of [en, de]) {
      const offenders = [...map].filter(([, v]) => v.includes('($)')).map(([k]) => k);
      expect(offenders).toEqual([]);
    }
  });
});

/**
 * AC3 pin: the en use-case helper text names exactly the invoice statuses the server includes for
 * that report type (shared REPORT_TYPE_INVOICE_STATUSES), in the status words the UI shows
 * (common statusVocabulary.invoice, "Offer" for quotation).
 *
 * Mutations caught: dropping or adding a status in the shared const, rewording a helper so it
 * names a different status set.
 */
import { describe, it, expect } from '@jest/globals';
import { REPORT_TYPE_INVOICE_STATUSES, SOURCE_REPORT_TYPES } from '@cornerstone/shared';
import type { SourceReportType } from '@cornerstone/shared';
import enBudget from '../../i18n/en/budget.json';
import enCommon from '../../i18n/en/common.json';

type InvoiceStatus = 'quotation' | 'pending' | 'paid' | 'claimed';
const ALL_STATUSES: readonly InvoiceStatus[] = ['quotation', 'pending', 'paid', 'claimed'];

const vocabulary = enCommon.statusVocabulary.invoice as Record<InvoiceStatus, string>;
const helpers = enBudget.sourceReports.useCaseHelper as Record<SourceReportType, string>;

/** The status word as shown in the UI, lower-cased ("offer" for quotation). */
const word = (status: InvoiceStatus): string => vocabulary[status].toLowerCase();

/** Whole-word (optional plural s), case-insensitive containment: "Offers" names the Offer status. */
const mentions = (text: string, phrase: string): boolean =>
  new RegExp(`(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?($|[^a-z])`, 'i').test(
    text,
  );

describe('use-case helper text vs the shared report status sets (AC3)', () => {
  it('uses the expected status vocabulary words', () => {
    expect(ALL_STATUSES.map(word)).toEqual(['offer', 'to pay', 'paid', 'submitted']);
  });

  it('has a helper for every report type', () => {
    for (const type of SOURCE_REPORT_TYPES) expect(helpers[type]).toBeTruthy();
  });

  describe.each(SOURCE_REPORT_TYPES)('%s', (type) => {
    const included = REPORT_TYPE_INVOICE_STATUSES[type] as readonly InvoiceStatus[];
    const excluded = ALL_STATUSES.filter((s) => !included.includes(s));

    it('names every included status', () => {
      for (const status of included) {
        expect([status, mentions(helpers[type], word(status))]).toEqual([status, true]);
      }
    });

    it('names no excluded status', () => {
      for (const status of excluded) {
        // The claim helper says what is "not yet submitted"; that one mention is pinned below.
        if (type === 'claim' && status === 'claimed') continue;
        expect([status, mentions(helpers[type], word(status))]).toEqual([status, false]);
      }
    });
  });

  it('the claim helper mentions "submitted" only as "not yet submitted"', () => {
    const text = helpers.claim.toLowerCase();
    expect(text).toContain('not yet submitted');
    expect(text.replace('not yet submitted', '')).not.toMatch(/submitted/);
  });
});

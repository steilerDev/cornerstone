/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { act, cleanup, renderHook } from '@testing-library/react';
import i18n from '../i18n/index.js';
import type * as UseDiaryEntryTitleTypes from './useDiaryEntryTitle.js';

// The locale is driven by a plain variable so no LocaleProvider/auth plumbing is needed.
const localeState: { resolved: 'en' | 'de' } = { resolved: 'en' };
jest.unstable_mockModule('../contexts/LocaleContext.js', () => ({
  useLocale: () => ({ resolvedLocale: localeState.resolved, currency: 'EUR' }),
}));

let useDiaryEntryTitle: typeof UseDiaryEntryTitleTypes.useDiaryEntryTitle;

beforeAll(async () => {
  ({ useDiaryEntryTitle } = await import('./useDiaryEntryTitle.js'));
});

afterEach(async () => {
  cleanup();
  localeState.resolved = 'en';
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

const year = new Date().getFullYear();
const thisYearDate = `${year}-03-14`;

type Entry = Parameters<typeof UseDiaryEntryTitleTypes.useDiaryEntryTitle>[0];

function titleOf(entry: Entry): string | null {
  return renderHook(() => useDiaryEntryTitle(entry)).result.current;
}

describe('useDiaryEntryTitle', () => {
  it('returns the trimmed title when one is set', () => {
    // Mutation: dropping .trim() returns "  Synthetic pour  " and fails.
    expect(
      titleOf({ title: '  Synthetic pour  ', entryType: 'daily_log', entryDate: thisYearDate }),
    ).toBe('Synthetic pour');
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('a %s title falls back to "<Type> · <day month>"', (_name, title) => {
    // Mutation: testing `entry.title` truthiness without trim shows "   " for whitespace.
    expect(titleOf({ title, entryType: 'daily_log', entryDate: thisYearDate })).toBe(
      'Daily log · Mar 14',
    );
  });

  it('uses the canonical word of each manual type', () => {
    expect(titleOf({ title: null, entryType: 'issue', entryDate: thisYearDate })).toBe(
      'Defect · Mar 14',
    );
    expect(titleOf({ title: null, entryType: 'site_visit', entryDate: thisYearDate })).toBe(
      'Site visit · Mar 14',
    );
  });

  it('uses the diary automatic label for an automatic type', () => {
    // Mutation: resolving every type through the manual key set yields a missing-key string.
    expect(titleOf({ title: null, entryType: 'work_item_status', entryDate: thisYearDate })).toBe(
      'Task status · Mar 14',
    );
  });

  describe('automatic entries name their subject (#2223)', () => {
    const base = { title: null, entryDate: thisYearDate, isAutomatic: true } as const;
    const status = (metadata: Record<string, unknown>) => ({
      v: 1,
      event: 'status_changed',
      from: 'not_started',
      to: 'completed',
      subjectLabel: 'Snapshot name',
      ...metadata,
    });

    it('uses the live subject name for a task event', () => {
      expect(
        titleOf({
          ...base,
          entryType: 'work_item_status',
          metadata: status({}),
          sourceEntityTitle: 'Kitchen tiling',
        } as Entry),
      ).toBe('Kitchen tiling');
    });

    it('falls back to the snapshot name when the live name is gone', () => {
      expect(
        titleOf({
          ...base,
          entryType: 'work_item_status',
          metadata: status({}),
          sourceEntityTitle: null,
        } as Entry),
      ).toBe('Snapshot name');
    });

    it('headings an invoice event "Invoice <number>"', () => {
      expect(
        titleOf({
          ...base,
          entryType: 'invoice_status',
          metadata: status({ from: 'pending', to: 'paid' }),
          sourceEntityTitle: '2026-014',
        } as Entry),
      ).toBe('Invoice 2026-014');
    });

    it('headings an offer "Offer <number>"', () => {
      expect(
        titleOf({
          ...base,
          entryType: 'invoice_created',
          metadata: {
            v: 1,
            event: 'invoice_created',
            subjectLabel: 'Q-7',
            vendorId: null,
            vendorName: null,
            invoiceStatus: 'quotation',
          },
          sourceEntityTitle: 'Q-7',
        } as Entry),
      ).toBe('Offer Q-7');
    });

    it('a legacy automatic entry keeps its stored title, then the type and date fallback', () => {
      expect(
        titleOf({
          ...base,
          title: 'Stored legacy title',
          entryType: 'budget_breach',
          metadata: null,
        } as Entry),
      ).toBe('Stored legacy title');
      expect(titleOf({ ...base, entryType: 'budget_breach', metadata: null } as Entry)).toBe(
        'Over budget · Mar 14',
      );
    });

    it('ignores a stored title on a v1 event (parameters only)', () => {
      expect(
        titleOf({
          ...base,
          title: 'Tampered English text',
          entryType: 'work_item_status',
          metadata: status({}),
          sourceEntityTitle: 'Kitchen tiling',
        } as Entry),
      ).toBe('Kitchen tiling');
    });

    it('a manual entry with event-like fields is untouched', () => {
      expect(
        titleOf({
          title: null,
          entryType: 'daily_log',
          entryDate: thisYearDate,
          isAutomatic: false,
          sourceEntityTitle: 'Kitchen tiling',
        } as Entry),
      ).toBe('Daily log · Mar 14');
    });
  });

  it('adds the year when the entry is from another year', () => {
    expect(titleOf({ title: null, entryType: 'daily_log', entryDate: '2020-03-14' })).toBe(
      'Daily log · Mar 14, 2020',
    );
  });

  it('follows the locale', async () => {
    localeState.resolved = 'de';
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    const result = titleOf({ title: null, entryType: 'daily_log', entryDate: thisYearDate });
    // Mutation: formatting with a fixed en-US locale drops the German day/month form.
    expect(result).toContain('14.');
    expect(result).not.toContain('Mar 14');
    expect(result).toContain(' · ');
  });

  it('returns null for a null or undefined entry', () => {
    expect(titleOf(null)).toBeNull();
    expect(titleOf(undefined)).toBeNull();
  });

  it('prefers the title over the generated form even for automatic entries', () => {
    expect(
      titleOf({ title: 'Kitchen done', entryType: 'work_item_status', entryDate: thisYearDate }),
    ).toBe('Kitchen done');
  });
});

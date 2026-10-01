import { describe, it, expect } from '@jest/globals';
import {
  ATTACHMENT_TYPES,
  BUDGET_SOURCE_TYPES,
  DIARY_ENTRY_TYPES,
  INVOICE_STATUSES,
  SOURCE_REPORT_TYPES,
} from '@cornerstone/shared';
import enBudget from './en/budget.json';
import enDocuments from './en/documents.json';
import enDiary from './en/diary.json';
import deBudget from './de/budget.json';
import deDocuments from './de/documents.json';
import deDiary from './de/diary.json';
import { I18N_UNION_KEYS } from './unionKeys.js';
import type { UnionKeyNamespace, UnionKeySet } from './unionKeys.js';

// Adding a namespace to UnionKeyNamespace without extending this table fails tsc.
const LOCALE_JSON: Record<UnionKeyNamespace, Record<'en' | 'de', Record<string, unknown>>> = {
  budget: { en: enBudget, de: deBudget },
  documents: { en: enDocuments, de: deDocuments },
  diary: { en: enDiary, de: deDiary },
};

/** Keys whose dot-path does not resolve to a NON-EMPTY STRING leaf (object node or '' = missing). */
function missingKeys(set: UnionKeySet<string>, json: Record<string, unknown>): string[] {
  return set.members
    .map((member) => set.key(member))
    .filter((fullKey) => {
      let node: unknown = json;
      for (const segment of fullKey.split('.')) {
        if (typeof node !== 'object' || node === null) return true;
        node = (node as Record<string, unknown>)[segment];
      }
      return typeof node !== 'string' || node === '';
    });
}

// No `as` cast: compiling proves the method-shorthand typing lets the registry be iterated.
const SETS: UnionKeySet<string>[] = Object.values(I18N_UNION_KEYS);

describe('I18N_UNION_KEYS locale parity (#2029 AC5)', () => {
  const cases = Object.entries(I18N_UNION_KEYS).flatMap(([name, set]) =>
    (['en', 'de'] as const).map((locale) => [name, locale, set] as const),
  );

  it.each(cases)('%s has a non-empty translation for every member in %s', (_name, locale, set) => {
    expect(missingKeys(set, LOCALE_JSON[set.ns][locale])).toEqual([]);
  });

  it('iterates all 8 registered sets', () => {
    expect(SETS).toHaveLength(8);
  });
});

describe('missingKeys guard can fail', () => {
  it('reports a member with no translation key', () => {
    const fake: UnionKeySet<string> = {
      ns: 'budget',
      prefix: 'sourceReports.table.title',
      members: ['claim', 'bogus-member'],
      key: (m) => `sourceReports.table.title.${m}`,
    };
    expect(missingKeys(fake, enBudget)).toEqual(['sourceReports.table.title.bogus-member']);
  });

  it('reports a path that resolves to an object node rather than a string', () => {
    const fake: UnionKeySet<string> = {
      ns: 'budget',
      prefix: 'sourceReports',
      members: ['table'],
      key: (m) => `sourceReports.${m}`,
    };
    expect(missingKeys(fake, enBudget)).toEqual(['sourceReports.table']);
  });

  it('reports an empty-string leaf', () => {
    const fake: UnionKeySet<string> = {
      ns: 'budget',
      prefix: 'a',
      members: ['b'],
      key: (m) => `a.${m}`,
    };
    expect(missingKeys(fake, { a: { b: '' } })).toEqual(['a.b']);
  });

  it('reports a path that runs through a string before the leaf', () => {
    const fake: UnionKeySet<string> = {
      ns: 'budget',
      prefix: 'a',
      members: ['b.c'],
      key: (m) => `a.${m}`,
    };
    expect(missingKeys(fake, { a: { b: 'text' } })).toEqual(['a.b.c']);
  });
});

describe('I18N_UNION_KEYS registry', () => {
  it('iterates the shared runtime tuples by reference', () => {
    expect(I18N_UNION_KEYS.reportTitle.members).toBe(SOURCE_REPORT_TYPES);
    expect(I18N_UNION_KEYS.reportCoverLetterSubject.members).toBe(SOURCE_REPORT_TYPES);
    expect(I18N_UNION_KEYS.reportCoverLetterBody.members).toBe(SOURCE_REPORT_TYPES);
    expect(I18N_UNION_KEYS.reportSourceType.members).toBe(BUDGET_SOURCE_TYPES);
    expect(I18N_UNION_KEYS.invoiceStatus.members).toBe(INVOICE_STATUSES);
    expect(I18N_UNION_KEYS.reportAttachmentType.members).toBe(ATTACHMENT_TYPES);
    expect(I18N_UNION_KEYS.documentAttachmentType.members).toBe(ATTACHMENT_TYPES);
    expect(I18N_UNION_KEYS.diaryEntryType.members).toBe(DIARY_ENTRY_TYPES);
  });

  it('pins namespaces and literal key shapes', () => {
    expect(I18N_UNION_KEYS.reportTitle.ns).toBe('budget');
    expect(I18N_UNION_KEYS.documentAttachmentType.ns).toBe('documents');
    expect(I18N_UNION_KEYS.diaryEntryType.ns).toBe('diary');
    expect(I18N_UNION_KEYS.diaryEntryType.key('general_note')).toBe('entryTypes.general_note');
    expect(I18N_UNION_KEYS.invoiceStatus.key('claimed')).toBe(
      'sources.lines.invoiceStatus.claimed',
    );
    expect(I18N_UNION_KEYS.reportCoverLetterBody.key('proof-of-funds')).toBe(
      'sourceReports.coverLetter.body.proof-of-funds',
    );
    expect(I18N_UNION_KEYS.documentAttachmentType.key('deposit')).toBe(
      'documentCard.attachmentType.deposit',
    );
  });

  it('registers the 8 sets in declaration order', () => {
    expect(Object.keys(I18N_UNION_KEYS)).toEqual([
      'reportTitle',
      'reportCoverLetterSubject',
      'reportCoverLetterBody',
      'reportSourceType',
      'invoiceStatus',
      'reportAttachmentType',
      'documentAttachmentType',
      'diaryEntryType',
    ]);
  });

  it.each(Object.entries(I18N_UNION_KEYS))('freezes key set %s', (_name, set) => {
    expect(Object.isFrozen(set)).toBe(true);
  });
});

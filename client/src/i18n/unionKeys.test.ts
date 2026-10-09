import { describe, it, expect } from '@jest/globals';
import {
  ATTACHMENT_TYPES,
  BUDGET_SOURCE_STATUSES,
  BUDGET_SOURCE_TYPES,
  BUDGET_VERDICTS,
  DIARY_ENTRY_TYPES,
  DIARY_ISSUE_RESOLUTIONS,
  HOUSEHOLD_ITEM_STATUSES,
  INVOICE_DEPOSIT_STATUSES,
  INVOICE_STATUSES,
  MANUAL_DIARY_ENTRY_TYPES,
  MILESTONE_DISPLAY_STATUSES,
  SCHEDULE_SIGNALS,
  SOURCE_REPORT_TYPES,
  SUBSIDY_APPLICATION_STATUSES,
  WORK_ITEM_STATUSES,
} from '@cornerstone/shared';
import enBudget from './en/budget.json';
import enDocuments from './en/documents.json';
import enDiary from './en/diary.json';
import enHouseholdItems from './en/householdItems.json';
import enAuth from './en/auth.json';
import enCommon from './en/common.json';
import deBudget from './de/budget.json';
import deDocuments from './de/documents.json';
import deDiary from './de/diary.json';
import deHouseholdItems from './de/householdItems.json';
import deAuth from './de/auth.json';
import deCommon from './de/common.json';
import { I18N_UNION_KEYS } from './unionKeys.js';
import type { UnionKeyNamespace, UnionKeySet } from './unionKeys.js';

// Adding a namespace to UnionKeyNamespace without extending this table fails tsc.
const LOCALE_JSON: Record<UnionKeyNamespace, Record<'en' | 'de', Record<string, unknown>>> = {
  budget: { en: enBudget, de: deBudget },
  documents: { en: enDocuments, de: deDocuments },
  diary: { en: enDiary, de: deDiary },
  householdItems: { en: enHouseholdItems, de: deHouseholdItems },
  auth: { en: enAuth, de: deAuth },
  common: { en: enCommon, de: deCommon },
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

  it('iterates all 31 registered sets', () => {
    expect(SETS).toHaveLength(31);
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
    expect(I18N_UNION_KEYS.diaryEntryTypeChip.members).toBe(DIARY_ENTRY_TYPES);
  });

  it('pins namespaces and literal key shapes', () => {
    expect(I18N_UNION_KEYS.reportTitle.ns).toBe('budget');
    expect(I18N_UNION_KEYS.documentAttachmentType.ns).toBe('documents');
    expect(I18N_UNION_KEYS.diaryEntryType.ns).toBe('diary');
    expect(I18N_UNION_KEYS.diaryEntryType.key('general_note')).toBe('entryTypes.general_note');
    expect(I18N_UNION_KEYS.diaryEntryTypeChip.ns).toBe('diary');
    expect(I18N_UNION_KEYS.diaryEntryTypeChip.key('general_note')).toBe(
      'entryTypeChips.general_note',
    );
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

  it('registers the 31 sets in declaration order', () => {
    expect(Object.keys(I18N_UNION_KEYS)).toEqual([
      'reportTitle',
      'reportCoverLetterSubject',
      'reportCoverLetterBody',
      'reportSourceType',
      'invoiceStatus',
      'reportAttachmentType',
      'documentAttachmentType',
      'diaryEntryType',
      'diaryEntryTypeChip',
      'reportUseCase',
      'reportUseCaseHelper',
      'invoicesStatusLabel',
      'invoiceDetailStatusLabel',
      'depositEntryType',
      'subsidyApplicationStatus',
      'confidenceLevel',
      'reportSkipReason',
      'householdItemStatus',
      'diarySourceType',
      'oidcLoginError',
      'statusVocabularyInvoice',
      'statusVocabularyProgressPayment',
      'statusVocabularyTask',
      'statusVocabularyScheduleSignal',
      'statusVocabularyPurchase',
      'statusVocabularyMilestone',
      'statusVocabularyGrant',
      'statusVocabularyFundingSource',
      'statusVocabularyDefect',
      'statusVocabularyBudgetVerdict',
      'statusVocabularyDiaryType',
    ]);
  });

  it.each(Object.entries(I18N_UNION_KEYS))('freezes key set %s', (_name, set) => {
    expect(Object.isFrozen(set)).toBe(true);
  });
});

describe('canonical status vocabulary sets (glossary v1, #2192)', () => {
  const VOCABULARIES = [
    ['statusVocabularyInvoice', INVOICE_STATUSES],
    ['statusVocabularyProgressPayment', INVOICE_DEPOSIT_STATUSES],
    ['statusVocabularyTask', WORK_ITEM_STATUSES],
    ['statusVocabularyScheduleSignal', SCHEDULE_SIGNALS],
    ['statusVocabularyPurchase', HOUSEHOLD_ITEM_STATUSES],
    ['statusVocabularyMilestone', MILESTONE_DISPLAY_STATUSES],
    ['statusVocabularyGrant', SUBSIDY_APPLICATION_STATUSES],
    ['statusVocabularyFundingSource', BUDGET_SOURCE_STATUSES],
    ['statusVocabularyDefect', DIARY_ISSUE_RESOLUTIONS],
    ['statusVocabularyBudgetVerdict', BUDGET_VERDICTS],
    ['statusVocabularyDiaryType', MANUAL_DIARY_ENTRY_TYPES],
  ] as const;

  it.each(VOCABULARIES)('%s iterates its shared tuple by reference', (name, tuple) => {
    expect(I18N_UNION_KEYS[name].members).toBe(tuple);
  });

  it.each(VOCABULARIES)(
    'exactly one canonical statusVocabulary set exists for the %s tuple',
    (_name, tuple) => {
      const canonical = Object.values(I18N_UNION_KEYS).filter(
        (set) =>
          (set.members as readonly string[]) === tuple &&
          set.ns === 'common' &&
          set.prefix.startsWith('statusVocabulary.'),
      );
      expect(canonical).toHaveLength(1);
    },
  );

  it('pins the members of the six new tuples (no "tight" budget verdict)', () => {
    expect(INVOICE_DEPOSIT_STATUSES).toEqual(['pending', 'paid', 'claimed']);
    expect(BUDGET_SOURCE_STATUSES).toEqual(['active', 'exhausted', 'closed']);
    expect(DIARY_ISSUE_RESOLUTIONS).toEqual(['open', 'in_progress', 'resolved']);
    expect(SCHEDULE_SIGNALS).toEqual(['late', 'held_up', 'critical']);
    expect(MILESTONE_DISPLAY_STATUSES).toEqual(['upcoming', 'late', 'early', 'reached']);
    expect(BUDGET_VERDICTS).toEqual(['on_budget', 'over_budget']);
    expect(BUDGET_VERDICTS).not.toContain('tight');
  });

  it('puts every set in the common namespace under statusVocabulary.<vocabulary>', () => {
    for (const [name] of VOCABULARIES) {
      expect(I18N_UNION_KEYS[name].ns).toBe('common');
      expect(I18N_UNION_KEYS[name].prefix).toMatch(/^statusVocabulary\.[a-zA-Z]+$/);
    }
  });

  it('derives the key shapes', () => {
    expect(I18N_UNION_KEYS.statusVocabularyScheduleSignal.key('held_up')).toBe(
      'statusVocabulary.scheduleSignal.held_up',
    );
    expect(I18N_UNION_KEYS.statusVocabularyDiaryType.key('issue')).toBe(
      'statusVocabulary.diaryType.issue',
    );
  });

  it('fails when a member has no key in the common namespace', () => {
    const fake: UnionKeySet<string> = {
      ns: 'common',
      prefix: 'statusVocabulary.task',
      members: ['bogus'],
      key: (m) => `statusVocabulary.task.${m}`,
    };
    expect(missingKeys(fake, enCommon)).toEqual(['statusVocabulary.task.bogus']);
    expect(missingKeys(fake, deCommon)).toEqual(['statusVocabulary.task.bogus']);
  });
});

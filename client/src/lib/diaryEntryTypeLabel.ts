import type { DiaryEntryType, ManualDiaryEntryType } from '@cornerstone/shared';
import { MANUAL_DIARY_ENTRY_TYPES } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';
import type { UnionKeyNamespace } from '../i18n/unionKeys.js';

export function isManualDiaryEntryType(type: DiaryEntryType): type is ManualDiaryEntryType {
  return (MANUAL_DIARY_ENTRY_TYPES as readonly string[]).includes(type);
}

/** Namespace + key of the single label for a diary entry type (manual: canonical; automatic: diary). */
export function diaryEntryTypeLabelKey(type: DiaryEntryType): {
  ns: UnionKeyNamespace;
  key: string;
} {
  if (isManualDiaryEntryType(type)) {
    const set = I18N_UNION_KEYS.statusVocabularyDiaryType;
    return { ns: set.ns, key: set.key(type) };
  }
  const set = I18N_UNION_KEYS.diaryAutomaticEntryType;
  return { ns: set.ns, key: set.key(type) };
}

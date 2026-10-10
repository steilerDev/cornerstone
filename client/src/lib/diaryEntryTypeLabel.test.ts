import { describe, it, expect } from '@jest/globals';
import { AUTOMATIC_DIARY_ENTRY_TYPES, MANUAL_DIARY_ENTRY_TYPES } from '@cornerstone/shared';
import enCommon from '../i18n/en/common.json';
import enDiary from '../i18n/en/diary.json';
import { diaryEntryTypeLabelKey, isManualDiaryEntryType } from './diaryEntryTypeLabel.js';

function lookup(resource: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      resource,
    );
}

describe('isManualDiaryEntryType', () => {
  it.each(MANUAL_DIARY_ENTRY_TYPES)('accepts manual type %s', (type) => {
    expect(isManualDiaryEntryType(type)).toBe(true);
  });

  it.each(AUTOMATIC_DIARY_ENTRY_TYPES)('rejects automatic type %s', (type) => {
    expect(isManualDiaryEntryType(type)).toBe(false);
  });
});

describe('diaryEntryTypeLabelKey', () => {
  it.each(MANUAL_DIARY_ENTRY_TYPES)('manual type %s reads the common canonical set', (type) => {
    const { ns, key } = diaryEntryTypeLabelKey(type);
    expect(ns).toBe('common');
    expect(key).toBe(`statusVocabulary.diaryType.${type}`);
    expect(typeof lookup(enCommon, key)).toBe('string');
  });

  it.each(AUTOMATIC_DIARY_ENTRY_TYPES)('automatic type %s reads the diary namespace', (type) => {
    const { ns, key } = diaryEntryTypeLabelKey(type);
    expect(ns).toBe('diary');
    expect(key).toBe(`entryTypes.${type}`);
    expect(typeof lookup(enDiary, key)).toBe('string');
  });

  it('resolves issue to Defect and general_note to Note', () => {
    expect(lookup(enCommon, diaryEntryTypeLabelKey('issue').key)).toBe('Defect');
    expect(lookup(enCommon, diaryEntryTypeLabelKey('general_note').key)).toBe('Note');
  });
});

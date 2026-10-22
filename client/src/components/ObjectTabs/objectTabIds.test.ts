import { describe, it, expect } from '@jest/globals';
import {
  COUNTED_OBJECT_TABS,
  OBJECT_TAB_IDS,
  isCountedObjectTab,
  isObjectTabId,
  orderObjectTabs,
} from './objectTabIds.js';

describe('objectTabIds', () => {
  it('declares the fixed vocabulary in canonical order', () => {
    expect([...OBJECT_TAB_IDS]).toEqual([
      'overview',
      'timing',
      'work',
      'cost',
      'payments',
      'diary',
      'history',
    ]);
  });

  it('counts only cost, payments and diary', () => {
    expect([...COUNTED_OBJECT_TABS]).toEqual(['cost', 'payments', 'diary']);
    expect(OBJECT_TAB_IDS.filter(isCountedObjectTab)).toEqual(['cost', 'payments', 'diary']);
  });

  it('orders any input canonically and drops duplicates', () => {
    expect(orderObjectTabs(['history', 'cost', 'overview', 'cost'])).toEqual([
      'overview',
      'cost',
      'history',
    ]);
    expect(orderObjectTabs([])).toEqual([]);
  });

  it('recognises tab ids and rejects everything else', () => {
    expect(isObjectTabId('diary')).toBe(true);
    expect(isObjectTabId('site-diary')).toBe(false);
    expect(isObjectTabId('')).toBe(false);
    expect(isObjectTabId(null)).toBe(false);
  });
});

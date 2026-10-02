import { describe, it, expect } from '@jest/globals';
import { DIARY_SOURCE_ENTITY_TYPES } from './diary.js';

describe('DIARY_SOURCE_ENTITY_TYPES', () => {
  it('lists every source entity type a diary entry can reference', () => {
    expect([...DIARY_SOURCE_ENTITY_TYPES]).toEqual([
      'work_item',
      'invoice',
      'milestone',
      'budget_source',
      'subsidy_program',
    ]);
  });
});

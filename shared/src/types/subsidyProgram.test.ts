import { describe, it, expect } from '@jest/globals';
import { GRANT_ITEM_TYPES, SUBSIDY_APPLICATION_STATUSES } from './subsidyProgram.js';

describe('SUBSIDY_APPLICATION_STATUSES', () => {
  it('lists every application status in lifecycle order', () => {
    expect([...SUBSIDY_APPLICATION_STATUSES]).toEqual([
      'eligible',
      'applied',
      'approved',
      'received',
      'rejected',
    ]);
  });
});

describe('GRANT_ITEM_TYPES (#2242)', () => {
  it('lists the two kinds a grant can cover: tasks and purchases', () => {
    expect([...GRANT_ITEM_TYPES]).toEqual(['work_item', 'household_item']);
  });
});

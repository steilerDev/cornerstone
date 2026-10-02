import { describe, it, expect } from '@jest/globals';
import { SUBSIDY_APPLICATION_STATUSES } from './subsidyProgram.js';

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

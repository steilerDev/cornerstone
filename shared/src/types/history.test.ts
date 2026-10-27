import { describe, it, expect } from '@jest/globals';
import { HISTORY_EVENT_TYPES, HISTORY_OBJECT_TYPES } from './history.js';

describe('history tuples', () => {
  it('HISTORY_EVENT_TYPES lists the nine types in chip order', () => {
    expect([...HISTORY_EVENT_TYPES]).toEqual([
      'work_item_status',
      'invoice_status',
      'payment',
      'submission',
      'subsidy_status',
      'invoice_created',
      'milestone_delay',
      'budget_breach',
      'auto_reschedule',
    ]);
  });

  it('HISTORY_OBJECT_TYPES lists the five filterable objects (budget_source last, #2242)', () => {
    expect([...HISTORY_OBJECT_TYPES]).toEqual([
      'work_item',
      'invoice',
      'milestone',
      'subsidy_program',
      'budget_source',
    ]);
  });
});

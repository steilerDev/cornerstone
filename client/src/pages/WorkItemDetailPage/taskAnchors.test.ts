import { describe, it, expect } from '@jest/globals';
import { TASK_TIMING_INTENTS } from './taskAnchors.js';

describe('taskAnchors', () => {
  it('lists exactly the two Timing-tab intents other pages deep-link to', () => {
    expect([...TASK_TIMING_INTENTS]).toEqual(['constraints', 'reschedule']);
  });
});

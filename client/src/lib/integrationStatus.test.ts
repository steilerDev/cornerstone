import { describe, it, expect } from '@jest/globals';
import {
  BACKUP_RUN_OUTCOMES,
  INTEGRATION_STATUSES,
  paperlessChipState,
} from './integrationStatus.js';

describe('integration status vocabularies', () => {
  it('lists the five chip states in order', () => {
    expect([...INTEGRATION_STATUSES]).toEqual([
      'connected',
      'unreachable',
      'on',
      'off',
      'notSetUp',
    ]);
  });

  it('lists the two backup run outcomes', () => {
    expect([...BACKUP_RUN_OUTCOMES]).toEqual(['succeeded', 'failed']);
  });
});

describe('paperlessChipState', () => {
  it('is notSetUp when not configured, whatever the probe says', () => {
    expect(paperlessChipState(false, null)).toBe('notSetUp');
    expect(paperlessChipState(false, { reachable: true })).toBe('notSetUp');
    expect(paperlessChipState(false, 'failed')).toBe('notSetUp');
  });

  it('is null while the probe is still running', () => {
    expect(paperlessChipState(true, null)).toBeNull();
  });

  it('is unreachable when the probe request itself failed', () => {
    expect(paperlessChipState(true, 'failed')).toBe('unreachable');
  });

  it('is connected or unreachable from the probe result', () => {
    expect(paperlessChipState(true, { reachable: true })).toBe('connected');
    expect(paperlessChipState(true, { reachable: false })).toBe('unreachable');
  });
});

import { describe, it, expect } from '@jest/globals';
import { verbsToDependencyType, dependencyTypeToVerbs } from './dependencyVerbs.js';
import type { DependencyVerb } from './dependencyVerbs.js';
import type { DependencyType } from '@cornerstone/shared';

describe('verbsToDependencyType', () => {
  it('maps finish + start to finish_to_start', () => {
    expect(verbsToDependencyType('finish', 'start')).toBe('finish_to_start');
  });

  it('maps start + start to start_to_start', () => {
    expect(verbsToDependencyType('start', 'start')).toBe('start_to_start');
  });

  it('maps finish + finish to finish_to_finish', () => {
    expect(verbsToDependencyType('finish', 'finish')).toBe('finish_to_finish');
  });

  it('maps start + finish to start_to_finish', () => {
    expect(verbsToDependencyType('start', 'finish')).toBe('start_to_finish');
  });
});

describe('dependencyTypeToVerbs', () => {
  it('returns finish/start verbs for finish_to_start', () => {
    const result = dependencyTypeToVerbs('finish_to_start');
    expect(result.predecessorVerb).toBe('finish');
    expect(result.successorVerb).toBe('start');
  });

  it('returns start/start verbs for start_to_start', () => {
    const result = dependencyTypeToVerbs('start_to_start');
    expect(result.predecessorVerb).toBe('start');
    expect(result.successorVerb).toBe('start');
  });

  it('returns finish/finish verbs for finish_to_finish', () => {
    const result = dependencyTypeToVerbs('finish_to_finish');
    expect(result.predecessorVerb).toBe('finish');
    expect(result.successorVerb).toBe('finish');
  });

  it('returns start/finish verbs for start_to_finish', () => {
    const result = dependencyTypeToVerbs('start_to_finish');
    expect(result.predecessorVerb).toBe('start');
    expect(result.successorVerb).toBe('finish');
  });
});

describe('round-trip: dependencyTypeToVerbs(verbsToDependencyType(...))', () => {
  const allCombinations: Array<[DependencyVerb, DependencyVerb, DependencyType]> = [
    ['finish', 'start', 'finish_to_start'],
    ['start', 'start', 'start_to_start'],
    ['finish', 'finish', 'finish_to_finish'],
    ['start', 'finish', 'start_to_finish'],
  ];

  it.each(allCombinations)(
    'round-trips %s + %s → %s → verbs unchanged',
    (predVerb, succVerb, expectedType) => {
      const type = verbsToDependencyType(predVerb, succVerb);
      expect(type).toBe(expectedType);

      const verbs = dependencyTypeToVerbs(type);
      expect(verbs.predecessorVerb).toBe(predVerb);
      expect(verbs.successorVerb).toBe(succVerb);
    },
  );

  it('all 4 dependency types survive a round-trip', () => {
    const allTypes: DependencyType[] = [
      'finish_to_start',
      'start_to_start',
      'finish_to_finish',
      'start_to_finish',
    ];
    for (const type of allTypes) {
      const { predecessorVerb, successorVerb } = dependencyTypeToVerbs(type);
      const roundTripped = verbsToDependencyType(predecessorVerb, successorVerb);
      expect(roundTripped).toBe(type);
    }
  });
});

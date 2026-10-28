import { DEPENDENCY_TYPES } from './dependency.js';
import type { DependencyType } from './dependency.js';

describe('DEPENDENCY_TYPES', () => {
  it('lists the four dependency types in definition order', () => {
    expect([...DEPENDENCY_TYPES]).toEqual([
      'finish_to_start',
      'start_to_start',
      'finish_to_finish',
      'start_to_finish',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(DEPENDENCY_TYPES).size).toBe(DEPENDENCY_TYPES.length);
  });

  it('derives DependencyType from the tuple', () => {
    const type: DependencyType = DEPENDENCY_TYPES[0];
    expect(type).toBe('finish_to_start');
  });
});

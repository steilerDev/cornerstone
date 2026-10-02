import { describe, it, expect } from '@jest/globals';
import { LocalizedError } from './localizedError.js';

describe('LocalizedError', () => {
  it('carries the already-translated message', () => {
    const error = new LocalizedError('Das Budget konnte nicht verschoben werden');

    expect(error.message).toBe('Das Budget konnte nicht verschoben werden');
  });

  it('is named LocalizedError and is an Error', () => {
    const error = new LocalizedError('x');

    expect(error.name).toBe('LocalizedError');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LocalizedError);
  });

  it('is distinguishable from a plain Error via instanceof', () => {
    expect(new Error('x') instanceof LocalizedError).toBe(false);
    expect(new TypeError('x') instanceof LocalizedError).toBe(false);
  });
});

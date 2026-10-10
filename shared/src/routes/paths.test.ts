import { describe, expect, it } from '@jest/globals';
import { baseFrom } from './paths.js';

describe('baseFrom', () => {
  it('returns a plain path unchanged', () => {
    expect(baseFrom('/project/work-items')).toBe('/project/work-items');
    expect(baseFrom('/project/work-items/:id')).toBe('/project/work-items/:id');
  });

  it('cuts the path at the query', () => {
    expect(baseFrom('/schedule?view=calendar')).toBe('/schedule');
  });

  it('cuts the path at the hash', () => {
    expect(baseFrom('/budget/financing#sources')).toBe('/budget/financing');
  });

  it('cuts the path at a condition suffix', () => {
    expect(baseFrom('/x (Paperless off)')).toBe('/x');
  });

  it('cuts at the first of several delimiters', () => {
    expect(baseFrom('/a?x=1#h')).toBe('/a');
    expect(baseFrom('/a#h?x=1')).toBe('/a');
    expect(baseFrom('/a (member)?x=1')).toBe('/a');
  });

  it('keeps the root path', () => {
    expect(baseFrom('/')).toBe('/');
  });
});

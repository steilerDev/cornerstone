import { describe, it, expect } from '@jest/globals';
import { dataTableTestId } from './dataTableTestId.js';

describe('dataTableTestId', () => {
  it('builds `prefix-id` for the table surface', () => {
    expect(dataTableTestId('x', 'a1', 'table')).toBe('x-a1');
  });

  it('builds `prefix-mobile-id` for the card surface', () => {
    expect(dataTableTestId('x', 'a1', 'card')).toBe('x-mobile-a1');
  });

  it('accepts numeric ids on both surfaces', () => {
    expect(dataTableTestId('row', 7, 'table')).toBe('row-7');
    expect(dataTableTestId('row', 7, 'card')).toBe('row-mobile-7');
  });

  it('never yields the same id for the two surfaces of one item', () => {
    expect(dataTableTestId('p', 1, 'table')).not.toBe(dataTableTestId('p', 1, 'card'));
  });
});

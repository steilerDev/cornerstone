import { describe, it, expect } from '@jest/globals';
import { TRADE_ID_MAX_LENGTH, TRADE_IDS_MAX } from '@cornerstone/shared';
import { ValidationError } from '../../errors/AppError.js';
import { parseTradeIds } from './tradeIdsParam.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `trade-${i}`);

describe('parseTradeIds', () => {
  it.each([undefined, '', ' , ,', ',,,'])('returns no ids for %j', (raw) => {
    expect(parseTradeIds(raw)).toEqual([]);
  });

  it('trims entries and drops empty ones', () => {
    expect(parseTradeIds(' a , b,, c ')).toEqual(['a', 'b', 'c']);
  });

  it('de-duplicates in first-seen order', () => {
    expect(parseTradeIds('b,a,b,c,a')).toEqual(['b', 'a', 'c']);
  });

  it('accepts exactly the maximum number of distinct ids', () => {
    expect(parseTradeIds(ids(TRADE_IDS_MAX).join(','))).toHaveLength(TRADE_IDS_MAX);
  });

  it('rejects one more than the maximum with details.tradeIds', () => {
    let error: unknown;
    try {
      parseTradeIds(ids(TRADE_IDS_MAX + 1).join(','));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toHaveProperty('tradeIds');
  });

  it('counts after de-duplication: 60 entries that collapse to 50 are accepted', () => {
    const raw = [...ids(TRADE_IDS_MAX), ...ids(10)].join(',');
    expect(parseTradeIds(raw)).toHaveLength(TRADE_IDS_MAX);
  });

  it('accepts an id of exactly the maximum length', () => {
    const id = 'x'.repeat(TRADE_ID_MAX_LENGTH);
    expect(parseTradeIds(id)).toEqual([id]);
  });

  it('rejects an id longer than the maximum length', () => {
    expect(() => parseTradeIds('x'.repeat(TRADE_ID_MAX_LENGTH + 1))).toThrow(ValidationError);
  });

  it('measures the length after trimming', () => {
    const id = 'x'.repeat(TRADE_ID_MAX_LENGTH);
    expect(parseTradeIds(`  ${id}  `)).toEqual([id]);
  });
});

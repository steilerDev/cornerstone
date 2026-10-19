import { describe, it, expect } from '@jest/globals';
import { diaryHistoryRedirectTarget } from './diaryHistoryRedirect.js';

const target = (qs: string) => diaryHistoryRedirectTarget(new URLSearchParams(qs));

describe('diaryHistoryRedirectTarget', () => {
  it('stays on the diary without filterMode', () => {
    expect(target('')).toBeNull();
    expect(target('q=abc')).toBeNull();
  });

  it('ignores filterMode=manual and unknown modes', () => {
    expect(target('filterMode=manual')).toBeNull();
    expect(target('filterMode=bogus')).toBeNull();
  });

  it('sends filterMode=automatic to /history', () => {
    expect(target('filterMode=automatic')).toBe('/history');
  });

  it('sends filterMode=all to /history with the diary included', () => {
    expect(target('filterMode=all')).toBe('/history?include=diary');
  });

  it('keeps the first valid History type of types and maps it to type', () => {
    expect(target('filterMode=automatic&types=bogus,invoice_status,daily_log')).toBe(
      '/history?type=invoice_status',
    );
  });

  it('trims type values and drops the type when none is valid', () => {
    expect(target('filterMode=automatic&types=%20payment%20')).toBe('/history?type=payment');
    expect(target('filterMode=automatic&types=daily_log,site_visit')).toBe('/history');
  });

  it('carries only q, dateFrom and dateTo and drops other keys', () => {
    const url = new URL(
      target(
        'filterMode=automatic&q=zz&dateFrom=2026-01-01&dateTo=2026-01-31&status=draft&page=3',
      )!,
      'http://x',
    );
    expect(url.pathname).toBe('/history');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'zz',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
  });

  it('combines carried keys, type and include for filterMode=all', () => {
    const url = new URL(target('filterMode=all&q=zz&types=invoice_status')!, 'http://x');
    expect(url.pathname).toBe('/history');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'zz',
      type: 'invoice_status',
      include: 'diary',
    });
  });
});

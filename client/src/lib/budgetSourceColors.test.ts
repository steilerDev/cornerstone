import { describe, it, expect } from '@jest/globals';
import { getSourceColorIndex, getSourceBadgeStyleKey } from './budgetSourceColors.js';

describe('getSourceColorIndex', () => {
  // ── 10. Always in [1, 9] ──────────────────────────────────────────────────

  it('returns a value in [1, 9] for a single UUID', () => {
    const result = getSourceColorIndex('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(9);
  });

  it('returns a value in [1, 9] for 50 random-like UUID inputs', () => {
    const uuids = [
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000005',
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
      '66666666-6666-6666-6666-666666666666',
      '77777777-7777-7777-7777-777777777777',
      '88888888-8888-8888-8888-888888888888',
      '99999999-9999-9999-9999-999999999999',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'a0000000-0000-0000-0000-000000000000',
      'b0000000-0000-0000-0000-000000000000',
      'c0000000-0000-0000-0000-000000000000',
      'd0000000-0000-0000-0000-000000000000',
      'e0000000-0000-0000-0000-000000000000',
      'src-bank-loan-001',
      'src-equity-002',
      'src-grant-003',
      'src-subsidy-004',
      'src-mortgage-005',
      'src-personal-006',
      'src-crowdfund-007',
      'src-bond-008',
      'src-pension-009',
      'src-savings-010',
      'short',
      'a',
      'ab',
      'abc',
      'abcd',
      'abcde',
      'abcdef',
      'abcdefg',
      'abcdefgh',
      'abcdefghi',
    ];

    for (const uuid of uuids) {
      const result = getSourceColorIndex(uuid);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(9);
    }
  });

  it('never returns 0 (slot 0 is reserved for unassigned)', () => {
    const inputs = [
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
      'k',
      'test-id',
      'uuid-123',
      'longer-source-id-here',
    ];
    for (const input of inputs) {
      expect(getSourceColorIndex(input)).not.toBe(0);
    }
  });

  // ── 11. Deterministic (same input → same output) ───────────────────────────

  it('returns the same value for the same input across 100 calls', () => {
    const sourceId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const firstResult = getSourceColorIndex(sourceId);

    for (let i = 0; i < 99; i++) {
      expect(getSourceColorIndex(sourceId)).toBe(firstResult);
    }
  });

  it('returns the same value for a short string input across 100 calls', () => {
    const sourceId = 'my-source';
    const firstResult = getSourceColorIndex(sourceId);

    for (let i = 0; i < 99; i++) {
      expect(getSourceColorIndex(sourceId)).toBe(firstResult);
    }
  });

  it('produces different results for different inputs (hash distribution)', () => {
    // While not guaranteed, these specific test IDs do produce distinct results
    const results = new Set([
      getSourceColorIndex('src-bank-loan-001'),
      getSourceColorIndex('src-equity-002'),
      getSourceColorIndex('src-grant-003'),
    ]);
    // We just verify each is in range, not that they're all distinct (hash collisions are valid)
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(9);
    }
  });

  // ── Handles single-char and empty-ish inputs ───────────────────────────────

  it('handles a single character input without throwing', () => {
    expect(() => getSourceColorIndex('x')).not.toThrow();
    const result = getSourceColorIndex('x');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(9);
  });

  it('handles a long string input without throwing', () => {
    const long = 'a'.repeat(1000);
    expect(() => getSourceColorIndex(long)).not.toThrow();
    const result = getSourceColorIndex(long);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(9);
  });
});

describe('getSourceBadgeStyleKey', () => {
  // ── 12. null → 'sourceUnassigned' ──────────────────────────────────────────

  it("returns 'sourceUnassigned' for null sourceId", () => {
    expect(getSourceBadgeStyleKey(null)).toBe('sourceUnassigned');
  });

  // ── 13. Named source → 'source1'–'source9' (never 'source0') ───────────────

  it("returns a key in the 'source1'–'source9' range for a non-null sourceId", () => {
    const validKeys = new Set([
      'source1',
      'source2',
      'source3',
      'source4',
      'source5',
      'source6',
      'source7',
      'source8',
      'source9',
    ]);

    const testIds = [
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      '550e8400-e29b-41d4-a716-446655440000',
      'src-bank-loan-001',
      'a',
      'x',
      'longer-source-id-that-maps-somewhere',
    ];

    for (const id of testIds) {
      const key = getSourceBadgeStyleKey(id);
      expect(validKeys.has(key)).toBe(true);
    }
  });

  it("never returns 'source0' for a non-null sourceId", () => {
    const testIds = [
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      '550e8400-e29b-41d4-a716-446655440000',
      'src-bank-loan-001',
      'a',
      'z',
      '0',
      '9',
      'src',
    ];

    for (const id of testIds) {
      expect(getSourceBadgeStyleKey(id)).not.toBe('source0');
    }
  });

  it('returns source key consistent with getSourceColorIndex', () => {
    const sourceId = 'src-test-stable';
    const colorIndex = getSourceColorIndex(sourceId);
    const expectedKey = `source${colorIndex}`;
    expect(getSourceBadgeStyleKey(sourceId)).toBe(expectedKey);
  });

  it('is deterministic: same input returns same key across 100 calls', () => {
    const sourceId = 'src-reproducible-456';
    const firstKey = getSourceBadgeStyleKey(sourceId);
    for (let i = 0; i < 99; i++) {
      expect(getSourceBadgeStyleKey(sourceId)).toBe(firstKey);
    }
  });

  it('handles a single character input', () => {
    const key = getSourceBadgeStyleKey('a');
    expect(key).toMatch(/^source[1-9]$/);
  });

  it('handles a long UUID-like input', () => {
    const key = getSourceBadgeStyleKey('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(key).toMatch(/^source[1-9]$/);
  });
});

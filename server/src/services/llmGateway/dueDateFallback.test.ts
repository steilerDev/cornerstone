/**
 * Unit tests for computeDueDateFallback() (Story #1584 / #1585).
 *
 * Covers: no-op when dueDate already set, no-op when invoiceDate absent,
 * immediate-payment patterns (German + English), relative German terms,
 * relative English terms, skonto clause (uses longer/NET term), null notes.
 */

import { describe, it, expect } from '@jest/globals';
import { computeDueDateFallback } from './dueDateFallback.js';
import type { ExtractionResult } from './types.js';

function makeResult(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    lines: [],
    invoiceDate: undefined,
    dueDate: undefined,
    invoiceNumber: undefined,
    notes: undefined,
    ...overrides,
  };
}

describe('computeDueDateFallback()', () => {
  // ─── Case 1: dueDate already present ────────────────────────────────────────

  it('returns immediately (no-op) when dueDate is already set', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-01',
      notes: 'Zahlbar sofort',
    });
    computeDueDateFallback(result);
    // dueDate must remain unchanged even though "sofort" pattern would fire
    expect(result.dueDate).toBe('2026-04-01');
  });

  // ─── Case 2: invoiceDate absent ──────────────────────────────────────────────

  it('does not set dueDate when invoiceDate is absent', () => {
    const result = makeResult({
      invoiceDate: undefined,
      notes: 'Zahlbar sofort',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBeUndefined();
  });

  // ─── Case 3: "Zahlbar sofort" → dueDate = invoiceDate ─────────────────────

  it('sets dueDate = invoiceDate when notes contain "Zahlbar sofort"', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Zahlbar sofort nach Erhalt der Rechnung.',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-03-15');
  });

  // ─── Case 4: "innerhalb von 14 Tagen" → invoiceDate + 14 ─────────────────

  it('sets dueDate = invoiceDate + 14 days when notes contain "innerhalb von 14 Tagen"', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Zahlbar innerhalb von 14 Tagen nach Rechnungseingang.',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-03-29');
  });

  // ─── Case 5: "Net 30 days" → invoiceDate + 30 ────────────────────────────

  it('sets dueDate = invoiceDate + 30 days when notes contain "Net 30 days"', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Payment terms: Net 30 days.',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-04-14');
  });

  // ─── Case 6: "Payable immediately" → dueDate = invoiceDate ──────────────

  it('sets dueDate = invoiceDate when notes contain "Payable immediately"', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Payable immediately upon receipt.',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-03-15');
  });

  // ─── Case 7: "within 7 days" → invoiceDate + 7 ───────────────────────────

  it('sets dueDate = invoiceDate + 7 days when notes contain "within 7 days"', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Please pay within 7 days.',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-03-22');
  });

  // ─── Case 8: "netto 30 Tage" ─────────────────────────────────────────────
  // The implementation regex is: /(?:within|net)\s+(\d+)\s*(?:day|days)?/
  // "netto 30 Tage" is German — "net" prefix regex does NOT match "netto" with a space.
  // Covered by the skonto clause test (Case 9) which uses "sonst netto 30 Tage"
  // matching /(?:sonst|then)\s*(?:netto)?\s*(\d+)\s*tag/.

  it('does NOT extract dueDate from "Zahlbar netto 30 Tage" (netto without English "net" prefix is not matched by English regex)', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Zahlbar netto 30 Tage.',
    });
    computeDueDateFallback(result);
    // The phrase "netto 30 Tage" alone does not match any current regex pattern.
    // The skonto regex requires "sonst|then" before "netto N tag".
    // This documents the current implementation boundary.
    expect(result.dueDate).toBeUndefined();
  });

  // ─── Case 9: skonto clause → uses NET (longer) term ─────────────────────

  it('uses the NET term (30 days) from a skonto clause, not the discount period (8 days)', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: '2% Skonto bei Zahlung innerhalb 8 Tagen, sonst netto 30 Tage.',
    });
    computeDueDateFallback(result);
    // skonto pattern matches "sonst netto 30 Tage" → N=30
    expect(result.dueDate).toBe('2026-04-14');
  });

  // ─── Case 10: null/absent notes ──────────────────────────────────────────

  it('does not set dueDate when notes is null/absent', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: undefined,
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBeUndefined();
  });

  // ─── Bonus: empty-string notes ───────────────────────────────────────────

  it('does not set dueDate when notes is an empty string', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: '',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBeUndefined();
  });

  // ─── Month-boundary roll-over ────────────────────────────────────────────

  it('correctly rolls over month boundary (March + 30 days = April 14)', () => {
    const result = makeResult({
      invoiceDate: '2026-03-15',
      notes: 'Net 30 days',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-04-14');
  });

  it('correctly rolls over year boundary (Dec 15 + 30 days = Jan 14 next year)', () => {
    const result = makeResult({
      invoiceDate: '2025-12-15',
      notes: 'Net 30 days',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-01-14');
  });

  // ─── Case matching the doc comment: "sofort fällig" ─────────────────────

  it('sets dueDate = invoiceDate when notes contain "sofort fällig"', () => {
    const result = makeResult({
      invoiceDate: '2026-05-01',
      notes: 'Rechnung sofort fällig.',
    });
    computeDueDateFallback(result);
    expect(result.dueDate).toBe('2026-05-01');
  });
});

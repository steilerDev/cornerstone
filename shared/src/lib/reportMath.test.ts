/**
 * Unit tests for shared/src/lib/reportMath.ts — computeIncludedTotal().
 *
 * All fixtures are minimal: only the fields consumed by computeIncludedTotal
 * (invoiceId, allocatedAmount, budgetLines[].{id, allocatedPortion}) are
 * meaningful. The remaining required fields are filled with sentinel values.
 */

import { describe, it, expect } from '@jest/globals';
import { computeIncludedTotal } from './reportMath.js';
import type { SourceReportResponse, SourceReportInvoice } from '../types/sourceReport.js';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeInvoice(
  invoiceId: string,
  allocatedAmount: number,
  budgetLines: Array<{ id: string; allocatedPortion: number }> = [],
): SourceReportInvoice {
  return {
    invoiceId,
    vendorId: 'vendor-1',
    vendorName: 'Test Vendor',
    invoiceNumber: null,
    date: '2026-01-01',
    status: 'paid',
    invoiceAmount: allocatedAmount,
    allocatedAmount,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: [],
    budgetLines: budgetLines.map(({ id, allocatedPortion }) => ({
      id,
      description: null,
      allocatedPortion,
      linkedItem: null,
    })),
    deposits: [],
  };
}

function makeReport(invoices: SourceReportInvoice[]): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Test Source',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices,
    totalAmount: invoices.reduce((s, i) => s + i.allocatedAmount, 0),
    unallocatedInvoices: [],
    generatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ─── computeIncludedTotal() ───────────────────────────────────────────────────

describe('computeIncludedTotal()', () => {
  // Scenario 1: empty includedInvoiceIds → returns 0
  it('returns 0 when includedInvoiceIds is empty', () => {
    const report = makeReport([makeInvoice('inv-1', 500), makeInvoice('inv-2', 300)]);
    const result = computeIncludedTotal(report, [], new Set());
    expect(result).toBe(0);
  });

  // Scenario 2: all invoices included, no exclusions → sums all allocatedAmount values
  it('sums all allocatedAmount values when all invoices are included and no lines are excluded', () => {
    const report = makeReport([
      makeInvoice('inv-1', 100),
      makeInvoice('inv-2', 200),
      makeInvoice('inv-3', 50),
    ]);
    const result = computeIncludedTotal(report, ['inv-1', 'inv-2', 'inv-3'], new Set());
    expect(result).toBe(350);
  });

  // Scenario 3: subset of invoices included → only matching invoices contribute
  it('only sums invoices whose IDs appear in includedInvoiceIds', () => {
    const report = makeReport([
      makeInvoice('inv-1', 100),
      makeInvoice('inv-2', 200),
      makeInvoice('inv-3', 50),
    ]);
    const result = computeIncludedTotal(report, ['inv-1', 'inv-3'], new Set());
    expect(result).toBe(150);
  });

  // Scenario 4: excluded budget lines reduce contribution
  it('subtracts allocatedPortion of excluded lines from the included invoice contribution', () => {
    const invoice = makeInvoice('inv-1', 300, [
      { id: 'line-a', allocatedPortion: 80 },
      { id: 'line-b', allocatedPortion: 40 },
    ]);
    const report = makeReport([invoice]);
    // Exclude line-a only → contribution = 300 - 80 = 220
    const result = computeIncludedTotal(report, ['inv-1'], new Set(['line-a']));
    expect(result).toBe(220);
  });

  it('subtracts multiple excluded lines from a single invoice', () => {
    const invoice = makeInvoice('inv-1', 500, [
      { id: 'line-x', allocatedPortion: 100 },
      { id: 'line-y', allocatedPortion: 150 },
    ]);
    const report = makeReport([invoice]);
    // Exclude both → 500 - 100 - 150 = 250
    const result = computeIncludedTotal(report, ['inv-1'], new Set(['line-x', 'line-y']));
    expect(result).toBe(250);
  });

  // Scenario 5: per-invoice defensive rounding (>2dp input)
  it('rounds per-invoice contribution to 2dp when allocatedAmount has more than 2dp', () => {
    // 100.12345 → Math.round(100.12345 * 100) / 100 = 100.12
    const invoice = makeInvoice('inv-1', 100.12345);
    const report = makeReport([invoice]);
    const result = computeIncludedTotal(report, ['inv-1'], new Set());
    expect(result).toBe(100.12);
  });

  it('rounds per-invoice contribution after subtracting excluded line portions', () => {
    // allocatedAmount = 100.12345, excluded line portion = 10.00345
    // contribution before rounding = 100.12345 - 10.00345 = 90.12
    // Math.round(90.12 * 100) / 100 = 90.12
    const invoice = makeInvoice('inv-1', 100.12345, [{ id: 'line-a', allocatedPortion: 10.00345 }]);
    const report = makeReport([invoice]);
    const result = computeIncludedTotal(report, ['inv-1'], new Set(['line-a']));
    expect(result).toBe(90.12);
  });

  // Scenario 6: final total rounding handles floating-point imprecision
  it('rounds the final total to 2dp when per-invoice contributions produce floating-point drift', () => {
    // 1.1 + 2.2 = 3.3000000000000003 in JS (classic float drift)
    // computeIncludedTotal must return 3.3, not 3.3000000000000003
    const report = makeReport([makeInvoice('inv-1', 1.1), makeInvoice('inv-2', 2.2)]);
    const result = computeIncludedTotal(report, ['inv-1', 'inv-2'], new Set());
    expect(result).toBe(3.3);
  });

  // Scenario 7: excluded line on a non-included invoice has no effect
  it('ignores excluded lines whose parent invoice is not in includedInvoiceIds', () => {
    // inv-1 is included, inv-2 is NOT included. line-b belongs to inv-2.
    // Excluding line-b must have no effect; result = allocatedAmount of inv-1 only.
    const report = makeReport([
      makeInvoice('inv-1', 400),
      makeInvoice('inv-2', 600, [{ id: 'line-b', allocatedPortion: 200 }]),
    ]);
    const result = computeIncludedTotal(report, ['inv-1'], new Set(['line-b']));
    expect(result).toBe(400);
  });

  // Scenario 8: empty excludedLineIds → equivalent to no exclusions
  it('returns the same total with an empty excludedLineIds Set as with no exclusions', () => {
    const invoice = makeInvoice('inv-1', 250, [{ id: 'line-c', allocatedPortion: 50 }]);
    const report = makeReport([invoice]);
    const withoutExclusions = computeIncludedTotal(report, ['inv-1'], new Set());
    // No lines excluded → full allocatedAmount
    expect(withoutExclusions).toBe(250);
  });

  // Additional correctness guards
  it('returns 0 when includedInvoiceIds references IDs not present in the report', () => {
    const report = makeReport([makeInvoice('inv-1', 100)]);
    const result = computeIncludedTotal(report, ['inv-does-not-exist'], new Set());
    expect(result).toBe(0);
  });

  it('handles a report with an empty invoices array', () => {
    const report = makeReport([]);
    const result = computeIncludedTotal(report, ['inv-1'], new Set());
    expect(result).toBe(0);
  });

  it('handles allocatedAmount of 0 for an included invoice', () => {
    const report = makeReport([makeInvoice('inv-1', 0)]);
    const result = computeIncludedTotal(report, ['inv-1'], new Set());
    expect(result).toBe(0);
  });
});

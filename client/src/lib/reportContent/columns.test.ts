/**
 * Unit tests for client/src/lib/reportContent/columns.ts (#1973 AC 2.1)
 *
 * This module is the SINGLE source of truth for the report table's column set, consumed by both
 * ReportContentEditor (toggle UI) and overviewPdf.ts (PDF geometry engine). Every assertion below
 * checks the exact array/boolean value, never just `.length` or truthiness, per the QA spec's
 * "would this fail if the guarded thing were deleted" standard — a reorder, a stray extra column,
 * or a locked-column leak must all be caught here.
 */
import { describe, it, expect } from '@jest/globals';
import type { ReportColumnKey } from './columns.js';
import {
  reportColumnsForUseCase,
  isColumnLocked,
  visibleReportColumns,
  REQUIRED_REPORT_COLUMN,
} from './columns.js';

const ALL_COLUMNS: ReportColumnKey[] = [
  'vendor',
  'invoiceNumber',
  'date',
  'status',
  'invoiceAmount',
  'allocatedAmount',
  'usage',
];

describe('REQUIRED_REPORT_COLUMN', () => {
  it("is 'allocatedAmount' — R1: the only column that can never be hidden", () => {
    expect(REQUIRED_REPORT_COLUMN).toBe('allocatedAmount');
  });
});

describe('reportColumnsForUseCase', () => {
  it('(scenario 1) isOverview=true returns exactly the 7 keys in canonical order, not just the right length', () => {
    expect(reportColumnsForUseCase(true)).toEqual([
      'vendor',
      'invoiceNumber',
      'date',
      'status',
      'invoiceAmount',
      'allocatedAmount',
      'usage',
    ]);
  });

  it('(scenario 1) isOverview=false returns exactly the 6 keys in the same relative order, minus status', () => {
    expect(reportColumnsForUseCase(false)).toEqual([
      'vendor',
      'invoiceNumber',
      'date',
      'invoiceAmount',
      'allocatedAmount',
      'usage',
    ]);
  });

  it('a reorder would be caught: the overview array is NOT just a superset of the claim array in any order, it is the claim array with status re-inserted at index 3', () => {
    const overview = reportColumnsForUseCase(true);
    const claim = reportColumnsForUseCase(false);
    const withoutStatus = overview.filter((c) => c !== 'status');
    expect(withoutStatus).toEqual(claim);
    expect(overview.indexOf('status')).toBe(3);
  });
});

describe('isColumnLocked', () => {
  it('(scenario 2) is true for allocatedAmount and false for every other ReportColumnKey — enumerated, not sampled', () => {
    for (const col of ALL_COLUMNS) {
      expect(isColumnLocked(col)).toBe(col === 'allocatedAmount');
    }
    // Sanity: this enumeration actually covers all 7 keys, so the loop above isn't vacuous.
    expect(ALL_COLUMNS).toHaveLength(7);
  });
});

describe('visibleReportColumns', () => {
  it('(scenario 3) nothing hidden ⇒ full set, exactly equal to reportColumnsForUseCase(isOverview) — both use cases', () => {
    expect(visibleReportColumns(true, new Set())).toEqual(reportColumnsForUseCase(true));
    expect(visibleReportColumns(false, new Set())).toEqual(reportColumnsForUseCase(false));
  });

  it('(scenario 4) every hideable overview column hidden at once leaves exactly [allocatedAmount]', () => {
    const hidden = new Set<ReportColumnKey>([
      'vendor',
      'invoiceNumber',
      'date',
      'status',
      'invoiceAmount',
      'usage',
    ]);
    expect(visibleReportColumns(true, hidden)).toEqual(['allocatedAmount']);
  });

  it('(scenario 4) every hideable claim column hidden at once leaves exactly [allocatedAmount]', () => {
    const hidden = new Set<ReportColumnKey>([
      'vendor',
      'invoiceNumber',
      'date',
      'invoiceAmount',
      'usage',
    ]);
    expect(visibleReportColumns(false, hidden)).toEqual(['allocatedAmount']);
  });

  it('(scenario 5) a caller attempting to hide allocatedAmount cannot — defense-in-depth beneath the disabled checkbox', () => {
    expect(visibleReportColumns(true, new Set(['allocatedAmount']))).toContain('allocatedAmount');
    expect(visibleReportColumns(false, new Set(['allocatedAmount']))).toContain('allocatedAmount');
    // Even combined with every OTHER column also hidden, allocatedAmount alone survives.
    const hideEverything = new Set<ReportColumnKey>(ALL_COLUMNS);
    expect(visibleReportColumns(true, hideEverything)).toEqual(['allocatedAmount']);
  });

  it('(scenario 6) claim/proof-of-funds (isOverview=false) never includes status — structurally, for any hiddenColumns value, including one that explicitly tries to un-hide it', () => {
    // There is no hiddenColumns value that can produce 'status' for isOverview=false, because
    // 'status' is absent from CLAIM_COLUMNS entirely — try the emptiest possible set (nothing
    // hidden) and a set that "hides" an unrelated column, neither can conjure it.
    expect(visibleReportColumns(false, new Set())).not.toContain('status');
    expect(visibleReportColumns(false, new Set(['vendor']))).not.toContain('status');
    expect(visibleReportColumns(false, new Set(['status']))).not.toContain('status');
  });

  it('hiding a subset preserves canonical column order (not the order columns were hidden/unhidden in)', () => {
    const hidden = new Set<ReportColumnKey>(['invoiceNumber', 'usage']);
    expect(visibleReportColumns(true, hidden)).toEqual([
      'vendor',
      'date',
      'status',
      'invoiceAmount',
      'allocatedAmount',
    ]);
  });

  it('hiding a column not present in the given use case (e.g. status for a claim report) is a no-op on the visible set', () => {
    expect(visibleReportColumns(false, new Set(['status']))).toEqual(
      reportColumnsForUseCase(false),
    );
  });
});

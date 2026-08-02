/**
 * Unit tests for attachmentTierUtils.ts
 *
 * Story #1930 — Attachment tier rules per report type (quotation -> deposit -> invoice)
 * replace per-invoice stage matching.
 *
 * Covers: the tier/floor constant shapes (locking the ordering independent of the
 * function under test) and isDocumentIncludedForReportType()'s inclusion decision for
 * every (report type x attachmentType) combination, including the null-handling ruling
 * (AC4) which gets its own explicitly named tests since it is the rule most likely to
 * be silently broken by a future refactor.
 */

import { describe, it, expect } from '@jest/globals';
import type { AttachmentType, SourceReportType } from '@cornerstone/shared';
import {
  ATTACHMENT_TIER,
  REPORT_TYPE_TIER_FLOOR,
  isDocumentIncludedForReportType,
} from './attachmentTierUtils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

describe('ATTACHMENT_TIER', () => {
  it('is exactly { quotation: 1, deposit: 2, invoice: 3 }', () => {
    expect(ATTACHMENT_TIER).toEqual({ quotation: 1, deposit: 2, invoice: 3 });
  });
});

describe('REPORT_TYPE_TIER_FLOOR', () => {
  it("is exactly { 'budget-overview': 1, claim: 2, 'proof-of-funds': 3 }", () => {
    expect(REPORT_TYPE_TIER_FLOOR).toEqual({
      'budget-overview': 1,
      claim: 2,
      'proof-of-funds': 3,
    });
  });
});

// ─── isDocumentIncludedForReportType ───────────────────────────────────────

describe('isDocumentIncludedForReportType', () => {
  // AC1: 3 report types x 3 typed attachmentType values (9 cases), per the tier-floor table.
  const cases: Array<{
    reportType: SourceReportType;
    attachmentType: AttachmentType;
    expected: boolean;
  }> = [
    // budget-overview: floor = quotation (1) -> embeds quotation, deposit, invoice
    { reportType: 'budget-overview', attachmentType: 'quotation', expected: true },
    { reportType: 'budget-overview', attachmentType: 'deposit', expected: true },
    { reportType: 'budget-overview', attachmentType: 'invoice', expected: true },
    // claim: floor = deposit (2) -> embeds deposit, invoice; never quotation
    { reportType: 'claim', attachmentType: 'quotation', expected: false },
    { reportType: 'claim', attachmentType: 'deposit', expected: true },
    { reportType: 'claim', attachmentType: 'invoice', expected: true },
    // proof-of-funds: floor = invoice (3) -> embeds invoice only
    { reportType: 'proof-of-funds', attachmentType: 'quotation', expected: false },
    { reportType: 'proof-of-funds', attachmentType: 'deposit', expected: false },
    { reportType: 'proof-of-funds', attachmentType: 'invoice', expected: true },
  ];

  it.each(cases)(
    '$reportType + $attachmentType -> $expected',
    ({ reportType, attachmentType, expected }) => {
      expect(isDocumentIncludedForReportType(reportType, attachmentType)).toBe(expected);
    },
  );

  // AC4: null attachmentType is treated as tier `invoice` (the strongest tier), so it is
  // included in every report type. Named individually per spec — do not fold into the
  // table above, since this is the ruling most likely to be silently broken by a future
  // refactor (e.g. someone "simplifying" the null branch to tier `quotation`).
  it('null attachmentType is included in a budget-overview report', () => {
    expect(isDocumentIncludedForReportType('budget-overview', null)).toBe(true);
  });

  it('null attachmentType is included in a claim report', () => {
    expect(isDocumentIncludedForReportType('claim', null)).toBe(true);
  });

  it('null attachmentType is included in a proof-of-funds report', () => {
    expect(isDocumentIncludedForReportType('proof-of-funds', null)).toBe(true);
  });
});

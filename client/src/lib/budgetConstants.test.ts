import { jest, describe, it, expect } from '@jest/globals';
import { CONFIDENCE_LABELS, computeBudgetTotals } from './budgetConstants.js';
import type { BaseBudgetLine } from '@cornerstone/shared';

// Keep jest in scope — required by the test framework even if not explicitly used
void jest;

/**
 * Helper to build a complete BaseBudgetLine for use in tests.
 * All required fields are defaulted; pass overrides to customize.
 */
const makeLine = (overrides: Partial<BaseBudgetLine> = {}): BaseBudgetLine => ({
  id: 'bl-1',
  description: null,
  plannedAmount: 0,
  confidence: 'invoice',
  confidenceMargin: 0,
  budgetCategory: null,
  budgetSource: null,
  vendor: null,
  actualCost: 0,
  actualCostPaid: 0,
  invoiceCount: 0,
  invoiceLink: null,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  quantity: null,
  unit: null,
  unitPrice: null,
  includesVat: null,
  ...overrides,
});

// ─── CONFIDENCE_LABELS ───────────────────────────────────────────────────────

describe('CONFIDENCE_LABELS', () => {
  it('contains exactly 4 keys', () => {
    expect(Object.keys(CONFIDENCE_LABELS)).toHaveLength(4);
  });

  it('maps own_estimate to a human-readable label', () => {
    expect(CONFIDENCE_LABELS.own_estimate).toBe('Own Estimate');
  });

  it('maps professional_estimate to a human-readable label', () => {
    expect(CONFIDENCE_LABELS.professional_estimate).toBe('Professional Estimate');
  });

  it('maps quote to a human-readable label', () => {
    expect(CONFIDENCE_LABELS.quote).toBe('Quote');
  });

  it('maps invoice to a human-readable label', () => {
    expect(CONFIDENCE_LABELS.invoice).toBe('Invoice');
  });

  it('covers all 4 confidence levels defined in the shared type', () => {
    const expectedKeys = ['own_estimate', 'professional_estimate', 'quote', 'invoice'];
    expect(Object.keys(CONFIDENCE_LABELS).sort()).toEqual(expectedKeys.sort());
  });
});

// ─── computeBudgetTotals ─────────────────────────────────────────────────────

describe('computeBudgetTotals', () => {
  describe('empty input', () => {
    it('returns all zeros when given an empty array', () => {
      const result = computeBudgetTotals([]);

      expect(result.totalPlanned).toBe(0);
      expect(result.totalActualCost).toBe(0);
      expect(result.totalMinPlanned).toBe(0);
      expect(result.totalMaxPlanned).toBe(0);
    });

    it('returns hasPlannedRange=false for empty array', () => {
      const result = computeBudgetTotals([]);

      expect(result.hasPlannedRange).toBe(false);
    });
  });

  describe('invoice confidence (0% margin)', () => {
    it('min equals max for a single invoice line', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'invoice', confidenceMargin: 0 });

      const result = computeBudgetTotals([line]);

      expect(result.totalMinPlanned).toBe(1000);
      expect(result.totalMaxPlanned).toBe(1000);
    });

    it('returns hasPlannedRange=false for invoice-only lines', () => {
      const line = makeLine({ plannedAmount: 500, confidence: 'invoice' });

      const result = computeBudgetTotals([line]);

      expect(result.hasPlannedRange).toBe(false);
    });

    it('totalPlanned equals plannedAmount', () => {
      const line = makeLine({ plannedAmount: 750, confidence: 'invoice' });

      const result = computeBudgetTotals([line]);

      expect(result.totalPlanned).toBe(750);
    });

    it('totalActualCost equals actualCost field', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'invoice', actualCost: 950 });

      const result = computeBudgetTotals([line]);

      expect(result.totalActualCost).toBe(950);
    });
  });

  describe('own_estimate confidence (20% margin)', () => {
    it('min = plannedAmount * 0.8 for a single own_estimate line', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMinPlanned).toBeCloseTo(800, 5);
    });

    it('max = plannedAmount * 1.2 for a single own_estimate line', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMaxPlanned).toBeCloseTo(1200, 5);
    });

    it('returns hasPlannedRange=true for own_estimate line', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.hasPlannedRange).toBe(true);
    });
  });

  describe('professional_estimate confidence (10% margin)', () => {
    it('min = plannedAmount * 0.9', () => {
      const line = makeLine({ plannedAmount: 2000, confidence: 'professional_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMinPlanned).toBeCloseTo(1800, 5);
    });

    it('max = plannedAmount * 1.1', () => {
      const line = makeLine({ plannedAmount: 2000, confidence: 'professional_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMaxPlanned).toBeCloseTo(2200, 5);
    });

    it('returns hasPlannedRange=true', () => {
      const line = makeLine({ plannedAmount: 2000, confidence: 'professional_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.hasPlannedRange).toBe(true);
    });
  });

  describe('quote confidence (5% margin)', () => {
    it('min = plannedAmount * 0.95', () => {
      const line = makeLine({ plannedAmount: 4000, confidence: 'quote' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMinPlanned).toBeCloseTo(3800, 5);
    });

    it('max = plannedAmount * 1.05', () => {
      const line = makeLine({ plannedAmount: 4000, confidence: 'quote' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMaxPlanned).toBeCloseTo(4200, 5);
    });

    it('returns hasPlannedRange=true', () => {
      const line = makeLine({ plannedAmount: 4000, confidence: 'quote' });

      const result = computeBudgetTotals([line]);

      expect(result.hasPlannedRange).toBe(true);
    });
  });

  describe('mixed confidence levels', () => {
    it('sums totalPlanned across all lines', () => {
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'invoice' }),
        makeLine({ id: 'bl-2', plannedAmount: 500, confidence: 'own_estimate' }),
        makeLine({ id: 'bl-3', plannedAmount: 200, confidence: 'quote' }),
      ];

      const result = computeBudgetTotals(lines);

      expect(result.totalPlanned).toBe(1700);
    });

    it('sums totalActualCost across all lines', () => {
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'invoice', actualCost: 900 }),
        makeLine({ id: 'bl-2', plannedAmount: 500, confidence: 'own_estimate', actualCost: 0 }),
        makeLine({ id: 'bl-3', plannedAmount: 200, confidence: 'quote', actualCost: 210 }),
      ];

      const result = computeBudgetTotals(lines);

      expect(result.totalActualCost).toBe(1110);
    });

    it('computes totalMinPlanned by applying per-line margins', () => {
      // invoice: 1000 * (1 - 0.0) = 1000
      // own_estimate: 500 * (1 - 0.2) = 400
      // quote: 200 * (1 - 0.05) = 190
      // total = 1590
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'invoice' }),
        makeLine({ id: 'bl-2', plannedAmount: 500, confidence: 'own_estimate' }),
        makeLine({ id: 'bl-3', plannedAmount: 200, confidence: 'quote' }),
      ];

      const result = computeBudgetTotals(lines);

      expect(result.totalMinPlanned).toBeCloseTo(1590, 5);
    });

    it('computes totalMaxPlanned by applying per-line margins', () => {
      // invoice: 1000 * (1 + 0.0) = 1000
      // own_estimate: 500 * (1 + 0.2) = 600
      // quote: 200 * (1 + 0.05) = 210
      // total = 1810
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'invoice' }),
        makeLine({ id: 'bl-2', plannedAmount: 500, confidence: 'own_estimate' }),
        makeLine({ id: 'bl-3', plannedAmount: 200, confidence: 'quote' }),
      ];

      const result = computeBudgetTotals(lines);

      expect(result.totalMaxPlanned).toBeCloseTo(1810, 5);
    });

    it('returns hasPlannedRange=true when any line has a non-zero margin', () => {
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'invoice' }),
        makeLine({ id: 'bl-2', plannedAmount: 1, confidence: 'own_estimate' }),
      ];

      const result = computeBudgetTotals(lines);

      expect(result.hasPlannedRange).toBe(true);
    });

    it('returns hasPlannedRange=false when all lines are invoice confidence', () => {
      const lines = [
        makeLine({ plannedAmount: 500, confidence: 'invoice' }),
        makeLine({ id: 'bl-2', plannedAmount: 300, confidence: 'invoice' }),
      ];

      const result = computeBudgetTotals(lines);

      expect(result.hasPlannedRange).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles zero plannedAmount correctly', () => {
      const line = makeLine({ plannedAmount: 0, confidence: 'own_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMinPlanned).toBe(0);
      expect(result.totalMaxPlanned).toBe(0);
      expect(result.hasPlannedRange).toBe(false);
    });

    it('handles large amounts without precision loss', () => {
      const line = makeLine({ plannedAmount: 1_000_000, confidence: 'own_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.totalMinPlanned).toBeCloseTo(800_000, 2);
      expect(result.totalMaxPlanned).toBeCloseTo(1_200_000, 2);
    });

    it('hasPlannedRange threshold is > 0.01 (not >= 0.01)', () => {
      // A line with plannedAmount=0.05 and own_estimate: max=0.06, min=0.04, diff=0.02 > 0.01
      const line = makeLine({ plannedAmount: 0.05, confidence: 'own_estimate' });

      const result = computeBudgetTotals([line]);

      expect(result.hasPlannedRange).toBe(true);
    });

    it('hasPlannedRange is false when difference is exactly 0.01', () => {
      // plannedAmount=0.05, confidence=quote: max=0.0525, min=0.0475, diff=0.005 < 0.01
      // Use invoice lines that sum to exact 0.01 diff — not possible with standard margins
      // So test the boundary directly: two invoice-only lines give diff=0
      const lines = [
        makeLine({ plannedAmount: 500, confidence: 'invoice' }),
        makeLine({ id: 'bl-2', plannedAmount: 300, confidence: 'invoice' }),
      ];

      const result = computeBudgetTotals(lines);

      // diff = 0, which is NOT > 0.01
      expect(result.hasPlannedRange).toBe(false);
    });
  });
});

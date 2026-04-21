import { describe, it, expect } from '@jest/globals';
import { computeSubsidyEffects } from './subsidyCalculationEngine.js';
import type { EffectiveBudgetLine, LinkedSubsidy } from './subsidyCalculationEngine.js';

function makeLine(overrides: Partial<EffectiveBudgetLine> = {}): EffectiveBudgetLine {
  return {
    id: `line-${Math.random().toString(36).slice(2, 8)}`,
    budgetCategoryId: 'cat-default',
    plannedAmount: 1000,
    confidence: 'invoice',
    ...overrides,
  };
}

function makeSubsidy(overrides: Partial<LinkedSubsidy> = {}): LinkedSubsidy {
  return {
    subsidyProgramId: `sub-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Subsidy',
    reductionType: 'percentage',
    reductionValue: 10,
    ...overrides,
  };
}

// Helper: empty maps (universal subsidy, no invoice overrides)
const emptyCategories = new Map<string, Set<string>>();
const emptyInvoices = new Map<string, number>();

// Helper: build a category restriction map for one subsidy
function categoryMap(subsidyId: string, categories: string[]): Map<string, Set<string>> {
  return new Map([[subsidyId, new Set(categories)]]);
}

describe('computeSubsidyEffects', () => {
  // -------------------------------------------------------------------------
  // Group 1: Empty inputs
  // -------------------------------------------------------------------------
  describe('empty inputs', () => {
    it('returns empty result with zeros when linkedSubsidies is empty', () => {
      const lines = [makeLine(), makeLine()];
      const result = computeSubsidyEffects(lines, [], emptyCategories, emptyInvoices);

      expect(result.subsidies).toHaveLength(0);
      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
    });

    it('fixed subsidy with no budget lines returns min === max === reductionValue', () => {
      const subsidy = makeSubsidy({ reductionType: 'fixed', reductionValue: 5000 });
      const result = computeSubsidyEffects([], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies).toHaveLength(1);
      expect(result.subsidies[0]!.minPayback).toBe(5000);
      expect(result.subsidies[0]!.maxPayback).toBe(5000);
      expect(result.minTotalPayback).toBe(5000);
      expect(result.maxTotalPayback).toBe(5000);
    });

    it('percentage subsidy with no budget lines returns min === max === 0', () => {
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const result = computeSubsidyEffects([], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies).toHaveLength(1);
      expect(result.subsidies[0]!.minPayback).toBe(0);
      expect(result.subsidies[0]!.maxPayback).toBe(0);
      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2: Percentage subsidy — confidence margins
  // -------------------------------------------------------------------------
  describe('percentage subsidy with confidence margins', () => {
    it('own_estimate (±20%), 1000 planned, 10% rate → min=80, max=120', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const result = computeSubsidyEffects([line], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies[0]!.minPayback).toBe(80);
      expect(result.subsidies[0]!.maxPayback).toBe(120);
    });

    it('professional_estimate (±10%), 1000 planned, 10% rate → min=90, max=110', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'professional_estimate' });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const result = computeSubsidyEffects([line], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies[0]!.minPayback).toBe(90);
      expect(result.subsidies[0]!.maxPayback).toBe(110);
    });

    it('quote (±5%), 1000 planned, 10% rate → min=95, max=105', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'quote' });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const result = computeSubsidyEffects([line], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies[0]!.minPayback).toBe(95);
      expect(result.subsidies[0]!.maxPayback).toBe(105);
    });

    it('invoice (±0%), 1000 planned, 10% rate → min === max === 100', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'invoice' });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const result = computeSubsidyEffects([line], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies[0]!.minPayback).toBe(100);
      expect(result.subsidies[0]!.maxPayback).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Group 3: Invoice overrides
  // -------------------------------------------------------------------------
  describe('invoice overrides', () => {
    it('line invoiced at 800, planned=1000, own_estimate, 10% rate → min=max=80', () => {
      const line = makeLine({ id: 'line-a', plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const invoices = new Map([['line-a', 800]]);
      const result = computeSubsidyEffects([line], [subsidy], emptyCategories, invoices);

      expect(result.subsidies[0]!.minPayback).toBe(80);
      expect(result.subsidies[0]!.maxPayback).toBe(80);
    });

    it('mixed: one invoiced (800), one not (1000, own_estimate), 10% → min=160, max=200', () => {
      const invoicedLine = makeLine({
        id: 'line-a',
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const uninvoicedLine = makeLine({
        id: 'line-b',
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const invoices = new Map([['line-a', 800]]);
      const result = computeSubsidyEffects(
        [invoicedLine, uninvoicedLine],
        [subsidy],
        emptyCategories,
        invoices,
      );

      // invoiced: min=max=80; uninvoiced own_estimate: min=80, max=120 → totals: min=160, max=200
      expect(result.subsidies[0]!.minPayback).toBe(160);
      expect(result.subsidies[0]!.maxPayback).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4: Fixed subsidy
  // -------------------------------------------------------------------------
  describe('fixed subsidy', () => {
    it('fixed 5000 with budget lines → min=max=5000 regardless of line amounts', () => {
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'own_estimate' }),
        makeLine({ plannedAmount: 2000, confidence: 'quote' }),
      ];
      const subsidy = makeSubsidy({ reductionType: 'fixed', reductionValue: 5000 });
      const result = computeSubsidyEffects(lines, [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies[0]!.minPayback).toBe(5000);
      expect(result.subsidies[0]!.maxPayback).toBe(5000);
    });

    it('fixed 5000 with zero budget lines → min=max=5000', () => {
      const subsidy = makeSubsidy({ reductionType: 'fixed', reductionValue: 5000 });
      const result = computeSubsidyEffects([], [subsidy], emptyCategories, emptyInvoices);

      expect(result.subsidies[0]!.minPayback).toBe(5000);
      expect(result.subsidies[0]!.maxPayback).toBe(5000);
    });

    it('two fixed subsidies (1000 + 2000) → totalMin=totalMax=3000', () => {
      const sub1 = makeSubsidy({
        subsidyProgramId: 'sub-1',
        reductionType: 'fixed',
        reductionValue: 1000,
      });
      const sub2 = makeSubsidy({
        subsidyProgramId: 'sub-2',
        reductionType: 'fixed',
        reductionValue: 2000,
      });
      const result = computeSubsidyEffects([], [sub1, sub2], emptyCategories, emptyInvoices);

      expect(result.subsidies).toHaveLength(2);
      expect(result.minTotalPayback).toBe(3000);
      expect(result.maxTotalPayback).toBe(3000);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5: Category restriction
  // -------------------------------------------------------------------------
  describe('category restriction', () => {
    it('subsidy restricted to cat-A; lines in cat-A (1000) and cat-B (500), 10%, invoice → min=max=100', () => {
      const subsidy = makeSubsidy({
        subsidyProgramId: 'sub-cat-a',
        reductionType: 'percentage',
        reductionValue: 10,
      });
      const lineA = makeLine({
        budgetCategoryId: 'cat-A',
        plannedAmount: 1000,
        confidence: 'invoice',
      });
      const lineB = makeLine({
        budgetCategoryId: 'cat-B',
        plannedAmount: 500,
        confidence: 'invoice',
      });
      const catMap = categoryMap('sub-cat-a', ['cat-A']);
      const result = computeSubsidyEffects([lineA, lineB], [subsidy], catMap, emptyInvoices);

      // Only cat-A line contributes: 1000 * 0.10 = 100
      expect(result.subsidies[0]!.minPayback).toBe(100);
      expect(result.subsidies[0]!.maxPayback).toBe(100);
    });

    it('universal subsidy (empty Set); all lines contribute', () => {
      const subsidy = makeSubsidy({
        subsidyProgramId: 'sub-universal',
        reductionType: 'percentage',
        reductionValue: 10,
      });
      const lineA = makeLine({
        budgetCategoryId: 'cat-A',
        plannedAmount: 1000,
        confidence: 'invoice',
      });
      const lineB = makeLine({
        budgetCategoryId: 'cat-B',
        plannedAmount: 500,
        confidence: 'invoice',
      });
      // Empty set = universal
      const catMap = new Map<string, Set<string>>([['sub-universal', new Set()]]);
      const result = computeSubsidyEffects([lineA, lineB], [subsidy], catMap, emptyInvoices);

      // Both lines contribute: (1000 + 500) * 0.10 = 150
      expect(result.subsidies[0]!.minPayback).toBe(150);
      expect(result.subsidies[0]!.maxPayback).toBe(150);
    });

    it('null budgetCategoryId + restricted subsidy → line is excluded', () => {
      const subsidy = makeSubsidy({
        subsidyProgramId: 'sub-restricted',
        reductionType: 'percentage',
        reductionValue: 10,
      });
      const nullLine = makeLine({
        budgetCategoryId: null,
        plannedAmount: 1000,
        confidence: 'invoice',
      });
      const catMap = categoryMap('sub-restricted', ['cat-A']);
      const result = computeSubsidyEffects([nullLine], [subsidy], catMap, emptyInvoices);

      // null category cannot match any restricted category → excluded
      expect(result.subsidies[0]!.minPayback).toBe(0);
      expect(result.subsidies[0]!.maxPayback).toBe(0);
    });

    it('null budgetCategoryId + universal subsidy → line is included', () => {
      const subsidy = makeSubsidy({
        subsidyProgramId: 'sub-universal2',
        reductionType: 'percentage',
        reductionValue: 10,
      });
      const nullLine = makeLine({
        budgetCategoryId: null,
        plannedAmount: 1000,
        confidence: 'invoice',
      });
      // Not present in categoryMap at all → isUniversal = true
      const result = computeSubsidyEffects([nullLine], [subsidy], emptyCategories, emptyInvoices);

      // Universal: null budgetCategoryId is included → 1000 * 0.10 = 100
      expect(result.subsidies[0]!.minPayback).toBe(100);
      expect(result.subsidies[0]!.maxPayback).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6: Multiple subsidies
  // -------------------------------------------------------------------------
  describe('multiple subsidies', () => {
    it('two percentage subsidies with different rates → correct individual entries and totals', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'invoice' });
      const sub1 = makeSubsidy({
        subsidyProgramId: 'sub-1',
        reductionType: 'percentage',
        reductionValue: 10,
      });
      const sub2 = makeSubsidy({
        subsidyProgramId: 'sub-2',
        reductionType: 'percentage',
        reductionValue: 20,
      });
      const result = computeSubsidyEffects([line], [sub1, sub2], emptyCategories, emptyInvoices);

      expect(result.subsidies).toHaveLength(2);
      const effect1 = result.subsidies.find((s) => s.subsidyProgramId === 'sub-1')!;
      const effect2 = result.subsidies.find((s) => s.subsidyProgramId === 'sub-2')!;
      expect(effect1.minPayback).toBe(100);
      expect(effect1.maxPayback).toBe(100);
      expect(effect2.minPayback).toBe(200);
      expect(effect2.maxPayback).toBe(200);
      expect(result.minTotalPayback).toBe(300);
      expect(result.maxTotalPayback).toBe(300);
    });

    it('one percentage (10%) + one fixed (500) → correct entries', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'invoice' });
      const percentSub = makeSubsidy({
        subsidyProgramId: 'sub-pct',
        reductionType: 'percentage',
        reductionValue: 10,
      });
      const fixedSub = makeSubsidy({
        subsidyProgramId: 'sub-fixed',
        reductionType: 'fixed',
        reductionValue: 500,
      });
      const result = computeSubsidyEffects(
        [line],
        [percentSub, fixedSub],
        emptyCategories,
        emptyInvoices,
      );

      expect(result.subsidies).toHaveLength(2);
      const pctEffect = result.subsidies.find((s) => s.subsidyProgramId === 'sub-pct')!;
      const fixedEffect = result.subsidies.find((s) => s.subsidyProgramId === 'sub-fixed')!;
      expect(pctEffect.minPayback).toBe(100);
      expect(pctEffect.maxPayback).toBe(100);
      expect(fixedEffect.minPayback).toBe(500);
      expect(fixedEffect.maxPayback).toBe(500);
      expect(result.minTotalPayback).toBe(600);
      expect(result.maxTotalPayback).toBe(600);
    });
  });

  // -------------------------------------------------------------------------
  // Group 7: Aggregation invariants
  // -------------------------------------------------------------------------
  describe('aggregation invariants', () => {
    it('minTotalPayback equals sum of each subsidy minPayback', () => {
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'quote' }),
        makeLine({ plannedAmount: 2000, confidence: 'own_estimate' }),
      ];
      const subsidies = [
        makeSubsidy({ subsidyProgramId: 'sub-a', reductionType: 'percentage', reductionValue: 15 }),
        makeSubsidy({ subsidyProgramId: 'sub-b', reductionType: 'fixed', reductionValue: 300 }),
        makeSubsidy({ subsidyProgramId: 'sub-c', reductionType: 'percentage', reductionValue: 5 }),
      ];
      const result = computeSubsidyEffects(lines, subsidies, emptyCategories, emptyInvoices);

      const sumMin = result.subsidies.reduce((acc, s) => acc + s.minPayback, 0);
      expect(result.minTotalPayback).toBeCloseTo(sumMin, 10);
    });

    it('maxTotalPayback equals sum of each subsidy maxPayback', () => {
      const lines = [
        makeLine({ plannedAmount: 1000, confidence: 'quote' }),
        makeLine({ plannedAmount: 2000, confidence: 'own_estimate' }),
      ];
      const subsidies = [
        makeSubsidy({ subsidyProgramId: 'sub-a', reductionType: 'percentage', reductionValue: 15 }),
        makeSubsidy({ subsidyProgramId: 'sub-b', reductionType: 'fixed', reductionValue: 300 }),
        makeSubsidy({ subsidyProgramId: 'sub-c', reductionType: 'percentage', reductionValue: 5 }),
      ];
      const result = computeSubsidyEffects(lines, subsidies, emptyCategories, emptyInvoices);

      const sumMax = result.subsidies.reduce((acc, s) => acc + s.maxPayback, 0);
      expect(result.maxTotalPayback).toBeCloseTo(sumMax, 10);
    });
  });

  // -------------------------------------------------------------------------
  // Group 8: Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('unknown confidence level falls back to own_estimate margin (±20%)', () => {
      const line = makeLine({ plannedAmount: 1000, confidence: 'unknown_level' });
      const subsidy = makeSubsidy({ reductionType: 'percentage', reductionValue: 10 });
      const result = computeSubsidyEffects([line], [subsidy], emptyCategories, emptyInvoices);

      // own_estimate margin = 0.20 → min=80, max=120
      expect(result.subsidies[0]!.minPayback).toBe(80);
      expect(result.subsidies[0]!.maxPayback).toBe(120);
    });
  });
});

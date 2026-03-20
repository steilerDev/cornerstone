import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import type { ConfidenceLevel } from '@cornerstone/shared';

export interface EffectiveBudgetLine {
  id: string;
  budgetCategoryId: string | null;
  plannedAmount: number;
  confidence: string;
}

export interface LinkedSubsidy {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
}

export interface SubsidyEffect {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  minPayback: number;
  maxPayback: number;
}

export interface SubsidyEffectsResult {
  subsidies: SubsidyEffect[];
  minTotalPayback: number;
  maxTotalPayback: number;
}

/**
 * Pure function: compute subsidy payback effects for a single entity.
 *
 * invoiceMap can contain either:
 *   - number (legacy, for backward compatibility) → treated as non-quotation actual cost
 *   - { actualCost: number; isQuotation: boolean } (quotation-aware)
 */
export function computeSubsidyEffects(
  budgetLines: EffectiveBudgetLine[],
  linkedSubsidies: LinkedSubsidy[],
  subsidyCategoryMap: Map<string, Set<string>>,
  invoiceMap: Map<string, number | { actualCost: number; isQuotation: boolean }>,
): SubsidyEffectsResult {
  if (linkedSubsidies.length === 0) {
    return { subsidies: [], minTotalPayback: 0, maxTotalPayback: 0 };
  }

  const effectiveLines = budgetLines.map((line) => {
    if (invoiceMap.has(line.id)) {
      const invoiceData = invoiceMap.get(line.id)!;
      const actualCost = typeof invoiceData === 'number' ? invoiceData : invoiceData.actualCost;
      const isQuotation = typeof invoiceData === 'number' ? false : invoiceData.isQuotation;

      if (isQuotation) {
        // Quotation invoices use ±5% margin around itemized amount
        return {
          budgetCategoryId: line.budgetCategoryId,
          minAmount: actualCost * 0.95,
          maxAmount: actualCost * 1.05,
        };
      }
      // Non-quotation invoices: fixed actual cost
      return {
        budgetCategoryId: line.budgetCategoryId,
        minAmount: actualCost,
        maxAmount: actualCost,
      };
    }
    const margin =
      CONFIDENCE_MARGINS[line.confidence as ConfidenceLevel] ?? CONFIDENCE_MARGINS.own_estimate;
    return {
      budgetCategoryId: line.budgetCategoryId,
      minAmount: line.plannedAmount * (1 - margin),
      maxAmount: line.plannedAmount * (1 + margin),
    };
  });

  const subsidies: SubsidyEffect[] = [];
  let minTotalPayback = 0;
  let maxTotalPayback = 0;

  for (const subsidy of linkedSubsidies) {
    const applicableCategories = subsidyCategoryMap.get(subsidy.subsidyProgramId);
    const isUniversal = !applicableCategories || applicableCategories.size === 0;

    let minPayback = 0;
    let maxPayback = 0;

    if (subsidy.reductionType === 'percentage') {
      const rate = subsidy.reductionValue / 100;
      for (const line of effectiveLines) {
        const matches =
          isUniversal ||
          (line.budgetCategoryId !== null && applicableCategories!.has(line.budgetCategoryId));
        if (matches) {
          minPayback += line.minAmount * rate;
          maxPayback += line.maxAmount * rate;
        }
      }
    } else {
      minPayback = subsidy.reductionValue;
      maxPayback = subsidy.reductionValue;
    }

    subsidies.push({
      subsidyProgramId: subsidy.subsidyProgramId,
      name: subsidy.name,
      reductionType: subsidy.reductionType,
      reductionValue: subsidy.reductionValue,
      minPayback,
      maxPayback,
    });
    minTotalPayback += minPayback;
    maxTotalPayback += maxPayback;
  }

  return { subsidies, minTotalPayback, maxTotalPayback };
}

// ── Subsidy cap enforcement ────────────────────────────────────────────────

export interface SubsidyCapMeta {
  subsidyProgramId: string;
  name: string;
  reductionType: 'percentage' | 'fixed';
  reductionValue: number;
  maximumAmount: number | null;
}

export interface PerSubsidyTotals {
  subsidyProgramId: string;
  uncappedMinPayback: number;
  uncappedMaxPayback: number;
}

export interface OversubscribedSubsidyResult {
  subsidyProgramId: string;
  name: string;
  maximumAmount: number;
  maxPayout: number;
  uncappedMinPayback: number;
  uncappedMaxPayback: number;
  minExcess: number;
  maxExcess: number;
}

export interface SubsidyCapResult {
  cappedMinPayback: number;
  cappedMaxPayback: number;
  oversubscribedSubsidies: OversubscribedSubsidyResult[];
}

/**
 * Pure function: apply maximumAmount caps to aggregated subsidy payback totals.
 *
 * For each subsidy with a non-null maximumAmount:
 * - Percentage subsidies: maxPayout = maximumAmount × (reductionValue / 100)
 * - Fixed subsidies: maxPayout = maximumAmount
 * - If uncapped payback > maxPayout, cap it and record the excess
 */
export function applySubsidyCaps(
  perSubsidyTotals: PerSubsidyTotals[],
  subsidyMeta: SubsidyCapMeta[],
): SubsidyCapResult {
  const metaMap = new Map<string, SubsidyCapMeta>();
  for (const meta of subsidyMeta) {
    metaMap.set(meta.subsidyProgramId, meta);
  }

  let cappedMinPayback = 0;
  let cappedMaxPayback = 0;
  const oversubscribedSubsidies: OversubscribedSubsidyResult[] = [];

  for (const totals of perSubsidyTotals) {
    const meta = metaMap.get(totals.subsidyProgramId);
    if (!meta || meta.maximumAmount === null) {
      // No cap — pass through uncapped values
      cappedMinPayback += totals.uncappedMinPayback;
      cappedMaxPayback += totals.uncappedMaxPayback;
      continue;
    }

    // Compute maxPayout based on reduction type
    const maxPayout =
      meta.reductionType === 'percentage'
        ? meta.maximumAmount * (meta.reductionValue / 100)
        : meta.maximumAmount;

    const cappedMin = Math.min(totals.uncappedMinPayback, maxPayout);
    const cappedMax = Math.min(totals.uncappedMaxPayback, maxPayout);
    const maxExcess = Math.max(0, totals.uncappedMaxPayback - maxPayout);

    cappedMinPayback += cappedMin;
    cappedMaxPayback += cappedMax;

    if (maxExcess > 0) {
      const minExcess = Math.max(0, totals.uncappedMinPayback - maxPayout);
      oversubscribedSubsidies.push({
        subsidyProgramId: totals.subsidyProgramId,
        name: meta.name,
        maximumAmount: meta.maximumAmount,
        maxPayout,
        uncappedMinPayback: totals.uncappedMinPayback,
        uncappedMaxPayback: totals.uncappedMaxPayback,
        minExcess,
        maxExcess,
      });
    }
  }

  return { cappedMinPayback, cappedMaxPayback, oversubscribedSubsidies };
}

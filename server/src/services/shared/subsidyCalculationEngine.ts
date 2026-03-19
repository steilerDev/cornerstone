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

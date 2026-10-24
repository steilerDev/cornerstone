import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetCategory, BudgetSource } from '@cornerstone/shared';
import { fetchBudgetCategories } from '../../lib/budgetCategoriesApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import type { CostLineGridOption } from './types.js';

export interface CostLineOptions {
  readonly categories: readonly BudgetCategory[];
  readonly sources: readonly BudgetSource[];
  /** Select options (display names resolved), in the server's order. */
  readonly categoryOptions: readonly CostLineGridOption[];
  readonly sourceOptions: readonly CostLineGridOption[];
  /** The source new lines use unless the user picks another. */
  readonly discretionarySourceId: string | null;
  readonly loading: boolean;
  readonly failed: boolean;
}

/** Cost categories and funding sources, loaded once per mount. */
export function useCostLineOptions(): CostLineOptions {
  const { t: tSettings } = useTranslation('settings');
  const [categories, setCategories] = useState<readonly BudgetCategory[]>([]);
  const [sources, setSources] = useState<readonly BudgetSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [categoryResponse, sourceResponse] = await Promise.all([
          fetchBudgetCategories(),
          fetchBudgetSources(),
        ]);
        if (cancelled) return;
        setCategories(categoryResponse.categories);
        setSources(sourceResponse.budgetSources);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    categories,
    sources,
    categoryOptions: categories.map((category) => ({
      value: category.id,
      label: getCategoryDisplayName(tSettings, category.name, category.translationKey),
    })),
    sourceOptions: sources.map((source) => ({ value: source.id, label: source.name })),
    discretionarySourceId: sources.find((source) => source.isDiscretionary)?.id ?? null,
    loading,
    failed,
  };
}

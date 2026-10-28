import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HouseholdItemCategoryEntity } from '@cornerstone/shared';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import {
  DateRangeFilter,
  NumberRangeFilter,
} from '../../components/ObjectList/ObjectListRangeFilters.js';
import { ObjectListSelectFilter } from '../../components/ObjectList/ObjectListSelectFilter.js';
import type { ObjectListFilterDef } from '../../components/ObjectList/types.js';
import { useAreas } from '../../hooks/useAreas.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { NONE_KEY } from './purchasesListUrl.js';

export interface PurchaseCategories {
  readonly categories: readonly HouseholdItemCategoryEntity[];
  readonly failure: FetchFailure | null;
}

const NO_CATEGORIES: PurchaseCategories = { categories: [], failure: null };

/** The purchase categories for the Category filter and column, loaded once; a failure is kept as data. */
export function usePurchaseCategories(): PurchaseCategories {
  const [result, setResult] = useState<PurchaseCategories>(NO_CATEGORIES);
  useEffect(() => {
    let cancelled = false;
    fetchHouseholdItemCategories().then(
      (response) => {
        if (!cancelled) setResult({ categories: response.categories, failure: null });
      },
      (err: unknown) => {
        if (!cancelled) setResult({ categories: [], failure: toFetchFailure(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return result;
}

/**
 * The filter defs of the Purchases Filters panel, in order: Category, Area, Company, Target
 * delivery, Delivered on, Expected cost, Invoiced, Grants, After grants and Cost lines. The URL
 * params keep the names and serialisations of the list this replaced.
 */
export function usePurchaseListFilters(
  categoryOptions: PurchaseCategories,
): readonly ObjectListFilterDef[] {
  const { t } = useTranslation('householdItems');
  const { t: tSettings } = useTranslation('settings');
  const { areas, error: areasError } = useAreas();
  const { categories, failure } = categoryOptions;

  return useMemo(() => {
    const dateLabels = { from: t('list.filters.from'), to: t('list.filters.to') };
    const rangeLabels = { min: t('list.filters.min'), max: t('list.filters.max') };
    const money = (param: string, label: string): ObjectListFilterDef => ({
      param,
      label,
      render: (ctx) => (
        <NumberRangeFilter
          ctx={ctx}
          testId={`purchases-filter-${param}`}
          labels={rangeLabels}
          step="0.01"
        />
      ),
    });
    return [
      {
        param: 'category',
        label: t('list.filters.category'),
        render: (ctx) => (
          <ObjectListSelectFilter
            ctx={ctx}
            label={t('list.filters.category')}
            emptyLabel={t('list.filters.anyCategory')}
            // A legacy multi-value CSV shows its first id; a new pick replaces the whole value.
            value={(ctx.value ?? '').split(',')[0]!}
            options={categories.map((category) => ({
              value: category.id,
              label: getCategoryDisplayName(tSettings, category.name, category.translationKey),
            }))}
            failure={failure}
            failureFallback={t('list.filters.optionsFailed')}
            testId="purchases-filter-category"
          />
        ),
      },
      {
        param: 'areaId',
        label: t('list.filters.area'),
        render: (ctx) => (
          <>
            <EntityPicker
              kind="area"
              id={ctx.id}
              areas={areas}
              // A legacy multi-value CSV shows its first id; a new pick replaces the whole value.
              value={(ctx.value ?? '').split(',')[0]!}
              onChange={(id) => ctx.onChange(id === '' ? null : id)}
              specialOptions={[{ id: NONE_KEY, label: t('list.group.noArea') }]}
              create="off"
              placeholder={t('list.filters.area')}
            />
            <FormError variant="field" message={areasError} />
          </>
        ),
      },
      {
        param: 'vendorId',
        label: t('list.filters.company'),
        render: (ctx) => (
          <EntityPicker
            kind="company"
            id={ctx.id}
            value={ctx.value ?? ''}
            onChange={(id) => ctx.onChange(id === '' ? null : id)}
            // A company id that no longer exists (old link or bookmark) is dropped from the URL.
            onUnknownCompany={() => ctx.onChange(null)}
            create="off"
            placeholder={t('list.filters.company')}
          />
        ),
      },
      {
        param: 'targetDelivery',
        label: t('list.filters.targetDelivery'),
        render: (ctx) => (
          <DateRangeFilter ctx={ctx} testId="purchases-filter-targetDelivery" labels={dateLabels} />
        ),
      },
      {
        param: 'actualDelivery',
        label: t('list.filters.deliveredOn'),
        render: (ctx) => (
          <DateRangeFilter ctx={ctx} testId="purchases-filter-actualDelivery" labels={dateLabels} />
        ),
      },
      money('plannedCost', t('list.filters.expectedCost')),
      money('actualCost', t('list.filters.invoiced')),
      money('grants', t('list.filters.grants')),
      money('afterGrants', t('list.filters.afterGrants')),
      {
        param: 'budgetLines',
        label: t('list.filters.costLines'),
        render: (ctx) => (
          <NumberRangeFilter
            ctx={ctx}
            testId="purchases-filter-budgetLines"
            labels={rangeLabels}
            step="1"
          />
        ),
      },
    ];
  }, [t, tSettings, areas, areasError, categories, failure]);
}

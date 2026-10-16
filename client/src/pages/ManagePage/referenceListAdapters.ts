import type {
  BudgetCategory,
  HouseholdItemCategoryEntity,
  OrientationResponse,
} from '@cornerstone/shared';
import type {
  ReferenceListItem,
  ReferenceListValues,
} from '../../components/ReferenceList/ReferenceList.js';
import type { ReferenceListAdapter } from '../../hooks/useReferenceListData.js';
import {
  createBudgetCategory,
  deleteBudgetCategory,
  fetchBudgetCategories,
  reorderBudgetCategories,
  updateBudgetCategory,
} from '../../lib/budgetCategoriesApi.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import {
  createHouseholdItemCategory,
  deleteHouseholdItemCategory,
  fetchHouseholdItemCategories,
  reorderHouseholdItemCategories,
  updateHouseholdItemCategory,
} from '../../lib/householdItemCategoriesApi.js';
import {
  createOrientation,
  deleteOrientation,
  fetchOrientations,
  reorderOrientations,
  updateOrientation,
} from '../../lib/orientationApi.js';

type Changes = Partial<ReferenceListValues>;
type Translate = (key: string, options?: { defaultValue: string }) => string;

/** Cost categories (budget categories): name, description and color. */
export const costCategoryAdapter: ReferenceListAdapter<
  BudgetCategory,
  ReferenceListValues,
  Changes
> = {
  list: () => fetchBudgetCategories().then((r) => r.categories),
  create: (values) => createBudgetCategory(values),
  update: (id, changes) => updateBudgetCategory(id, changes),
  remove: (id) => deleteBudgetCategory(id),
  reorder: (ids) => reorderBudgetCategories(ids),
};

/** Purchase categories (household item categories): name and color. */
export const purchaseCategoryAdapter: ReferenceListAdapter<
  HouseholdItemCategoryEntity,
  ReferenceListValues,
  Changes
> = {
  list: () => fetchHouseholdItemCategories().then((r) => r.categories),
  create: (values) => createHouseholdItemCategory({ name: values.name, color: values.color }),
  update: (id, changes) =>
    updateHouseholdItemCategory(id, {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.color !== undefined ? { color: changes.color } : {}),
    }),
  remove: (id) => deleteHouseholdItemCategory(id),
  reorder: (ids) => reorderHouseholdItemCategories(ids),
};

/** Photo orientations: name and description. */
export const orientationAdapter: ReferenceListAdapter<
  OrientationResponse,
  ReferenceListValues,
  Changes
> = {
  list: () => fetchOrientations().then((r) => r.orientations),
  create: (values) => createOrientation({ name: values.name, description: values.description }),
  update: (id, changes) =>
    updateOrientation(id, {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
    }),
  remove: (id) => deleteOrientation(id),
  reorder: (ids) => reorderOrientations(ids),
};

/** `t` is the settings-namespace translate function (built-in names live there). */
export function toCostCategoryItem(row: BudgetCategory, t: Translate): ReferenceListItem {
  return {
    id: row.id,
    name: getCategoryDisplayName(t, row.name, row.translationKey),
    translated: row.translationKey !== null,
    description: row.description,
    color: row.color,
  };
}

export function toPurchaseCategoryItem(
  row: HouseholdItemCategoryEntity,
  t: Translate,
): ReferenceListItem {
  return {
    id: row.id,
    name: getCategoryDisplayName(t, row.name, row.translationKey),
    translated: row.translationKey !== null,
    color: row.color,
  };
}

export function toOrientationItem(row: OrientationResponse): ReferenceListItem {
  return { id: row.id, name: row.name, description: row.description };
}

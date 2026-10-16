import { get, post, patch, del } from './apiClient.js';
import type {
  HouseholdItemCategoryEntity,
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
  ReorderReferenceListRequest,
} from '@cornerstone/shared';

/**
 * Fetches all household item categories, sorted by sort order.
 */
export function fetchHouseholdItemCategories(): Promise<{
  categories: HouseholdItemCategoryEntity[];
}> {
  return get<{ categories: HouseholdItemCategoryEntity[] }>('/household-item-categories');
}

/**
 * Creates a new household item category.
 */
export function createHouseholdItemCategory(
  data: CreateHouseholdItemCategoryRequest,
): Promise<HouseholdItemCategoryEntity> {
  return post<HouseholdItemCategoryEntity>('/household-item-categories', data);
}

/**
 * Updates an existing household item category.
 */
export function updateHouseholdItemCategory(
  id: string,
  data: UpdateHouseholdItemCategoryRequest,
): Promise<HouseholdItemCategoryEntity> {
  return patch<HouseholdItemCategoryEntity>(`/household-item-categories/${id}`, data);
}

/**
 * Deletes a household item category.
 * @throws {ApiClientError} with statusCode 409 if the category is in use.
 */
export function deleteHouseholdItemCategory(id: string): Promise<void> {
  return del<void>(`/household-item-categories/${id}`);
}

/**
 * Atomically reorders the whole list: `ids` is every category id exactly once, in the new order.
 * @throws {ApiClientError} with code REORDER_SET_MISMATCH (409) when the set of ids is stale.
 */
export async function reorderHouseholdItemCategories(
  ids: string[],
): Promise<HouseholdItemCategoryEntity[]> {
  const body: ReorderReferenceListRequest = { ids };
  const response = await patch<{ categories: HouseholdItemCategoryEntity[] }>(
    '/household-item-categories/reorder',
    body,
  );
  return response.categories;
}

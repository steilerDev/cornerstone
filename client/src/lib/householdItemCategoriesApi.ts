import { get, post, patch, del } from './apiClient.js';
import type {
  HouseholdItemCategoryEntity,
  CreateHouseholdItemCategoryRequest,
  UpdateHouseholdItemCategoryRequest,
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

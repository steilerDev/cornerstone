/**
 * Budget category types and interfaces.
 * Budget categories organize construction costs (e.g., Materials, Labor, Permits).
 */

/**
 * Budget category entity as returned by the API.
 */
export interface BudgetCategory {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new budget category.
 */
export interface CreateBudgetCategoryRequest {
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

/**
 * Request body for updating a budget category.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateBudgetCategoryRequest {
  name?: string;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
}

/**
 * Response for GET /api/budget-categories - list all categories.
 */
export interface BudgetCategoryListResponse {
  categories: BudgetCategory[];
}

/**
 * Response for single-category endpoints (POST, GET by ID, PATCH).
 * The category object is returned directly (not wrapped).
 */
export type BudgetCategoryResponse = BudgetCategory;

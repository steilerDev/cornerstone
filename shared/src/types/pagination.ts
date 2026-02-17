/**
 * Generic pagination metadata for paginated list responses.
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Generic paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

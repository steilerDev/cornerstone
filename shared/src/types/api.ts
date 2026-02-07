/**
 * Standard API error shape used across all endpoints.
 */
export interface ApiError {
  /** Machine-readable error code (e.g., "RESOURCE_NOT_FOUND") */
  code: string;
  /** Human-readable error description */
  message: string;
  /** Optional additional error details */
  details?: Record<string, unknown>;
}

/**
 * Standard API error response wrapper.
 * All error responses from the API follow this shape.
 */
export interface ApiErrorResponse {
  error: ApiError;
}

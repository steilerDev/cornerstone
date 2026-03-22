/**
 * Filter metadata for numeric columns in list API responses.
 *
 * Provides min/max bounds to allow the frontend to configure appropriate
 * slider ranges based on actual data, not hardcoded defaults.
 */

/** Min/max bounds for a single filterable numeric column. */
export interface FilterColumnMeta {
  min: number;
  max: number;
}

/** Filter metadata in list API responses. Keys are camelCase column names. */
export interface FilterMeta {
  [columnKey: string]: FilterColumnMeta;
}

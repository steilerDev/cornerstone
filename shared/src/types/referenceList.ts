/** Body of PATCH /api/{budget-categories|household-item-categories|orientations}/reorder (#2215). */
export interface ReorderReferenceListRequest {
  /** Every id of the list exactly once, in the new order (index 0 first). */
  ids: string[];
}

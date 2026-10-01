/** Which of DataTable's two simultaneously-mounted renderings a callback is producing. */
export type DataTableSurface = 'table' | 'card';

/**
 * Builds a data-testid that is unique across DataTable's dual mount (desktop table + mobile
 * cards are both always in the DOM). Table: `${prefix}-${id}`. Card: `${prefix}-mobile-${id}`.
 * Every data-testid emitted from ColumnDef.render or DataTableProps.renderActions MUST use this.
 */
export function dataTableTestId(
  prefix: string,
  id: string | number,
  surface: DataTableSurface,
): string {
  return surface === 'card' ? `${prefix}-mobile-${id}` : `${prefix}-${id}`;
}

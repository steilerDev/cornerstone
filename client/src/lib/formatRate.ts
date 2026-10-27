/**
 * A grant or loan rate for display: whole rates without decimals ("30%"), others with two
 * ("2.50%"). `formatPercent` is the locale-bound formatter from `useFormatters()`.
 */
export function formatRate(
  rate: number,
  formatPercent: (rate: number, digits?: number) => string,
): string {
  return formatPercent(rate, Number.isInteger(rate) ? 0 : 2);
}

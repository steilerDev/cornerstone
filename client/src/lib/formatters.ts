/**
 * Shared formatting utilities for the Cornerstone frontend.
 *
 * All budget-related pages use these helpers to ensure consistent presentation
 * of currency, percentages, and dates throughout the application.
 */

/**
 * Format a number as a currency string in EUR.
 *
 * Uses `Intl.NumberFormat` so the output respects locale conventions for
 * thousands separators and decimal points while always showing 2 fraction
 * digits and the € symbol.
 *
 * Negative values are rendered correctly (e.g. −€1,234.56).
 *
 * @param amount - The numeric amount to format (may be negative).
 * @returns A locale-formatted currency string, e.g. "€1,234.56".
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number as a percentage string with 2 decimal places.
 *
 * @param rate - The raw percentage value (e.g. 3.5 → "3.50%").
 * @returns A formatted percentage string.
 */
export function formatPercent(rate: number): string {
  return `${rate.toFixed(2)}%`;
}

/**
 * Shared formatting utilities for the Cornerstone frontend.
 *
 * All pages use these helpers to ensure consistent presentation
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

/**
 * Format an ISO date string (YYYY-MM-DD or ISO timestamp) as a human-readable
 * localized date.
 *
 * Parses the date components directly from the string to avoid UTC midnight
 * timezone shift issues that can occur when passing an ISO string to
 * `new Date()` directly.
 *
 * @param dateStr - An ISO date string or null/undefined.
 * @param fallback - Value returned when dateStr is null/undefined/invalid. Defaults to '—'.
 * @returns A localized date string, e.g. "Feb 27, 2026", or the fallback value.
 */
export function formatDate(dateStr: string | null | undefined, fallback = '—'): string {
  if (!dateStr) return fallback;
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Computes the actual/effective duration in calendar days from start and end date strings.
 * For items in-progress with only a start date, computes elapsed days from start to today.
 * Returns null if the start date is not available.
 *
 * @param startDate - ISO date string for the start date, or null.
 * @param endDate - ISO date string for the end date, or null (uses today if omitted).
 * @param today - The current date reference used when endDate is null.
 * @returns Duration in whole calendar days, or null if startDate is not available.
 */
export function computeActualDuration(
  startDate: string | null,
  endDate: string | null,
  today: Date,
): number | null {
  if (!startDate) return null;
  const startMs = new Date(startDate).getTime();
  const endMs = endDate ? new Date(endDate).getTime() : today.getTime();
  const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : null;
}

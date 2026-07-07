/**
 * Shared formatting utilities for the Cornerstone frontend.
 *
 * All pages use these helpers to ensure consistent presentation
 * of currency, percentages, and dates throughout the application.
 */

/**
 * Format a number as a currency string.
 *
 * Uses `Intl.NumberFormat` so the output respects locale conventions for
 * thousands separators and decimal points while always showing 2 fraction
 * digits and the currency symbol.
 *
 * Negative values are rendered correctly (e.g. −€1,234.56).
 *
 * @param amount - The numeric amount to format (may be negative).
 * @param locale - The locale for number formatting (default: 'en-US').
 * @param currency - The currency code (default: 'EUR').
 * @returns A locale-formatted currency string, e.g. "€1,234.56".
 */
export function formatCurrency(amount: number, locale = 'en-US', currency = 'EUR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Returns the currency symbol for a given ISO 4217 currency code and locale
 * (e.g. 'EUR' + 'en-US' → '€'). Falls back to the currency code itself if
 * Intl cannot resolve a symbol.
 *
 * @param currency - ISO 4217 currency code (default: 'EUR').
 * @param locale - The locale for symbol resolution (default: 'en-US').
 * @returns The currency symbol string.
 */
export function getCurrencySymbol(currency = 'EUR', locale = 'en-US'): string {
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? currency;
}

/**
 * Format a number as a percentage string using `Intl.NumberFormat`.
 *
 * Uses `Intl.NumberFormat` so the output respects locale conventions for
 * decimal separators (e.g. comma in de-DE). No space before the `%` sign.
 *
 * @param rate - The raw percentage value (e.g. 3.5 → "3.50%").
 * @param locale - The locale for number formatting (default: 'en-US').
 * @param digits - The number of fraction digits to display (default: 2).
 * @returns A formatted percentage string.
 */
export function formatPercent(rate: number, locale = 'en-US', digits = 2): string {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(rate)}%`;
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
 * @param locale - The locale for formatting (default: 'en-US').
 * @param fallback - Value returned when dateStr is null/undefined/invalid. Defaults to '—'.
 * @param monthStyle - The month format style: 'short' (e.g. "Feb") or 'long' (e.g. "February"). Defaults to 'short'.
 * @returns A localized date string, e.g. "Feb 27, 2026", or the fallback value.
 */
export function formatDate(
  dateStr: string | null | undefined,
  locale = 'en-US',
  fallback = '—',
  monthStyle: 'short' | 'long' = 'short',
): string {
  if (!dateStr) return fallback;
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return fallback;
  return new Date(year, month - 1, day).toLocaleDateString(locale, {
    year: 'numeric',
    month: monthStyle,
    day: 'numeric',
  });
}

/**
 * Format an ISO timestamp as a localized time string (HH:MM).
 *
 * @param timestamp - An ISO timestamp string or null/undefined.
 * @param locale - The locale for formatting (default: 'en-US').
 * @param fallback - Value returned when timestamp is null/undefined. Defaults to '—'.
 * @returns A localized time string, e.g. "2:45 PM", or the fallback value.
 */
export function formatTime(
  timestamp: string | null | undefined,
  locale = 'en-US',
  fallback = '—',
): string {
  if (!timestamp) return fallback;
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(locale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return fallback;
  }
}

/**
 * Format an ISO timestamp as a localized date and time string.
 *
 * @param timestamp - An ISO timestamp string or null/undefined.
 * @param locale - The locale for formatting (default: 'en-US').
 * @param fallback - Value returned when timestamp is null/undefined. Defaults to '—'.
 * @returns A localized date and time string, e.g. "Feb 27, 2026 at 2:45 PM", or the fallback value.
 */
export function formatDateTime(
  timestamp: string | null | undefined,
  locale = 'en-US',
  fallback = '—',
): string {
  if (!timestamp) return fallback;
  try {
    const date = new Date(timestamp);
    return (
      date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }) +
      ' at ' +
      date.toLocaleTimeString(locale, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    );
  } catch {
    return fallback;
  }
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

/**
 * Computes work duration in hours from two HH:mm time strings.
 * Returns hours rounded to 2 decimal places, or null if either input is
 * null/undefined, invalid, or if end ≤ start.
 */
export function computeWorkDuration(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const HH_MM = /^\d{2}:\d{2}$/;
  if (!HH_MM.test(start) || !HH_MM.test(end)) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (sh === undefined || sm === undefined || eh === undefined || em === undefined) return null;
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const diffMinutes = endMinutes - startMinutes;
  if (diffMinutes <= 0) return null;
  return Math.round((diffMinutes / 60) * 100) / 100;
}

/**
 * Format a Date as a short localized weekday label (e.g. "Mon", "Mo").
 *
 * @param date - The date to format.
 * @param locale - The locale for formatting (default: 'en-US').
 * @returns A short weekday string.
 */
export function formatWeekdayShort(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale, { weekday: 'short' });
}

/**
 * Format a Date as a short weekday + short month + day label, with no year
 * (e.g. "Mon, Feb 24"). Used for compact technical/chart-axis labels.
 *
 * @param date - The date to format.
 * @param locale - The locale for formatting (default: 'en-US').
 * @returns A formatted string.
 */
export function formatWeekdayMonthDay(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Format a byte count as a human-readable, locale-aware file size string
 * (e.g. "1.5 MB", "1,5 MB" in de-DE). Unit suffixes (B/KB/MB) are not
 * translated — they are standard abbreviations in both supported locales.
 *
 * @param bytes - The size in bytes.
 * @param locale - The locale for number formatting (default: 'en-US').
 * @returns A formatted file size string.
 */
export function formatFileSize(bytes: number, locale = 'en-US'): string {
  const oneDecimal = (value: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      value,
    );
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${oneDecimal(bytes / 1024)} KB`;
  return `${oneDecimal(bytes / (1024 * 1024))} MB`;
}

/**
 * Format a duration in hours as a locale-aware string with 2 decimal places
 * (e.g. "7.50 h" in en-US, "7,50 h" in de-DE).
 *
 * @param hours - The duration in hours.
 * @param locale - The locale for number formatting (default: 'en-US').
 * @returns A formatted duration string.
 */
export function formatHours(hours: number, locale = 'en-US'): string {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(hours)} h`;
}

/**
 * Format a Date as a localized date + time string including the time zone
 * abbreviation (e.g. "Feb 24, 2026, 2:45 PM GMT+1"). Used where the output
 * is burned into a static artifact (e.g. a signature image) and must be
 * unambiguous about time zone.
 *
 * @param date - The date/time to format.
 * @param locale - The locale for formatting (default: 'en-US').
 * @returns A formatted date-time-with-zone string.
 */
export function formatDateTimeWithZone(date: Date, locale = 'en-US'): string {
  return date.toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

import { useLocale } from '../contexts/LocaleContext.js';

/**
 * Hook that provides locale-aware formatting functions.
 * Uses the user's current locale and currency preferences.
 *
 * Usage:
 * ```tsx
 * const { formatCurrency, formatDate, formatTime, formatDateTime, formatPercent, formatFileSize, formatHours } = useFormatters();
 * // Use these functions — they automatically apply the user's locale and currency
 * ```
 */
export function useFormatters() {
  const { resolvedLocale, currency } = useLocale();

  // Map 'en' to 'en-US' and 'de' to 'de-DE'
  const localeString = resolvedLocale === 'de' ? 'de-DE' : 'en-US';

  return {
    /**
     * Format a number as a currency string using the user's locale and currency.
     */
    formatCurrency: (amount: number) => formatCurrency(amount, localeString, currency),

    /**
     * Get the currency symbol for the user's currency and locale.
     */
    getCurrencySymbol: () => getCurrencySymbol(currency, localeString),

    /**
     * Format a date string using the user's locale.
     */
    formatDate: (
      dateStr: string | null | undefined,
      fallback?: string,
      monthStyle?: 'short' | 'long',
    ) => formatDate(dateStr, localeString, fallback, monthStyle),

    /**
     * Format a time string using the user's locale.
     */
    formatTime: (timestamp: string | null | undefined, fallback?: string) =>
      formatTime(timestamp, localeString, fallback),

    /**
     * Format a datetime string using the user's locale.
     */
    formatDateTime: (timestamp: string | null | undefined, fallback?: string) =>
      formatDateTime(timestamp, localeString, fallback),

    /**
     * Format a percentage number using the user's locale.
     */
    formatPercent: (rate: number, digits?: number) => formatPercent(rate, localeString, digits),

    /**
     * Format a Date as a short localized weekday label using the user's locale.
     */
    formatWeekdayShort: (date: Date) => formatWeekdayShort(date, localeString),

    /**
     * Format a Date as a short weekday + short month + day label using the user's locale.
     */
    formatWeekdayMonthDay: (date: Date) => formatWeekdayMonthDay(date, localeString),

    /**
     * Format a byte count as a human-readable file size string using the user's locale.
     */
    formatFileSize: (bytes: number) => formatFileSize(bytes, localeString),

    /**
     * Format a duration in hours as a locale-aware string using the user's locale.
     */
    formatHours: (hours: number) => formatHours(hours, localeString),

    /**
     * Format a Date as a localized date + time string including time zone using the user's locale.
     */
    formatDateTimeWithZone: (date: Date) => formatDateTimeWithZone(date, localeString),
  };
}

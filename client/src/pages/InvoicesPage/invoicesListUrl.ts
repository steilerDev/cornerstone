import { INVOICE_LIST_SORTS } from '@cornerstone/shared';
import type { InvoiceChipTally, InvoiceListSort } from '@cornerstone/shared';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import type { InvoiceListParams } from '../../lib/invoicesApi.js';

/** The status chips of the Invoices list; the URL value is the stored status ('all' is the template's). */
export const INVOICE_CHIPS = ['pending', 'quotation', 'paid', 'claimed'] as const;
export type InvoiceChipValue = (typeof INVOICE_CHIPS)[number];

/** The "Show only" checkboxes: each its own URL param, written (as '1') only when on. */
export const INVOICE_FLAG_PARAMS = ['notYetSplit', 'withoutDocument', 'refundsDue', 'due'] as const;
export type InvoiceFlagParam = (typeof INVOICE_FLAG_PARAMS)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** pending→toPay, quotation→offers, paid→paid, claimed→submitted, anything else→all. */
export function chipCountKey(chip: string): keyof InvoiceChipTally {
  switch (chip) {
    case 'pending':
      return 'toPay';
    case 'quotation':
      return 'offers';
    case 'paid':
      return 'paid';
    case 'claimed':
      return 'submitted';
    default:
      return 'all';
  }
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The value of one `key:value` side of a `from:…,to:…` / `min:…,max:…` serialisation. */
function sideOf(value: string, key: string): string | null {
  for (const part of value.split(',')) {
    const separator = part.indexOf(':');
    if (separator !== -1 && part.slice(0, separator) === key) return part.slice(separator + 1);
  }
  return null;
}

/** "from:2026-01-01,to:2026-02-01" to { from, to }; an invalid or empty side is null, no valid side is null. */
export function parseDateRange(
  value: string | null,
): { from: string | null; to: string | null } | null {
  if (!value) return null;
  const rawFrom = sideOf(value, 'from');
  const rawTo = sideOf(value, 'to');
  const from = rawFrom !== null && isRealDate(rawFrom) ? rawFrom : null;
  const to = rawTo !== null && isRealDate(rawTo) ? rawTo : null;
  return from === null && to === null ? null : { from, to };
}

/** The URL serialisation of a date range; null when both sides are empty. */
export function formatDateRange(from: string | null, to: string | null): string | null {
  const parts: string[] = [];
  if (from) parts.push(`from:${from}`);
  if (to) parts.push(`to:${to}`);
  return parts.length > 0 ? parts.join(',') : null;
}

function finiteNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

/** "min:10,max:250.5" to { min, max } (finite numbers only); no valid side is null. */
export function parseAmountRange(
  value: string | null,
): { min: number | null; max: number | null } | null {
  if (!value) return null;
  const min = finiteNumber(sideOf(value, 'min'));
  const max = finiteNumber(sideOf(value, 'max'));
  return min === null && max === null ? null : { min, max };
}

/** The URL serialisation of an amount range; null when both sides are empty. */
export function formatAmountRange(min: number | null, max: number | null): string | null {
  const parts: string[] = [];
  if (min !== null) parts.push(`min:${min}`);
  if (max !== null) parts.push(`max:${max}`);
  return parts.length > 0 ? parts.join(',') : null;
}

function isInvoiceSort(value: string): value is InvoiceListSort {
  return (INVOICE_LIST_SORTS as readonly string[]).includes(value);
}

/**
 * The list query as API params: the chip (To pay is `openOnly`), sort, search and filters. Never
 * includes page, pageSize or ids. The To pay chip on the default sort sends no `sortBy`, so the
 * server's earliest-open-due order (overdue first) applies.
 */
export function invoiceListApiParams(query: ObjectListQuery): InvoiceListParams {
  const params: InvoiceListParams = {};
  if (query.q) params.q = query.q;

  if (query.chip === 'pending') params.openOnly = true;
  else if (query.chip === 'quotation' || query.chip === 'paid' || query.chip === 'claimed') {
    params.status = query.chip;
  }

  if (!(query.chip === 'pending' && query.isDefaultSort) && isInvoiceSort(query.sortBy)) {
    params.sortBy = query.sortBy;
    params.sortOrder = query.sortOrder;
  }

  const { filters } = query;
  for (const flag of INVOICE_FLAG_PARAMS) {
    if (filters[flag] === '1') params[flag] = true;
  }
  if (filters.vendorId) params.vendorId = filters.vendorId;
  const date = parseDateRange(filters.date ?? null);
  if (date?.from) params.dateFrom = date.from;
  if (date?.to) params.dateTo = date.to;
  const dueDate = parseDateRange(filters.dueDate ?? null);
  if (dueDate?.from) params.dueDateFrom = dueDate.from;
  if (dueDate?.to) params.dueDateTo = dueDate.to;
  const amount = parseAmountRange(filters.amount ?? null);
  if (amount && amount.min !== null) params.amountMin = amount.min;
  if (amount && amount.max !== null) params.amountMax = amount.max;
  return params;
}

/**
 * The legacy `?openOnly=…` URL rewritten: `openOnly`, `page` and `pageSize` removed, and
 * `status=pending` set when the value was `true` and `status` is absent. Everything else is
 * kept. Null when `openOnly` is absent.
 */
export function legacyInvoicesSearch(params: URLSearchParams): URLSearchParams | null {
  if (!params.has('openOnly')) return null;
  const next = new URLSearchParams(params);
  const value = next.get('openOnly');
  next.delete('openOnly');
  next.delete('page');
  next.delete('pageSize');
  if (value === 'true' && !next.has('status')) next.set('status', 'pending');
  return next;
}

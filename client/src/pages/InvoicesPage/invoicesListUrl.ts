import { INVOICE_LIST_SORTS } from '@cornerstone/shared';
import type { InvoiceChipTally, InvoiceListSort } from '@cornerstone/shared';
import { parseDateRange, parseNumberRange } from '../../components/ObjectList/rangeParams.js';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';
import type { InvoiceListParams } from '../../lib/invoicesApi.js';

/** The status chips of the Invoices list; the URL value is the stored status ('all' is the template's). */
export const INVOICE_CHIPS = ['pending', 'quotation', 'paid', 'claimed'] as const;
export type InvoiceChipValue = (typeof INVOICE_CHIPS)[number];

/** The "Show only" checkboxes: each its own URL param, written (as '1') only when on. */
export const INVOICE_FLAG_PARAMS = ['notYetSplit', 'withoutDocument', 'refundsDue', 'due'] as const;
export type InvoiceFlagParam = (typeof INVOICE_FLAG_PARAMS)[number];

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
  const amount = parseNumberRange(filters.amount ?? null);
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

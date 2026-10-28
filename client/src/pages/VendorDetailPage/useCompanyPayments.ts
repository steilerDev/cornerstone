import { useEffect, useState } from 'react';
import type { InvoiceListRow } from '@cornerstone/shared';
import { toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { fetchAllInvoices } from '../../lib/invoicesApi.js';

const PAGE_SIZE = 100;

export interface UseCompanyPaymentsResult {
  /** null until the first load; a reload on a new `revision` keeps the previous rows. */
  readonly rows: readonly InvoiceListRow[] | null;
  readonly failure: FetchFailure | null;
  readonly retry: () => void;
}

/** Every offer and invoice of one company (all pages), reloaded when the page record changes. */
export function useCompanyPayments(vendorId: string, revision: number): UseCompanyPaymentsResult {
  const [rows, setRows] = useState<readonly InvoiceListRow[] | null>(null);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const all: InvoiceListRow[] = [];
      let page = 1;
      let totalPages = 1;
      while (page <= totalPages) {
        const response = await fetchAllInvoices({ vendorId, pageSize: PAGE_SIZE, page });
        all.push(...response.invoices);
        totalPages = response.pagination.totalPages;
        page += 1;
      }
      return all;
    };
    load()
      .then((all) => {
        if (cancelled) return;
        setRows(all);
        setFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, revision, attempt]);

  return {
    rows,
    failure,
    retry: () => {
      setFailure(null);
      setAttempt((value) => value + 1);
    },
  };
}

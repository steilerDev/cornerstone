import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { deleteHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import { deleteInvoiceBudgetLine } from '../../lib/invoiceBudgetLinesApi.js';
import { deleteWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import type { CostLineRow } from './types.js';

export type CostLineMutation = 'delete' | 'unlink' | 'remove';

export interface UseCostLineMutationsResult {
  readonly busy: boolean;
  /** Translated; null when there is nothing to show. */
  readonly error: string | null;
  /** The last delete failed with 409: the line is in use and there is nothing to retry. */
  readonly blocked: boolean;
  readonly clearError: () => void;
  /** Runs the mutation, then `afterChange`. Resolves true when it worked. */
  readonly run: (kind: CostLineMutation, row: CostLineRow) => Promise<boolean>;
}

/**
 * Delete (a line without an offer or invoice), Unlink (item host) and Remove from invoice
 * (document host). Errors become translated text, never the server's message. `afterChange`
 * reloads the host's data and tells the page (figures, grant payback).
 */
export function useCostLineMutations(
  afterChange: () => Promise<void> | void,
): UseCostLineMutationsResult {
  const { t } = useTranslation('costLines');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
    setBlocked(false);
  }, []);

  const run = useCallback(
    async (kind: CostLineMutation, row: CostLineRow): Promise<boolean> => {
      setBusy(true);
      clearError();
      try {
        if (kind === 'delete') {
          if (row.lineType === 'work_item') {
            await deleteWorkItemBudget(row.target?.id ?? '', row.id);
          } else {
            await deleteHouseholdItemBudget(row.target?.id ?? '', row.id);
          }
        } else if (row.invoiceId !== null && row.invoiceBudgetLineId !== null) {
          await deleteInvoiceBudgetLine(row.invoiceId, row.invoiceBudgetLineId);
        }
        await afterChange();
        return true;
      } catch (err) {
        if (err instanceof ApiClientError) {
          setBlocked(kind === 'delete' && err.statusCode === 409);
          setError(translateApiError(err.error.code, tErrors));
        } else if (err instanceof NetworkError) {
          setError(tCommon('requestErrors.network'));
        } else {
          setError(t('confirm.errorFailed'));
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [afterChange, clearError, t, tCommon, tErrors],
  );

  return { busy, error, blocked, clearError, run };
}

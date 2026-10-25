import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UndoToken } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { deleteHouseholdItemBudget } from '../../lib/householdItemBudgetsApi.js';
import { deleteInvoiceBudgetLine } from '../../lib/invoiceBudgetLinesApi.js';
import { deleteWorkItemBudget } from '../../lib/workItemBudgetsApi.js';
import type { CostLineRow } from './types.js';

export type CostLineMutation = 'delete' | 'unlink' | 'remove';

export type CostLineDeleteResult = { readonly ok: true } | { readonly ok: false };
export type CostLineUndoableResult =
  { readonly ok: true; readonly undo: UndoToken } | { readonly ok: false };
export type CostLineMutationResult = CostLineDeleteResult | CostLineUndoableResult;

export interface UseCostLineMutationsResult {
  readonly busy: boolean;
  /** Translated; null when there is nothing to show. */
  readonly error: string | null;
  /** The last delete failed with 409: the line is in use and there is nothing to retry. */
  readonly blocked: boolean;
  readonly clearError: () => void;
  /**
   * Runs the mutation, then `afterChange`. Unlink and Remove resolve with their Undo token;
   * Delete resolves without one.
   */
  readonly run: {
    (kind: 'delete', row: CostLineRow): Promise<CostLineDeleteResult>;
    (kind: 'unlink' | 'remove', row: CostLineRow): Promise<CostLineUndoableResult>;
  };
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

  const showError = useCallback(
    (err: unknown, kind: CostLineMutation) => {
      if (err instanceof ApiClientError) {
        setBlocked(kind === 'delete' && err.statusCode === 409);
        setError(translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        setError(tCommon('requestErrors.network'));
      } else {
        setError(t('confirm.errorFailed'));
      }
    },
    [t, tCommon, tErrors],
  );

  const run = useCallback(
    async (kind: CostLineMutation, row: CostLineRow): Promise<CostLineMutationResult> => {
      setBusy(true);
      clearError();
      try {
        if (kind === 'delete') {
          if (row.lineType === 'work_item') {
            await deleteWorkItemBudget(row.target?.id ?? '', row.id);
          } else {
            await deleteHouseholdItemBudget(row.target?.id ?? '', row.id);
          }
          await afterChange();
          return { ok: true };
        }
        // Unlink and Remove are offered only for linked rows.
        if (row.invoiceId === null || row.invoiceBudgetLineId === null) {
          throw new Error('Cost line has no invoice link');
        }
        const { undo } = await deleteInvoiceBudgetLine(row.invoiceId, row.invoiceBudgetLineId);
        // The server already removed the relation: a failed refresh must not lose the Undo token.
        try {
          await afterChange();
        } catch (refreshError) {
          showError(refreshError, kind);
        }
        return { ok: true, undo };
      } catch (err) {
        showError(err, kind);
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [afterChange, clearError, showError],
  ) as UseCostLineMutationsResult['run'];

  return { busy, error, blocked, clearError, run };
}

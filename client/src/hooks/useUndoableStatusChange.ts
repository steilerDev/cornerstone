import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { UndoToken } from '@cornerstone/shared';
import { useToast } from '../components/Toast/ToastContext.js';
import { ApiClientError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';
import { undoChange } from '../lib/undoApi.js';
import type { StatusChangeResult } from '../lib/statusChangeApi.js';

export interface UndoableStatusChangeOptions<R> {
  /** Performs the PATCH (one of the `change*Status` functions). */
  readonly request: () => Promise<StatusChangeResult<R>>;
  /** Name of the record in the toast: "‹recordName› is now “‹statusLabel›”." */
  readonly recordName: string;
  /** Canonical label of the new status. */
  readonly statusLabel: string;
  /** Toast replacement key, e.g. `task:${id}`. */
  readonly dedupeKey: string;
  /** Called with the updated record after the PATCH succeeded. */
  readonly onChanged: (record: R) => void;
  /** Called after an Undo succeeded (reload the record). */
  readonly onUndone: () => void | Promise<void>;
  /** Where focus goes if it is inside the toast when it goes away. */
  readonly focusFallback?: () => HTMLElement | null;
}

/**
 * Runs a status PATCH and offers Undo. Errors are toasted here; the promise always resolves,
 * so the StatusMenu simply goes idle.
 */
export function useUndoableStatusChange() {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { showToast, showUndoToast } = useToast();

  const run = useCallback(
    async <R>(options: UndoableStatusChangeOptions<R>): Promise<void> => {
      let result: StatusChangeResult<R>;
      try {
        result = await options.request();
      } catch (err) {
        showToast(
          'error',
          err instanceof ApiClientError
            ? translateApiError(err.error.code, tErrors)
            : t('statusMenu.changeFailed'),
        );
        return;
      }
      options.onChanged(result.record);
      const undo: UndoToken | null = result.undo;
      if (!undo) return;
      showUndoToast({
        message: t('undoToast.statusChanged', {
          name: options.recordName,
          status: options.statusLabel,
        }),
        dedupeKey: options.dedupeKey,
        focusFallback: options.focusFallback,
        onUndo: async () => {
          await undoChange(undo.token);
          await options.onUndone();
        },
      });
    },
    [showToast, showUndoToast, t, tErrors],
  );

  return { run };
}

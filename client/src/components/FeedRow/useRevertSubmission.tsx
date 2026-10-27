import { useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { revertSubmission } from '../../lib/sourceReportsApi.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { useToast } from '../Toast/ToastContext.js';
import styles from './revertSubmission.module.css';

/** Codes after which the feed no longer matches the dialog: the action is hidden. */
const BLOCKING_CODES: ReadonlySet<string> = new Set([
  'SUBMISSION_ALREADY_REVERTED',
  'SUBMISSION_CHANGED',
  'NOT_FOUND',
]);

export interface UseRevertSubmissionOptions {
  /** After a successful revert, and when a dialog that ended in a 409 closes: reload the feed. */
  readonly onChanged: () => void;
  /** A stable heading (tabIndex -1) focused after a successful revert. */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

export interface RevertSubmissionController {
  /** The Revert button of an unreverted submission batch row, else undefined. */
  readonly renderRowActions: (entry: DiaryEntrySummary) => ReactNode;
  /** The ConfirmDialog, or null while closed. Render once in the host. */
  readonly dialog: ReactNode;
}

interface RevertTarget {
  readonly entry: DiaryEntrySummary;
  readonly busy: boolean;
  readonly error: string | null;
  readonly blocked: boolean;
}

/** Revert submission: the row button and its confirmation, shared by every History host. */
export function useRevertSubmission({
  onChanged,
  returnFocusRef,
}: UseRevertSubmissionOptions): RevertSubmissionController {
  const { t } = useTranslation('diary');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate, formatCurrency } = useFormatters();
  const { showToast } = useToast();
  const [target, setTarget] = useState<RevertTarget | null>(null);

  const renderRowActions = (entry: DiaryEntrySummary): ReactNode => {
    const batch = entry.batch;
    if (!batch || batch.kind !== 'submission' || batch.reverted) return undefined;
    return (
      <button
        type="button"
        className={styles.revertButton}
        aria-label={t('event.revert.actionLabel', {
          count: batch.invoiceCount,
          date: formatDate(entry.entryDate),
        })}
        data-testid={`revert-submission-${batch.batchId}`}
        onClick={() => setTarget({ entry, busy: false, error: null, blocked: false })}
      >
        {t('event.revert.action')}
      </button>
    );
  };

  const close = () => {
    if (target?.blocked) onChanged();
    setTarget(null);
  };

  const confirm = async (current: RevertTarget, batchId: string) => {
    setTarget({ ...current, busy: true, error: null });
    try {
      const result = await revertSubmission(batchId);
      setTarget(null);
      const count = result.restoredInvoiceIds.length;
      showToast(
        'info',
        count > 0 ? t('event.revert.done', { count }) : t('event.revert.doneNoInvoices'),
      );
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setTarget({
          ...current,
          busy: false,
          error: translateApiError(err.error.code, tErrors),
          blocked: BLOCKING_CODES.has(err.error.code),
        });
      } else if (err instanceof NetworkError) {
        setTarget({ ...current, busy: false, error: tc('requestErrors.network') });
      } else {
        setTarget({ ...current, busy: false, error: t('event.revert.failed') });
      }
    }
  };

  const batch = target?.entry.batch;
  const dialog =
    target && batch ? (
      <ConfirmDialog
        title={t('event.revert.title', { count: batch.invoiceCount })}
        lead={
          batch.amount === null
            ? t('event.revert.leadNoAmount', { date: formatDate(target.entry.entryDate) })
            : t('event.revert.lead', {
                date: formatDate(target.entry.entryDate),
                amount: formatCurrency(batch.amount),
              })
        }
        consequences={{
          status: 'ready',
          items: [
            { label: t('event.revert.toPending'), count: batch.invoicesFrom.pending },
            { label: t('event.revert.toPaid'), count: batch.invoicesFrom.paid },
            { label: t('event.revert.payments'), count: batch.progressPaymentCount },
          ],
        }}
        confirmLabel={t('event.revert.confirm')}
        busyLabel={t('event.revert.busy')}
        cancelLabel={t('event.revert.keep')}
        busy={target.busy}
        error={target.error}
        blocked={target.blocked}
        onConfirm={() => void confirm(target, batch.batchId)}
        onCancel={close}
        returnFocusRef={returnFocusRef}
        testIdPrefix="revert-submission"
      />
    ) : null;

  return { renderRowActions, dialog };
}

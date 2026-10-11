import { useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal/Modal.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { FormError } from '../FormError/FormError.js';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogConsequence {
  readonly label: string;
  readonly count: number;
}

export type ConfirmDialogConsequences =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly onRetry: () => void }
  | { readonly status: 'ready'; readonly items: readonly ConfirmDialogConsequence[] };

export interface ConfirmDialogProps {
  /** The full question, e.g. "Delete Kitchen?". */
  readonly title: string;
  readonly lead?: ReactNode;
  /** Counts of what else the action changes (from `useDeleteImpact`); omit for no list. */
  readonly consequences?: ConfirmDialogConsequences;
  /** Adds "This can't be undone." */
  readonly irreversible?: boolean;
  /** The action verb, e.g. "Delete". */
  readonly confirmLabel: string;
  /** Shown on the action while busy, e.g. "Deleting…". */
  readonly busyLabel: string;
  /** Defaults to common:button.cancel. */
  readonly cancelLabel?: string;
  readonly tone?: 'danger';
  readonly busy: boolean;
  /** Server error, shown inside the dialog. */
  readonly error?: string | null;
  /** Hides the action (set only after a 409 from the action). */
  readonly blocked?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** A stable, enabled element (a section heading with tabIndex -1); never the thing being acted on. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Refocus the opener after a confirmed action. Default false: the opener is usually what was
   * just deleted, so focus goes to `returnFocusRef` or the page heading. Cancel and Escape always
   * return to the opener.
   */
  readonly restoreToOpenerOnConfirm?: boolean;
  readonly testIdPrefix?: string;
}

/**
 * Confirmation for destructive actions and discards: an `alertdialog` on `Modal`. Initial focus
 * is on Cancel; while busy the action is aria-disabled and Escape / backdrop are ignored.
 */
export function ConfirmDialog({
  title,
  lead,
  consequences,
  irreversible = false,
  confirmLabel,
  busyLabel,
  cancelLabel,
  busy,
  error,
  blocked = false,
  onConfirm,
  onCancel,
  returnFocusRef,
  restoreToOpenerOnConfirm = false,
  testIdPrefix = 'confirm-dialog',
}: ConfirmDialogProps) {
  const { t } = useTranslation('common');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();
  // Set when the action is triggered; Cancel / Escape reset it so those return to the opener.
  const skipOpenerRef = useRef(false);
  const handleCancel = () => {
    skipOpenerRef.current = false;
    onCancel();
  };

  const waiting = consequences?.status === 'loading' || consequences?.status === 'error';
  const actionDisabled = busy || waiting;
  const items =
    consequences?.status === 'ready' ? consequences.items.filter((item) => item.count > 0) : [];

  return (
    <Modal
      title={title}
      role="alertdialog"
      describedById={descriptionId}
      initialFocusRef={cancelRef}
      dismissible={!busy}
      returnFocusRef={returnFocusRef}
      skipOpenerRef={skipOpenerRef}
      onClose={handleCancel}
      className={styles.dialog}
      footer={
        <div className={styles.footer}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancelButton}
            aria-disabled={busy ? 'true' : undefined}
            onClick={() => {
              if (!busy) handleCancel();
            }}
            data-testid={`${testIdPrefix}-cancel`}
          >
            {cancelLabel ?? t('button.cancel')}
          </button>
          {!blocked && (
            <button
              type="button"
              className={styles.confirmButton}
              aria-disabled={actionDisabled ? 'true' : undefined}
              onClick={() => {
                if (!actionDisabled) {
                  skipOpenerRef.current = !restoreToOpenerOnConfirm;
                  onConfirm();
                }
              }}
              data-testid={`${testIdPrefix}-confirm`}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          )}
        </div>
      }
    >
      <div id={descriptionId} className={styles.description}>
        {lead && <div className={styles.lead}>{lead}</div>}
        {consequences?.status === 'loading' && <Skeleton lines={2} />}
        {consequences?.status === 'error' && (
          <div className={styles.countsError}>
            <FormError message={t('confirmDialog.countsFailed')} />
            <button
              type="button"
              className={styles.retryButton}
              onClick={consequences.onRetry}
              data-testid={`${testIdPrefix}-retry`}
            >
              {t('button.retry')}
            </button>
          </div>
        )}
        {items.length > 0 && (
          <>
            <p className={styles.intro}>{t('confirmDialog.alsoAffects')}</p>
            <ul className={styles.list} data-testid={`${testIdPrefix}-consequences`}>
              {items.map((item) => (
                <li key={item.label}>
                  {item.label} <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
        {irreversible && <p className={styles.irreversible}>{t('confirmDialog.cannotBeUndone')}</p>}
      </div>
      {error && <FormError message={error} />}
    </Modal>
  );
}

import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import styles from './AreasPage.module.css';

export interface AreaDeleteDialogProps {
  readonly areaId: string;
  /** Full path of the area, joined with " › ". */
  readonly path: string;
  /** Tasks and purchases booked on the area or any sub-area (totals, not open ones). */
  readonly tasks: number;
  readonly purchases: number;
  /** The server refused with AREA_IN_USE although the loaded counts were zero. */
  readonly forceBlocked?: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Following a "Show these…" link closes the dialog. */
  readonly onNavigate: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Delete confirmation of an area: blocked (with links to the tasks and purchases in the way)
 * while anything is booked on it or a sub-area, otherwise a danger confirm with the consequences.
 */
export function AreaDeleteDialog({
  areaId,
  path,
  tasks,
  purchases,
  forceBlocked = false,
  busy,
  error,
  onConfirm,
  onCancel,
  onNavigate,
  returnFocusRef,
}: AreaDeleteDialogProps) {
  const { t } = useTranslation('areas');
  const { t: tCommon } = useTranslation('common');
  const blocked = forceBlocked || tasks + purchases > 0;
  const consequences = useDeleteImpact('area', blocked ? null : areaId);

  const title = tCommon('confirmDialog.deleteTitle', { name: path });

  if (blocked) {
    let body: string | null = null;
    if (tasks > 0 && purchases > 0) {
      body = t('index.delete.blockedBoth', {
        tasks: t('index.delete.taskCount', { count: tasks }),
        purchases: t('index.delete.purchaseCount', { count: purchases }),
      });
    } else if (tasks > 0) body = t('index.delete.blockedTasks', { count: tasks });
    else if (purchases > 0) body = t('index.delete.blockedPurchases', { count: purchases });

    return (
      <ConfirmDialog
        title={title}
        lead={
          <>
            <p className={styles.blockedLead}>{t('index.delete.blocked', { path })}</p>
            <p className={styles.blockedBody}>
              {body ? `${body} ` : ''}
              {t('index.delete.moveFirst')}
            </p>
          </>
        }
        blocked
        confirmLabel={tCommon('button.delete')}
        busyLabel={tCommon('confirmDialog.deleting')}
        cancelLabel={t('index.delete.close')}
        tone="danger"
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
        returnFocusRef={returnFocusRef}
        testIdPrefix="areas-delete-dialog"
      >
        {(tasks > 0 || purchases > 0) && (
          <ul className={styles.blockedLinks}>
            {tasks > 0 && (
              <li>
                <NavAnchor
                  to={routeUrl('workItems', undefined, { areaId })}
                  className={styles.blockedLink}
                  onNavigate={onNavigate}
                  data-testid="areas-delete-show-tasks"
                >
                  {t('index.delete.showTasks')}
                </NavAnchor>
              </li>
            )}
            {purchases > 0 && (
              <li>
                <NavAnchor
                  to={routeUrl('householdItems', undefined, { areaId })}
                  className={styles.blockedLink}
                  onNavigate={onNavigate}
                  data-testid="areas-delete-show-purchases"
                >
                  {t('index.delete.showPurchases')}
                </NavAnchor>
              </li>
            )}
          </ul>
        )}
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={title}
      consequences={consequences}
      confirmLabel={tCommon('button.delete')}
      busyLabel={tCommon('confirmDialog.deleting')}
      tone="danger"
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      returnFocusRef={returnFocusRef}
      testIdPrefix="areas-delete-dialog"
    />
  );
}

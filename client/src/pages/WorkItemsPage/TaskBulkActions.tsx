import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WORK_ITEM_STATUSES } from '@cornerstone/shared';
import type { WorkItemListRow } from '@cornerstone/shared';
import { EntityPickerDialog } from '../../components/EntityPicker/EntityPickerDialog.js';
import { OverflowMenu } from '../../components/OverflowMenu/index.js';
import type { OverflowMenuEntry } from '../../components/OverflowMenu/index.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import shared from '../../styles/shared.module.css';
import type { TaskActions } from './useTaskActions.js';

export interface TaskBulkActionsProps {
  readonly selected: readonly WorkItemListRow[];
  readonly clear: () => void;
  readonly actions: Pick<TaskActions, 'bulkSetStatus' | 'bulkSetArea'>;
}

/**
 * The two bulk actions of the selection bar: Set status (a menu of the three status words) and
 * Set area (the area picker in a dialog; a pick applies at once, Close cancels).
 */
export function TaskBulkActions({ selected, clear, actions }: TaskBulkActionsProps) {
  const { t } = useTranslation('workItems');
  const statusVariants = useStatusBadgeVariants();
  const { areas } = useAreas();
  const [areaOpen, setAreaOpen] = useState(false);
  const areaButtonRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);

  // One run at a time: a second click while requests are in flight is ignored.
  const run = (task: () => Promise<void>) => {
    if (runningRef.current) return;
    runningRef.current = true;
    void task().finally(() => {
      runningRef.current = false;
    });
  };

  const statusEntries: OverflowMenuEntry[] = WORK_ITEM_STATUSES.map((status) => ({
    id: status,
    label: statusVariants.task[status].label,
    onClick: () => run(() => actions.bulkSetStatus(selected, status, clear)),
    testId: `tasks-bulk-status-${status}`,
  }));

  return (
    <>
      <OverflowMenu
        items={statusEntries}
        triggerAriaLabel={t('list.bulk.setStatus')}
        // The bar is pinned to the bottom of the viewport: open upward, above everything.
        placement="top-end"
        usePortal
        data-testid="tasks-bulk-status"
        menuTestId="tasks-bulk-status-menu"
        renderTrigger={(props) => (
          <button {...props} className={shared.btnSecondaryCompact}>
            {t('list.bulk.setStatus')}
          </button>
        )}
      />
      <button
        ref={areaButtonRef}
        type="button"
        className={shared.btnSecondaryCompact}
        onClick={() => setAreaOpen(true)}
        data-testid="tasks-bulk-set-area"
      >
        {t('list.bulk.setArea')}
      </button>
      <EntityPickerDialog
        open={areaOpen}
        title={t('list.bulk.setAreaTitle', { count: selected.length })}
        onClose={() => setAreaOpen(false)}
        onPick={(option) => run(() => actions.bulkSetArea(selected, option.id, clear))}
        returnFocusRef={areaButtonRef}
        testId="tasks-bulk-area-dialog"
        picker={{ kind: 'area', areas, create: 'off' }}
      />
    </>
  );
}

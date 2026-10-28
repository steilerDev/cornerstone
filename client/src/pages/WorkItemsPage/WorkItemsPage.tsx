import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkItemListRow } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../../components/FormError/FormError.js';
import { queryKey } from '../../components/ObjectList/objectListUrl.js';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import { TaskBulkActions } from './TaskBulkActions.js';
import { useTaskActions } from './useTaskActions.js';
import { useTaskRows } from './useTaskRows.js';
import { useTasksList } from './useTasksList.js';
import type { TaskListMeta } from './useTasksList.js';
import styles from './WorkItemsPage.module.css';

/** Tasks: the list with Time / Area / Company / Status grouping, filters, row commands and bulk edits. */
export function WorkItemsPage() {
  const { t } = useTranslation('workItems');
  const { t: tCommon } = useTranslation('common');
  useDocumentTitle(tCommon('navigation.tasks'));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openCreate = useOpenCreate();

  const { list, config, labels, scopeTotal, refreshRows } = useTasksList();
  const { refresh } = list;
  useOnObjectCreated('task', refresh);

  // `n` creates like the primary button (read at press time).
  const createRef = useRef(openCreate);
  useEffect(() => {
    createRef.current = openCreate;
  });
  const shortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => createRef.current('task'),
        description: tCommon('listShortcuts.newTask'),
      },
    ],
    [tCommon],
  );
  useKeyboardShortcuts(shortcuts);

  const { actions, announcement, bulkError, deletion } = useTaskActions({
    refreshRows,
    refresh,
    headingRef,
    queryKey: () => queryKey(list.query),
  });
  const rows = useTaskRows({ actions });
  const deleteConsequences = useDeleteImpact('work_item', deletion.item?.id ?? null);

  return (
    <ObjectList<WorkItemListRow, TaskListMeta>
      list={list}
      config={config}
      labels={labels}
      primary={{
        label: t('list.newTask'),
        onClick: () => openCreate('task'),
        testId: 'new-work-item-button',
      }}
      titleHeader={t('list.titleHeader')}
      statusHeader={t('list.statusHeader')}
      {...rows}
      bulkActions={({ selected, clear }) => (
        <TaskBulkActions selected={selected} clear={clear} actions={actions} />
      )}
      headingCount="whileFiltered"
      scopeTotal={scopeTotal}
      announcement={announcement}
      aboveList={
        bulkError ? (
          <div className={styles.bulkError} data-testid="tasks-bulk-error">
            <FormError message={bulkError} />
          </div>
        ) : undefined
      }
      headingRef={headingRef}
    >
      {deletion.item ? (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: deletion.item.title })}
          consequences={deleteConsequences}
          irreversible
          tone="danger"
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={deletion.busy}
          error={deletion.error}
          blocked={deletion.blocked}
          onConfirm={deletion.confirm}
          onCancel={deletion.cancel}
          returnFocusRef={headingRef}
          testIdPrefix="work-item-list-delete"
        />
      ) : null}
    </ObjectList>
  );
}

export default WorkItemsPage;

import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { MilestoneListRow } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ObjectList } from '../../components/ObjectList/ObjectList.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { useListRowDelete } from '../../hooks/useListRowDelete.js';
import { deleteMilestone } from '../../lib/milestonesApi.js';
import { useOnObjectCreated } from '../../lib/objectCreatedEvents.js';
import { useOpenCreate } from '../../navigation/useOpenCreate.js';
import { useMilestoneRows } from './useMilestoneRows.js';
import { useMilestonesList } from './useMilestonesList.js';
import type { MilestoneListMeta } from './useMilestonesList.js';

/** Schedule › Milestones: the Upcoming / Reached list with Target, Projected, Waits for and Holds up. */
export function MilestonesPage() {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  useDocumentTitle(tCommon('navigation.milestones'));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openCreate = useOpenCreate();

  const { list, config, labels, scopeTotal } = useMilestonesList();
  const { refresh } = list;
  useOnObjectCreated('milestone', refresh);

  // `n` creates like the primary button (read at press time).
  const createRef = useRef(openCreate);
  useEffect(() => {
    createRef.current = openCreate;
  });
  const shortcuts = useMemo(
    () => [
      {
        key: 'n',
        handler: () => createRef.current('milestone'),
        description: tCommon('listShortcuts.newMilestone'),
      },
    ],
    [tCommon],
  );
  useKeyboardShortcuts(shortcuts);

  const { request: requestDelete, deletion } = useListRowDelete<MilestoneListRow>({
    remove: (item) => deleteMilestone(item.id),
    onDeleted: refresh,
  });
  const rows = useMilestoneRows({ onDelete: requestDelete });
  const deleteConsequences = useDeleteImpact('milestone', deletion.item?.id ?? null);

  return (
    <ObjectList<MilestoneListRow, MilestoneListMeta>
      list={list}
      config={config}
      labels={labels}
      primary={{
        label: t('milestones.list.newMilestone'),
        onClick: () => openCreate('milestone'),
        testId: 'new-milestone-button',
      }}
      titleHeader={t('milestones.list.titleHeader')}
      statusHeader={t('milestones.list.statusHeader')}
      {...rows}
      headingCount="always"
      scopeTotal={scopeTotal}
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
          testIdPrefix="milestone-list-delete"
        />
      ) : null}
    </ObjectList>
  );
}

export default MilestonesPage;

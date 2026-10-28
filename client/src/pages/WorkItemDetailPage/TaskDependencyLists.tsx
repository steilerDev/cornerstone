import { useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { DependencyResponse } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { deleteDependency } from '../../lib/dependenciesApi.js';
import type { DependencyDirection } from '../../objectForms/dependencyForm.js';
import { restoreFocusAfterDialog } from './dialogFocus.js';
import { DependencyDialog } from './DependencyDialog.js';
import type { DependencyDialogTarget } from './DependencyDialog.js';
import type { TaskPanelProps } from './taskPageTypes.js';

type TaskDependencyListsProps = Pick<
  TaskPanelProps,
  'task' | 'refresh' | 'originState' | 'headingRef'
>;

/** "3 days later" / "2 days earlier" for a lag or lead, null for none. */
function lagText(t: TFunction<'workItems'>, days: number): string | null {
  if (days === 0) return null;
  return days > 0
    ? t('taskPage.timing.lag', { count: days })
    : t('taskPage.timing.lead', { count: Math.abs(days) });
}

/**
 * The two dependency lists of the Timing tab: the tasks this one waits for and the tasks waiting
 * for it. Add, Edit (type and lag) and Remove with Undo (decisions D6, D10).
 */
export function TaskDependencyLists({
  task,
  refresh,
  originState,
  headingRef,
}: TaskDependencyListsProps) {
  const { t } = useTranslation('workItems');
  const { t: tSchedule } = useTranslation('schedule');
  const statusVariants = useStatusBadgeVariants();
  const [target, setTarget] = useState<DependencyDialogTarget | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const { predecessors, successors } = task.dependencies;
  const excludeIds = [
    task.id,
    ...predecessors.map((dependency) => dependency.workItem.id),
    ...successors.map((dependency) => dependency.workItem.id),
  ];

  const open = (next: DependencyDialogTarget, opener: HTMLElement) => {
    openerRef.current = opener;
    setTarget(next);
  };

  const buildRows = (
    direction: DependencyDirection,
    dependencies: readonly DependencyResponse[],
  ): RelatedListRow[] => {
    const relationSet =
      direction === 'waitsFor'
        ? I18N_UNION_KEYS.scheduleWaitsForRelation
        : I18N_UNION_KEYS.scheduleHoldsUpRelation;
    return dependencies.map((dependency): RelatedListRow => {
      const lag = lagText(t, dependency.leadLagDays);
      const relation = tSchedule(relationSet.key(dependency.dependencyType));
      return {
        id: dependency.workItem.id,
        title: dependency.workItem.title,
        to: routeUrl('workItem', { id: dependency.workItem.id }),
        badges: <Badge variants={statusVariants.task} value={dependency.workItem.status} />,
        facts: lag === null ? relation : `${relation} · ${lag}`,
      };
    });
  };

  const renderList = (
    direction: DependencyDirection,
    dependencies: readonly DependencyResponse[],
  ) => {
    const waitsFor = direction === 'waitsFor';
    // The successor is the task that waits.
    const ends = (row: RelatedListRow): [string, string] =>
      waitsFor ? [task.id, row.id] : [row.id, task.id];
    return (
      <RelatedList
        title={t(waitsFor ? 'taskPage.timing.waitsFor' : 'taskPage.timing.waitingForThis')}
        testId={waitsFor ? 'task-waits-for' : 'task-waiting'}
        rows={buildRows(direction, dependencies)}
        linkState={originState}
        emptyMessage={t(
          waitsFor ? 'taskPage.timing.waitsForEmpty' : 'taskPage.timing.waitingForThisEmpty',
        )}
        action={{
          kind: 'button',
          label: t('taskPage.timing.add'),
          onActivate: (opener) => open({ mode: 'add', direction }, opener),
        }}
        onEdit={(row, opener) => {
          const dependency = dependencies.find((candidate) => candidate.workItem.id === row.id)!;
          open(
            {
              mode: 'edit',
              direction,
              row: {
                id: row.id,
                title: row.title,
                dependencyType: dependency.dependencyType,
                leadLagDays: dependency.leadLagDays,
              },
            },
            opener,
          );
        }}
        onRemove={async (row) => {
          const [successorId, predecessorId] = ends(row);
          const { undo } = await deleteDependency(successorId, predecessorId);
          await refresh();
          return undo;
        }}
        onRestored={async () => {
          await refresh();
        }}
      />
    );
  };

  return (
    <>
      {renderList('waitsFor', predecessors)}
      {renderList('waiting', successors)}
      {target && (
        <DependencyDialog
          workItemId={task.id}
          target={target}
          excludeIds={excludeIds}
          onSaved={refresh}
          onClose={() => {
            restoreFocusAfterDialog(
              openerRef,
              target.direction === 'waitsFor' ? 'task-waits-for-add' : 'task-waiting-add',
              headingRef,
            );
            setTarget(null);
          }}
          openerRef={openerRef}
        />
      )}
    </>
  );
}

export default TaskDependencyLists;

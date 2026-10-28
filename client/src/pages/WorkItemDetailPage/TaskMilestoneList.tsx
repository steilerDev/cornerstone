import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { WorkItemMilestones } from '@cornerstone/shared';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { useFormatters } from '../../lib/formatters.js';
import { removeLinkedMilestone, removeRequiredMilestone } from '../../lib/workItemMilestonesApi.js';
import { restoreFocusAfterDialog } from './dialogFocus.js';
import { MilestoneLinkDialog } from './MilestoneLinkDialog.js';
import type { TaskPanelProps } from './taskPageTypes.js';

export interface TaskMilestoneListProps extends Pick<
  TaskPanelProps,
  'task' | 'refresh' | 'originState' | 'headingRef'
> {
  /** null while loading. */
  readonly milestones: WorkItemMilestones | null;
  readonly failure: FetchFailure | null;
  /** Reloads the relations (Retry and after a change). */
  readonly reload: () => Promise<void>;
}

interface MilestoneEntry {
  readonly key: string;
  readonly relation: 'required' | 'linked';
  readonly id: number;
  readonly name: string;
  readonly targetDate: string | null;
}

/** The Milestones list of the Timing tab: what the task waits for and what it counts toward. */
export function TaskMilestoneList({
  task,
  refresh,
  originState,
  headingRef,
  milestones,
  failure,
  reload,
}: TaskMilestoneListProps) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useFormatters();
  const [dialogOpen, setDialogOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const entries: MilestoneEntry[] | null =
    milestones === null
      ? null
      : [
          ...milestones.required.map((milestone): MilestoneEntry => ({
            key: `required:${milestone.id}`,
            relation: 'required',
            ...milestone,
          })),
          ...milestones.linked.map((milestone): MilestoneEntry => ({
            key: `linked:${milestone.id}`,
            relation: 'linked',
            ...milestone,
          })),
        ];

  const rows =
    entries === null
      ? null
      : entries.map((entry): RelatedListRow => {
          const relation =
            entry.relation === 'required'
              ? t('taskPage.timing.relationRequired')
              : t('taskPage.timing.relationLinked');
          return {
            id: entry.key,
            title: entry.name,
            to: routeUrl('milestone', { id: entry.id }),
            facts: entry.targetDate ? `${relation} · ${formatDate(entry.targetDate)}` : relation,
          };
        });

  const changed = () => Promise.all([reload(), refresh()]);

  const loadError =
    failure === null ? null : fetchFailureMessage(failure, tErrors, t('taskPage.timing.loadError'));

  return (
    <>
      <RelatedList
        title={t('taskPage.timing.milestones')}
        testId="task-milestones"
        rows={rows}
        loadError={loadError}
        onRetry={() => void reload()}
        linkState={originState}
        emptyMessage={t('taskPage.timing.milestonesEmpty')}
        action={{
          kind: 'button',
          label: t('taskPage.timing.linkMilestone'),
          onActivate: (opener) => {
            openerRef.current = opener;
            setDialogOpen(true);
          },
        }}
        onRemove={async (row) => {
          const entry = entries!.find((candidate) => candidate.key === row.id)!;
          const remove =
            entry.relation === 'required' ? removeRequiredMilestone : removeLinkedMilestone;
          const { undo } = await remove(task.id, entry.id);
          await changed();
          return undo;
        }}
        onRestored={async () => {
          await changed();
        }}
      />
      {dialogOpen && milestones && (
        <MilestoneLinkDialog
          workItemId={task.id}
          requiredIds={milestones.required.map((milestone) => String(milestone.id))}
          linkedIds={milestones.linked.map((milestone) => String(milestone.id))}
          onSaved={changed}
          onClose={() => {
            restoreFocusAfterDialog(openerRef, 'task-milestones-add', headingRef);
            setDialogOpen(false);
          }}
          openerRef={openerRef}
        />
      )}
    </>
  );
}

export default TaskMilestoneList;

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { WorkItemSummary } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { actionError } from '../../lib/actionError.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { linkWorkItem, unlinkWorkItem } from '../../lib/milestonesApi.js';
import type { MilestonePanelProps } from './milestonePageTypes.js';

type MilestoneCountsTowardListProps = Pick<
  MilestonePanelProps,
  'milestone' | 'refresh' | 'originState'
>;

/**
 * The tasks that count toward a milestone (its projected date is the latest of their ends).
 * Add picks a task; Remove unlinks with Undo.
 */
export function MilestoneCountsTowardList({
  milestone,
  refresh,
  originState,
}: MilestoneCountsTowardListProps) {
  const { t } = useTranslation('schedule');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const [addError, setAddError] = useState<string | null>(null);

  const { workItems, dependentWorkItems } = milestone;

  const rows = useMemo(
    () =>
      workItems.map((item: WorkItemSummary): RelatedListRow => {
        const start = item.projectedStartDate ?? item.startDate;
        const end = item.projectedEndDate ?? item.endDate;
        let facts: string | undefined;
        if (start !== null && end !== null) {
          facts = t('milestones.detail.work.dateRange', {
            start: formatDate(start),
            end: formatDate(end),
          });
        } else if (start !== null || end !== null) {
          facts = formatDate((start ?? end)!);
        }
        return {
          id: item.id,
          title: item.title,
          to: routeUrl('workItem', { id: item.id }),
          badges: <Badge variants={statusVariants.task} value={item.status} />,
          facts,
        };
      }),
    [workItems, statusVariants, t, formatDate],
  );

  const linkError = (err: unknown): string =>
    err instanceof ApiClientError && err.error.code === 'CIRCULAR_DEPENDENCY'
      ? t('milestones.detail.work.alreadyWaiting')
      : actionError(err, tErrors, t('milestones.detail.work.addError'));

  const add = async (value: string, close: () => void) => {
    setAddError(null);
    try {
      await linkWorkItem(milestone.id, value);
    } catch (err) {
      // The picker stays open with the reason; nothing changed, so nothing is refreshed.
      setAddError(linkError(err));
      return;
    }
    await refresh();
    close();
  };

  return (
    <RelatedList
      title={t('milestones.detail.work.countsToward')}
      headingLevel={2}
      rows={rows}
      emptyMessage={t('milestones.detail.work.countsEmpty')}
      action={{
        kind: 'picker',
        label: t('milestones.detail.work.addTask'),
        renderPicker: ({ close }) => (
          <div>
            <EntityPicker
              kind="task"
              value=""
              clearOnSelect
              autoFocus
              excludeIds={[...workItems.map((w) => w.id), ...dependentWorkItems.map((w) => w.id)]}
              onChange={(value) => void add(value, close)}
            />
            <FormError message={addError} />
          </div>
        ),
      }}
      onRemove={async (row) => {
        const { undo } = await unlinkWorkItem(milestone.id, row.id);
        await refresh();
        return undo;
      }}
      onRestored={refresh}
      linkState={originState}
      testId="milestone-counts"
    />
  );
}

export default MilestoneCountsTowardList;

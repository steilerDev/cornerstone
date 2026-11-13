import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { itemValue, parseItemValue } from '../../components/EntityPicker/entityPickerKinds.js';
import { FormError } from '../../components/FormError/FormError.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { actionError } from '../../lib/actionError.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { useFormatters } from '../../lib/formatters.js';
import { createHouseholdItemDep, deleteHouseholdItemDep } from '../../lib/householdItemDepsApi.js';
import { addDependentWorkItem, removeDependentWorkItem } from '../../lib/milestonesApi.js';
import type { MilestonePanelProps } from './milestonePageTypes.js';

type MilestoneWaitingForListProps = Pick<
  MilestonePanelProps,
  'milestone' | 'refresh' | 'originState'
>;

/**
 * The tasks and purchases that wait for a milestone. Add picks from one shared list of tasks and
 * purchases; Remove unlinks with Undo.
 */
export function MilestoneWaitingForList({
  milestone,
  refresh,
  originState,
}: MilestoneWaitingForListProps) {
  const { t } = useTranslation('schedule');
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const [addError, setAddError] = useState<string | null>(null);

  const { workItems, dependentWorkItems, dependentHouseholdItems } = milestone;

  const rows = useMemo((): RelatedListRow[] => {
    const rowFacts = (kind: string, date: string | null): string =>
      date === null ? kind : t('milestones.detail.work.rowFacts', { kind, date: formatDate(date) });
    const tasks = dependentWorkItems.map((item): RelatedListRow => ({
      id: itemValue({ type: 'work_item', id: item.id }),
      title: item.title,
      to: routeUrl('workItem', { id: item.id }),
      badges: <Badge variants={statusVariants.task} value={item.status} />,
      facts: rowFacts(
        t('milestones.detail.work.kindTask'),
        item.projectedStartDate ?? item.startDate,
      ),
    }));
    const purchases = dependentHouseholdItems.map((item): RelatedListRow => ({
      id: itemValue({ type: 'household_item', id: item.id }),
      title: item.name,
      to: routeUrl('householdItem', { id: item.id }),
      badges: <Badge variants={statusVariants.purchase} value={item.status} />,
      facts: rowFacts(t('milestones.detail.work.kindPurchase'), item.targetDeliveryDate),
    }));
    return [...tasks, ...purchases];
  }, [dependentWorkItems, dependentHouseholdItems, statusVariants, t, formatDate]);

  const linkError = (err: unknown): string =>
    err instanceof ApiClientError && err.error.code === 'CIRCULAR_DEPENDENCY'
      ? t('milestones.detail.work.alreadyCounts')
      : actionError(err, tErrors, t('milestones.detail.work.addError'));

  const add = async (value: string, close: () => void) => {
    // The picker only emits values `itemValue` built.
    const target = parseItemValue(value)!;
    setAddError(null);
    try {
      if (target.type === 'work_item') {
        await addDependentWorkItem(milestone.id, target.id);
      } else {
        await createHouseholdItemDep(target.id, {
          predecessorType: 'milestone',
          predecessorId: String(milestone.id),
        });
      }
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
      title={t('milestones.detail.work.waitingFor')}
      headingLevel={2}
      rows={rows}
      emptyMessage={t('milestones.detail.work.waitingEmpty')}
      action={{
        kind: 'picker',
        label: t('milestones.detail.work.addWaiting'),
        renderPicker: ({ close }) => (
          <div>
            <EntityPicker
              kind="taskOrPurchase"
              value=""
              clearOnSelect
              autoFocus
              excludeIds={[
                ...rows.map((row) => row.id),
                ...workItems.map((item) => itemValue({ type: 'work_item', id: item.id })),
              ]}
              onChange={(value) => void add(value, close)}
            />
            <FormError message={addError} />
          </div>
        ),
      }}
      onRemove={async (row) => {
        const target = parseItemValue(row.id)!;
        const { undo } =
          target.type === 'work_item'
            ? await removeDependentWorkItem(milestone.id, target.id)
            : await deleteHouseholdItemDep(target.id, 'milestone', String(milestone.id));
        await refresh();
        return undo;
      }}
      onRestored={refresh}
      linkState={originState}
      testId="milestone-waiting"
    />
  );
}

export default MilestoneWaitingForList;

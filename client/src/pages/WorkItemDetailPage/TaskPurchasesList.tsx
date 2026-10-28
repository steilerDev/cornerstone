import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import type { TaskPanelProps } from './taskPageTypes.js';

export interface TaskPurchasesListProps {
  /** null until loaded: nothing renders then, and for an empty list. */
  readonly purchases: readonly WorkItemLinkedHouseholdItemSummary[] | null;
  readonly originState: TaskPanelProps['originState'];
}

/** The delivery window ("earliest – latest"), the target date, or nothing. */
function deliveryText(
  purchase: WorkItemLinkedHouseholdItemSummary,
  formatDate: (date: string) => string,
  t: TFunction<'workItems'>,
): string | null {
  if (purchase.earliestDeliveryDate && purchase.latestDeliveryDate) {
    return t('taskPage.strip.dateRange', {
      start: formatDate(purchase.earliestDeliveryDate),
      end: formatDate(purchase.latestDeliveryDate),
    });
  }
  return purchase.targetDeliveryDate ? formatDate(purchase.targetDeliveryDate) : null;
}

/** Purchases waiting for this task: a read-only list, rendered only when there are any. */
export function TaskPurchasesList({ purchases, originState }: TaskPurchasesListProps) {
  const { t } = useTranslation('workItems');
  const statusVariants = useStatusBadgeVariants();
  const { formatDate } = useFormatters();

  if (purchases === null || purchases.length === 0) return null;

  const rows = purchases.map((purchase): RelatedListRow => ({
    id: purchase.id,
    title: purchase.name,
    to: routeUrl('householdItem', { id: purchase.id }),
    badges: (
      <Badge
        variants={statusVariants.purchase}
        value={purchase.status}
        testId={`task-purchase-status-${purchase.id}`}
      />
    ),
    facts: deliveryText(purchase, formatDate, t),
    removable: false,
  }));

  return (
    <RelatedList
      title={t('taskPage.timing.purchases')}
      testId="task-purchases"
      rows={rows}
      linkState={originState}
      emptyMessage=""
    />
  );
}

export default TaskPurchasesList;

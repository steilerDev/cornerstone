import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { VendorRelatedBudgetLine } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListRow } from '../../components/RelatedList/types.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { useFormatters } from '../../lib/formatters.js';
import type { OriginState } from '../../navigation/origin.js';
import type { UseCompanyRelationsResult } from './useCompanyRelations.js';

export interface CompanyWorkPanelProps {
  readonly relations: UseCompanyRelationsResult;
  readonly originState: OriginState;
}

/** The page of the task or purchase a cost line belongs to; none for an orphan line. */
function parentUrl(parent: VendorRelatedBudgetLine['parent']): string | undefined {
  if (parent === null) return undefined;
  return parent.type === 'work_item'
    ? routeUrl('workItem', { id: parent.id })
    : routeUrl('householdItem', { id: parent.id });
}

/** The Work tab: the tasks, purchases and cost lines that name the company (read only). */
export function CompanyWorkPanel({ relations, originState }: CompanyWorkPanelProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const userText = useUserText();
  const { data, failure } = relations;

  const loadError =
    data === null && failure !== null
      ? fetchFailureMessage(failure, tErrors, t('companyPage.work.loadError'))
      : null;

  const taskRows =
    data === null
      ? null
      : data.workItems.map((item): RelatedListRow => ({
          id: item.id,
          title: item.title,
          to: routeUrl('workItem', { id: item.id }),
          badges: <Badge variants={statusVariants.task} value={item.status} />,
          facts: item.endDate
            ? t('companyPage.work.taskEnds', { date: formatDate(item.endDate) })
            : undefined,
        }));

  const purchaseRows =
    data === null
      ? null
      : data.householdItems.map((item): RelatedListRow => {
          let facts: string | undefined;
          if (item.actualDeliveryDate) {
            facts = t('companyPage.work.delivered', { date: formatDate(item.actualDeliveryDate) });
          } else if (item.targetDeliveryDate) {
            facts = t('companyPage.work.delivery', { date: formatDate(item.targetDeliveryDate) });
          }
          return {
            id: item.id,
            title: item.name,
            to: routeUrl('householdItem', { id: item.id }),
            badges: <Badge variants={statusVariants.purchase} value={item.status} />,
            facts,
          };
        });

  const lineRows =
    data === null
      ? null
      : data.budgetLines.map((line): RelatedListRow => ({
          id: line.id,
          title: line.description ?? line.parent?.title ?? t('companyPage.work.untitledLine'),
          to: parentUrl(line.parent),
          facts:
            line.description && line.parent ? (
              <span {...userText()}>{line.parent.title}</span>
            ) : undefined,
          amount: formatCurrency(line.plannedAmount),
        }));

  return (
    <>
      <RelatedList
        title={t('companyPage.work.tasks')}
        headingLevel={2}
        testId="company-tasks"
        rows={taskRows}
        loadError={loadError}
        onRetry={relations.retry}
        emptyMessage={t('companyPage.work.tasksEmpty')}
        linkState={originState}
      />
      <RelatedList
        title={t('companyPage.work.purchases')}
        headingLevel={2}
        testId="company-purchases"
        rows={purchaseRows}
        loadError={loadError}
        onRetry={relations.retry}
        emptyMessage={t('companyPage.work.purchasesEmpty')}
        linkState={originState}
      />
      <RelatedList
        title={t('companyPage.work.costLines')}
        headingLevel={2}
        testId="company-cost-lines"
        rows={lineRows}
        loadError={loadError}
        onRetry={relations.retry}
        emptyMessage={t('companyPage.work.costLinesEmpty')}
        linkState={originState}
      />
    </>
  );
}

export default CompanyWorkPanel;

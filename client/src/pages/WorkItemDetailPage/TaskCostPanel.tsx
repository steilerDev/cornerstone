import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { SubsidyProgram } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { CostLinesSection } from '../../components/CostLineTable/CostLinesSection.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { useFormatters } from '../../lib/formatters.js';
import {
  fetchWorkItemSubsidies,
  linkWorkItemSubsidy,
  unlinkWorkItemSubsidy,
} from '../../lib/workItemsApi.js';
import type { TaskPanelProps } from './taskPageTypes.js';
import styles from './TaskCostPanel.module.css';

/**
 * The Cost tab of the task page: its cost lines (estimates, then one group per offer or invoice)
 * and the grants that cover it. A grant link is a plain relation: Remove unlinks with Undo.
 */
export function TaskCostPanel({ task, revision, refresh, originState }: TaskPanelProps) {
  const { t } = useTranslation('workItems');
  const { t: tBudget } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const taskId = task.id;
  const [grants, setGrants] = useState<readonly SubsidyProgram[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<FetchFailure | null>(null);
  const [linkFailure, setLinkFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchWorkItemSubsidies(taskId)
      .then((response) => {
        if (cancelled) return;
        setGrants(response);
        setLoadFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, revision, attempt]);

  const reload = useCallback(async () => {
    setGrants(await fetchWorkItemSubsidies(taskId));
  }, [taskId]);

  const messageOf = (failure: FetchFailure | null, fallback: string) =>
    failure === null ? null : fetchFailureMessage(failure, tErrors, fallback);

  const rows = useMemo(
    () =>
      grants?.map((grant) => ({
        id: grant.id,
        title: grant.name,
        to: routeUrl('grant', { id: grant.id }),
        badges: <Badge variants={statusVariants.grant} value={grant.applicationStatus} />,
        facts:
          grant.reductionType === 'percentage'
            ? tBudget('subsidies.linkSection.reductionPercentage', { value: grant.reductionValue })
            : tBudget('subsidies.linkSection.reductionFixed', {
                amount: formatCurrency(grant.reductionValue),
              }),
      })) ?? null,
    [grants, statusVariants, tBudget, formatCurrency],
  );

  const linkGrant = async (grantId: string, close: () => void) => {
    setLinkFailure(null);
    try {
      await linkWorkItemSubsidy(taskId, grantId);
      await reload();
      await refresh();
      close();
    } catch (err) {
      setLinkFailure(toFetchFailure(err));
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.costCard}>
        <CostLinesSection
          host={{ kind: 'work_item', id: taskId, label: task.title }}
          lines={task.budgets}
          onChanged={refresh}
          linkState={originState}
          headingLevel={2}
        />
      </div>
      <RelatedList
        title={t('taskPage.cost.grants')}
        rows={rows}
        loadError={messageOf(loadFailure, t('taskPage.cost.loadError'))}
        onRetry={() => {
          setLoadFailure(null);
          setAttempt((value) => value + 1);
        }}
        emptyMessage={t('taskPage.cost.grantsEmpty')}
        action={{
          kind: 'picker',
          label: t('taskPage.cost.add'),
          renderPicker: ({ close }) => (
            <div>
              <EntityPicker
                kind="grant"
                value=""
                clearOnSelect
                autoFocus
                excludeIds={(grants ?? []).map((grant) => grant.id)}
                onChange={(value) => void linkGrant(value, close)}
              />
              <FormError message={messageOf(linkFailure, t('taskPage.cost.linkError'))} />
            </div>
          ),
        }}
        onRemove={async (row) => {
          const response = await unlinkWorkItemSubsidy(taskId, row.id);
          await reload();
          await refresh();
          return response.undo;
        }}
        onRestored={async () => {
          await reload();
          await refresh();
        }}
        linkState={originState}
        testId="task-grants"
      />
    </div>
  );
}

export default TaskCostPanel;

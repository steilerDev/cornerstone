import { useTranslation } from 'react-i18next';
import { CostLinesSection } from '../../components/CostLineTable/CostLinesSection.js';
import { GrantLinksList } from '../../components/RelatedList/GrantLinksList.js';
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
  const taskId = task.id;

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
      <GrantLinksList
        revision={revision}
        load={() => fetchWorkItemSubsidies(taskId)}
        link={(grantId) => linkWorkItemSubsidy(taskId, grantId)}
        unlink={(grantId) => unlinkWorkItemSubsidy(taskId, grantId)}
        onChanged={refresh}
        labels={{
          title: t('taskPage.cost.grants'),
          empty: t('taskPage.cost.grantsEmpty'),
          add: t('taskPage.cost.add'),
          loadError: t('taskPage.cost.loadError'),
          linkError: t('taskPage.cost.linkError'),
        }}
        linkState={originState}
        testId="task-grants"
      />
    </div>
  );
}

export default TaskCostPanel;

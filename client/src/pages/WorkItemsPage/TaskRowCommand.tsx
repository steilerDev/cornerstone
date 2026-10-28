import { useTranslation } from 'react-i18next';
import type { WorkItemListRow } from '@cornerstone/shared';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { taskTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import type { TaskActions } from './useTaskActions.js';

export interface TaskRowCommandProps {
  readonly item: WorkItemListRow;
  readonly actions: Pick<TaskActions, 'applyStatus'>;
  readonly testId: string;
}

/**
 * The row command of a task that is not done: "Start" (Not started) or "Mark done" (In progress),
 * both with the date step. A done task has no command (Reopen lives in its ⋯ menu).
 */
export function TaskRowCommand({ item, actions, testId }: TaskRowCommandProps) {
  const { t: tCommon } = useTranslation('common');
  const statusVariants = useStatusBadgeVariants();
  if (item.status === 'completed') return null;
  return (
    <StatusMenu
      appearance="action"
      actionTo={item.status === 'not_started' ? 'in_progress' : 'completed'}
      transitions={taskTransitions(tCommon, item)}
      badge={{ variants: statusVariants.task, value: item.status }}
      currentLabel={statusVariants.task[item.status].label}
      nameSuffix={item.title}
      onApply={(to, date) => actions.applyStatus(item, to, date)}
      testId={testId}
    />
  );
}

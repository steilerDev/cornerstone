import { useTranslation } from 'react-i18next';
import { DEPENDENCY_TYPES, SCHEDULE_DURATION_DAYS_MAX, routeUrl } from '@cornerstone/shared';
import type { DependencyType } from '@cornerstone/shared';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';
import { createDependency, updateDependency } from '../lib/dependenciesApi.js';
import { translateApiError } from '../lib/errorTranslation.js';

/** Which side of the task the dependency list is: the tasks it waits for, or those waiting for it. */
export type DependencyDirection = 'waitsFor' | 'waiting';

/** The dependency being edited: the other task and the current attributes. */
export interface DependencyFormRow {
  /** The other task's id. */
  readonly id: string;
  readonly title: string;
  readonly dependencyType: DependencyType;
  readonly leadLagDays: number;
}

export type DependencyFormOptions = {
  readonly direction: DependencyDirection;
  /** The task whose page this is. */
  readonly workItemId: string;
  /** Task ids the picker cannot offer (the task itself and every current relation). */
  readonly excludeIds: readonly string[];
  /** After the request succeeded: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
} & ({ readonly mode: 'add' } | { readonly mode: 'edit'; readonly row: DependencyFormRow });

const WHOLE_NUMBER = /^-?\d+$/;
const DEPENDENCY_ERROR_CODES: readonly string[] = ['CIRCULAR_DEPENDENCY', 'DUPLICATE_DEPENDENCY'];

/**
 * The Add / Edit dependency form of the task page. Add picks the other task, Type and Lag; Edit
 * changes Type and Lag only. Type options are worded relative to the task, like the Schedule.
 */
export function useDependencyFormSchema(options: DependencyFormOptions): ObjectFormSchema {
  const { t } = useTranslation('workItems');
  const { t: tSchedule } = useTranslation('schedule');
  const { t: tErrors } = useTranslation('errors');
  const { direction, workItemId, excludeIds, onSaved } = options;

  const relationSet =
    direction === 'waitsFor'
      ? I18N_UNION_KEYS.scheduleWaitsForRelation
      : I18N_UNION_KEYS.scheduleHoldsUpRelation;

  const taskField: ObjectFormField = {
    name: 'task',
    label: t('taskPage.dependencyDialog.task'),
    kind: 'custom',
    essential: true,
    required: true,
    testId: 'dependency-task',
    render: (ctx) => (
      <EntityPicker
        kind="task"
        id={ctx.id}
        value={ctx.value as string}
        onChange={ctx.setValue}
        excludeIds={excludeIds}
        disabled={ctx.busy}
        inputAriaProps={{
          'aria-required': true,
          'aria-invalid': ctx.invalid || undefined,
          'aria-describedby': ctx.describedBy,
        }}
      />
    ),
  };

  const fields: ObjectFormField[] = [
    {
      name: 'type',
      label: t('taskPage.dependencyDialog.type'),
      kind: 'select',
      essential: true,
      options: DEPENDENCY_TYPES.map((type) => ({
        value: type,
        label: tSchedule(relationSet.key(type)),
      })),
      testId: 'dependency-type',
    },
    {
      name: 'lag',
      label: t('taskPage.dependencyDialog.lag'),
      kind: 'number',
      essential: true,
      step: 1,
      inputMode: 'numeric',
      hint: t('taskPage.dependencyDialog.lagHint'),
      testId: 'dependency-lag',
    },
  ];

  const row = options.mode === 'edit' ? options.row : null;
  const title =
    row === null
      ? t(
          direction === 'waitsFor'
            ? 'taskPage.dependencyDialog.addWaitsForTitle'
            : 'taskPage.dependencyDialog.addWaitingTitle',
        )
      : t('taskPage.dependencyDialog.editTitle', { title: row.title });

  return {
    id: 'dependency',
    title,
    initialValues: {
      task: '',
      type: row?.dependencyType ?? 'finish_to_start',
      lag: String(row?.leadLagDays ?? 0),
    },
    fields: row === null ? [taskField, ...fields] : fields,
    validate: (values: ObjectFormValues): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (row === null && values.task === '') {
        errors.task = t('taskPage.dependencyDialog.taskRequired');
      }
      const lag = String(values.lag).trim();
      if (!WHOLE_NUMBER.test(lag) || Math.abs(Number(lag)) > SCHEDULE_DURATION_DAYS_MAX) {
        errors.lag = t('taskPage.dependencyDialog.lagError');
      }
      return errors;
    },
    // Edit has no task field to show the error on.
    mapError: (code) =>
      row === null && DEPENDENCY_ERROR_CODES.includes(code)
        ? { task: translateApiError(code, tErrors) }
        : null,
    submit: async (values) => {
      const dependencyType = values.type as DependencyType;
      const leadLagDays = Number(String(values.lag).trim());
      const other = row?.id ?? String(values.task);
      // The successor is the task that waits.
      const [successorId, predecessorId] =
        direction === 'waitsFor' ? [workItemId, other] : [other, workItemId];
      if (row === null) {
        await createDependency(successorId, { predecessorId, dependencyType, leadLagDays });
      } else {
        await updateDependency(successorId, predecessorId, { dependencyType, leadLagDays });
      }
      await onSaved();
      return {
        id: workItemId,
        href: routeUrl('workItem', { id: workItemId }, { tab: 'timing' }),
        label: title,
      };
    },
  };
}

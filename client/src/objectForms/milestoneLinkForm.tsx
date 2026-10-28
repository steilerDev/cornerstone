import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { translateApiError } from '../lib/errorTranslation.js';
import { addLinkedMilestone, addRequiredMilestone } from '../lib/workItemMilestonesApi.js';

/** Whether the task waits for the milestone, or counts toward it. */
export type MilestoneRelation = 'required' | 'linked';

export interface MilestoneLinkFormOptions {
  readonly workItemId: string;
  /** Ids of the milestones this task already waits for. */
  readonly requiredIds: readonly string[];
  /** Ids of the milestones this task already counts toward. */
  readonly linkedIds: readonly string[];
  /** After the request succeeded: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
}

const MILESTONE_ERROR_CODES: readonly string[] = ['CIRCULAR_DEPENDENCY', 'DUPLICATE_DEPENDENCY'];

/** The Link milestone form of the task page: a Relation and the milestone. */
export function useMilestoneLinkFormSchema(options: MilestoneLinkFormOptions): ObjectFormSchema {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const { workItemId, requiredIds, linkedIds, onSaved } = options;

  return {
    id: 'milestone-link',
    title: t('taskPage.milestoneDialog.title'),
    initialValues: { relation: 'required', milestone: '' },
    fields: [
      {
        name: 'relation',
        label: t('taskPage.milestoneDialog.relation'),
        kind: 'select',
        essential: true,
        options: [
          { value: 'required', label: t('taskPage.milestoneDialog.relationRequired') },
          { value: 'linked', label: t('taskPage.milestoneDialog.relationLinked') },
        ],
        testId: 'milestone-link-relation',
      },
      {
        name: 'milestone',
        label: t('taskPage.milestoneDialog.milestone'),
        kind: 'custom',
        essential: true,
        required: true,
        testId: 'milestone-link-milestone',
        render: (ctx) => (
          <EntityPicker
            kind="milestone"
            id={ctx.id}
            value={ctx.value as string}
            onChange={ctx.setValue}
            excludeIds={ctx.values.relation === 'required' ? requiredIds : linkedIds}
            disabled={ctx.busy}
            inputAriaProps={{
              'aria-required': true,
              'aria-invalid': ctx.invalid || undefined,
              'aria-describedby': ctx.describedBy,
            }}
          />
        ),
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors =>
      values.milestone === '' ? { milestone: t('taskPage.milestoneDialog.milestoneRequired') } : {},
    mapError: (code) =>
      MILESTONE_ERROR_CODES.includes(code) ? { milestone: translateApiError(code, tErrors) } : null,
    submit: async (values) => {
      const milestoneId = Number(values.milestone);
      if (values.relation === 'required') {
        await addRequiredMilestone(workItemId, milestoneId);
      } else {
        await addLinkedMilestone(workItemId, milestoneId);
      }
      await onSaved();
      return {
        id: workItemId,
        href: routeUrl('workItem', { id: workItemId }, { tab: 'timing' }),
        label: t('taskPage.milestoneDialog.title'),
      };
    },
  };
}

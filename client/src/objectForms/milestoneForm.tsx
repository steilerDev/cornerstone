import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormScope,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { createMilestone } from '../lib/milestonesApi.js';

export interface MilestoneFormOptions {
  /** Default 'create' (the dialog). 'edit' = the milestone page card. */
  readonly scope?: ObjectFormScope;
}

export interface MilestoneValueMessages {
  readonly title: string;
  readonly targetDate: string;
}

/** The messages of `validateMilestoneValues` (translation only). */
export function useMilestoneValueMessages(): MilestoneValueMessages {
  const { t } = useTranslation('schedule');
  return {
    title: t('milestones.create.form.title.error'),
    targetDate: t('milestones.create.form.targetDate.error'),
  };
}

/** Every milestone rule, dialog and card alike; keys are field names (missing keys read as ''). */
export function validateMilestoneValues(
  values: ObjectFormValues,
  messages: MilestoneValueMessages,
): ObjectFormErrors {
  const errors: Record<string, string> = {};
  if (!String(values.title ?? '').trim()) errors.title = messages.title;
  if (!String(values.targetDate ?? '').trim()) errors.targetDate = messages.targetDate;
  return errors;
}

/**
 * The milestone form: the New milestone dialog (default) and, with `scope: 'edit'`, the fields
 * of the milestone page card (which adds the colour).
 */
export function useMilestoneFormSchema(options: MilestoneFormOptions = {}): ObjectFormSchema {
  const { scope = 'create' } = options;
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');
  const messages = useMilestoneValueMessages();

  return {
    id: 'milestone',
    title: tc('navigation.newMilestone'),
    prefill: { date: 'targetDate' },
    initialValues: { title: '', targetDate: '', description: '' },
    fields: fieldsForScope(
      [
        {
          name: 'title',
          label: t('milestones.create.form.title.label'),
          kind: 'text',
          essential: true,
          required: true,
          maxLength: 200,
          placeholder: t('milestones.create.form.title.placeholder'),
          testId: 'milestone-title-input',
        },
        {
          name: 'targetDate',
          label: t('milestones.create.form.targetDate.label'),
          kind: 'date',
          essential: true,
          required: true,
          testId: 'milestone-target-date-input',
        },
        {
          name: 'description',
          label: t('milestones.create.form.description.label'),
          kind: 'textarea',
          maxLength: 2000,
          placeholder: t('milestones.create.form.description.placeholder'),
          testId: 'milestone-description-input',
        },
        {
          // Set on the milestone page after creation.
          name: 'color',
          label: t('milestones.detail.overview.color'),
          kind: 'color',
          scope: 'edit',
        },
      ],
      scope,
    ),
    validate: (values: ObjectFormValues): ObjectFormErrors =>
      validateMilestoneValues(values, messages),
    submit: async (values) => {
      const title = String(values.title);
      const milestone = await createMilestone({
        title,
        targetDate: String(values.targetDate),
        description: String(values.description ?? '') || undefined,
      });
      return {
        id: String(milestone.id),
        href: routeUrl('milestone', { id: milestone.id }),
        label: title,
      };
    },
  };
}

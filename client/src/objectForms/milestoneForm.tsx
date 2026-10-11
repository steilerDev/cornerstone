import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { createMilestone } from '../lib/milestonesApi.js';

/** The New milestone form: a 1:1 port of the former create page. */
export function useMilestoneFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('schedule');
  const { t: tc } = useTranslation('common');

  return {
    id: 'milestone',
    title: tc('navigation.newMilestone'),
    prefill: { date: 'targetDate' },
    initialValues: { title: '', targetDate: '', description: '' },
    fields: [
      {
        name: 'title',
        label: t('milestones.create.form.title.label'),
        kind: 'text',
        essential: true,
        required: true,
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
        essential: true,
        placeholder: t('milestones.create.form.description.placeholder'),
        testId: 'milestone-description-input',
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!String(values.title ?? '').trim()) {
        errors.title = t('milestones.create.form.title.error');
      }
      if (!String(values.targetDate ?? '').trim()) {
        errors.targetDate = t('milestones.create.form.targetDate.error');
      }
      return errors;
    },
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

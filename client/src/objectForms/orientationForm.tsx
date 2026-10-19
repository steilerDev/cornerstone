import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { ObjectFormErrors, ObjectFormSchema } from '../components/ObjectForm/types.js';
import { createOrientation } from '../lib/orientationApi.js';

export const ORIENTATION_NAME_MAX_LENGTH = 200;
export const ORIENTATION_DESCRIPTION_MAX_LENGTH = 2000;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The New orientation form. Field names are the API body keys, so server
 * `details.fields[].path` maps onto them.
 */
export function useOrientationFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('settings');

  return {
    id: 'orientation',
    title: t('manage.orientations.form.titleNew'),
    initialValues: { name: '', description: '' },
    fields: [
      {
        name: 'name',
        label: t('manage.orientations.form.name'),
        kind: 'text',
        essential: true,
        required: true,
        maxLength: ORIENTATION_NAME_MAX_LENGTH,
        testId: 'orientation-name-input',
      },
      {
        name: 'description',
        label: t('manage.orientations.form.description'),
        kind: 'textarea',
        maxLength: ORIENTATION_DESCRIPTION_MAX_LENGTH,
        testId: 'orientation-description-input',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!text(values.name)) errors.name = t('manage.orientations.form.nameRequired');
      return errors;
    },
    mapError: (code) =>
      code === 'CONFLICT' ? { name: t('manage.orientations.form.duplicate') } : null,
    submit: async (values) => {
      const name = text(values.name);
      const created = await createOrientation({
        name,
        description: text(values.description) || null,
      });
      return { id: created.id, href: routeUrl('settingsManage'), label: created.name };
    },
  };
}

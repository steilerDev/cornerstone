import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { ObjectFormErrors, ObjectFormSchema } from '../components/ObjectForm/types.js';
import { createHouseholdItemCategory } from '../lib/householdItemCategoriesApi.js';

export const PURCHASE_CATEGORY_NAME_MAX_LENGTH = 100;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The New purchase category form: the name only (P5.10c extends it). Field names are the API
 * body keys, so server `details.fields[].path` maps onto them.
 */
export function usePurchaseCategoryFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');

  return {
    id: 'purchase-category',
    title: t('entityPicker.forms.categoryTitle'),
    initialValues: { name: '' },
    fields: [
      {
        name: 'name',
        label: t('entityPicker.forms.name'),
        kind: 'text',
        essential: true,
        required: true,
        maxLength: PURCHASE_CATEGORY_NAME_MAX_LENGTH,
        testId: 'purchase-category-name-input',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!text(values.name)) errors.name = tSettings('tradesManager.nameRequired');
      return errors;
    },
    mapError: (code) =>
      code === 'CONFLICT'
        ? { name: tSettings('projectSetup.purchaseCategories.duplicateName') }
        : null,
    submit: async (values) => {
      const created = await createHouseholdItemCategory({ name: text(values.name) });
      return { id: created.id, href: routeUrl('settingsManage'), label: created.name };
    },
  };
}

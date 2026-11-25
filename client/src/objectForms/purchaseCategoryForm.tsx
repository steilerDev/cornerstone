import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import type { ReferenceListItem } from '../components/ReferenceList/ReferenceList.js';
import { useEntriesLanguage } from '../contexts/HouseNameContext.js';
import {
  createHouseholdItemCategory,
  updateHouseholdItemCategory,
} from '../lib/householdItemCategoriesApi.js';
import { readReferenceValues, referenceChanges, referenceFormPrefill } from './referenceForm.js';
import type { ReferenceExtraField, ReferenceFormOptions } from './referenceForm.js';

export const PURCHASE_CATEGORY_NAME_MAX_LENGTH = 100;

const EXTRAS: readonly ReferenceExtraField[] = ['color'];

/** Start values of an edit; undefined for a new purchase category. */
export function purchaseCategoryFormPrefill(
  item?: ReferenceListItem,
): ObjectFormValues | undefined {
  return referenceFormPrefill(item, EXTRAS);
}

/**
 * The New / Edit purchase category form (name and colour), shared by Project setup and the
 * category pickers' inline create. Field names are the API body keys, so server
 * `details.fields[].path` maps onto them.
 */
export function usePurchaseCategoryFormSchema(
  options: ReferenceFormOptions = {},
): ObjectFormSchema {
  const { t } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const entriesLanguage = useEntriesLanguage() ?? undefined;
  const mode = options.mode ?? 'new';
  const { item } = options;

  return {
    id: mode === 'edit' ? 'purchase-category-edit' : 'purchase-category',
    title:
      mode === 'edit'
        ? tSettings('projectSetup.purchaseCategories.editItem', {
            item: tSettings('projectSetup.purchaseCategories.item'),
          })
        : t('entityPicker.forms.categoryTitle'),
    initialValues: { name: '', color: null },
    fields: [
      {
        name: 'name',
        label: t('entityPicker.forms.name'),
        kind: 'text',
        essential: true,
        required: true,
        autoComplete: 'off',
        lang: entriesLanguage,
        maxLength: PURCHASE_CATEGORY_NAME_MAX_LENGTH,
        ...(mode === 'edit' && item?.translated ? { hint: t('referenceList.translatedHint') } : {}),
        testId: 'purchase-category-name-input',
      },
      {
        name: 'color',
        label: t('referenceList.colorLabel'),
        kind: 'color',
        testId: 'purchase-category',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!readReferenceValues(values, EXTRAS).name) {
        errors.name = tSettings('tradesManager.nameRequired');
      }
      return errors;
    },
    mapError: (code) =>
      code === 'CONFLICT'
        ? { name: tSettings('projectSetup.purchaseCategories.duplicateName') }
        : null,
    submit: async (values) => {
      const next = readReferenceValues(values, EXTRAS);
      if (mode === 'edit' && item) {
        const changes = referenceChanges(item, next, EXTRAS);
        if (Object.keys(changes).length > 0) {
          await (options.update ?? defaultUpdate)(item.id, changes);
        }
        return { id: item.id, href: routeUrl('settingsManage'), label: next.name };
      }
      const created = await (options.create ?? defaultCreate)(next);
      return { id: created.id, href: routeUrl('settingsManage'), label: next.name };
    },
  };
}

const defaultCreate: NonNullable<ReferenceFormOptions['create']> = (values) =>
  createHouseholdItemCategory({ name: values.name, color: values.color ?? null });

const defaultUpdate: NonNullable<ReferenceFormOptions['update']> = (id, changes) =>
  updateHouseholdItemCategory(id, {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.color !== undefined ? { color: changes.color } : {}),
  });

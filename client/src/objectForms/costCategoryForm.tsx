import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import type { ReferenceListItem } from '../components/ReferenceList/ReferenceList.js';
import { useEntriesLanguage } from '../contexts/HouseNameContext.js';
import { createBudgetCategory, updateBudgetCategory } from '../lib/budgetCategoriesApi.js';
import { readReferenceValues, referenceChanges, referenceFormPrefill } from './referenceForm.js';
import type { ReferenceExtraField, ReferenceFormOptions } from './referenceForm.js';

export const COST_CATEGORY_NAME_MAX_LENGTH = 100;
export const COST_CATEGORY_DESCRIPTION_MAX_LENGTH = 500;

const EXTRAS: readonly ReferenceExtraField[] = ['description', 'color'];

/** Start values of an edit; undefined for a new cost category. */
export function costCategoryFormPrefill(item?: ReferenceListItem): ObjectFormValues | undefined {
  return referenceFormPrefill(item, EXTRAS);
}

/**
 * The New / Edit cost category form (name, description, colour) used by Project setup. Field
 * names are the API body keys, so server `details.fields[].path` maps onto them.
 */
export function useCostCategoryFormSchema(options: ReferenceFormOptions = {}): ObjectFormSchema {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const entriesLanguage = useEntriesLanguage() ?? undefined;
  const mode = options.mode ?? 'new';
  const { item } = options;
  const itemLabel = t('projectSetup.costCategories.item');

  return {
    id: mode === 'edit' ? 'cost-category-edit' : 'cost-category',
    title:
      mode === 'edit'
        ? t('projectSetup.costCategories.editItem', { item: itemLabel })
        : t('projectSetup.costCategories.newItem', { item: itemLabel }),
    initialValues: { name: '', description: '', color: null },
    fields: [
      {
        name: 'name',
        label: tCommon('referenceList.nameLabel'),
        kind: 'text',
        essential: true,
        required: true,
        autoComplete: 'off',
        lang: entriesLanguage,
        maxLength: COST_CATEGORY_NAME_MAX_LENGTH,
        ...(mode === 'edit' && item?.translated
          ? { hint: tCommon('referenceList.translatedHint') }
          : {}),
        testId: 'cost-category-name-input',
      },
      {
        name: 'description',
        label: tCommon('referenceList.descriptionLabel'),
        kind: 'textarea',
        lang: entriesLanguage,
        maxLength: COST_CATEGORY_DESCRIPTION_MAX_LENGTH,
        testId: 'cost-category-description-input',
      },
      {
        name: 'color',
        label: tCommon('referenceList.colorLabel'),
        kind: 'color',
        testId: 'cost-category',
      },
    ],
    validate: (values): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      if (!readReferenceValues(values, EXTRAS).name) {
        errors.name = tCommon('referenceList.nameRequired');
      }
      return errors;
    },
    mapError: (code) =>
      code === 'CONFLICT' ? { name: t('projectSetup.costCategories.duplicateName') } : null,
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
  createBudgetCategory({
    name: values.name,
    description: values.description ?? null,
    color: values.color ?? null,
  });

const defaultUpdate: NonNullable<ReferenceFormOptions['update']> = (id, changes) =>
  updateBudgetCategory(id, {
    ...(changes.name !== undefined ? { name: changes.name } : {}),
    ...(changes.description !== undefined ? { description: changes.description } : {}),
    ...(changes.color !== undefined ? { color: changes.color } : {}),
  });

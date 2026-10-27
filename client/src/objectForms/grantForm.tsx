import { useTranslation } from 'react-i18next';
import { SUBSIDY_APPLICATION_STATUSES, routeUrl } from '@cornerstone/shared';
import type { SubsidyApplicationStatus } from '@cornerstone/shared';
import { EntityMultiPicker } from '../components/EntityPicker/EntityMultiPicker.js';
import type { EntityOption } from '../components/EntityPicker/types.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { createSubsidyProgram } from '../lib/subsidyProgramsApi.js';

const NAME_MAX = 200;
const RATE_MAX = 100;

/** Id of the "No category" row in the category picker; it maps to `includesNoCategoryItems`. */
export const NO_CATEGORY_OPTION_ID = '__no_category__';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The chips of a multi-picker field (the field value is the chosen options). */
function chosen(value: unknown): readonly EntityOption[] {
  return Array.isArray(value) ? (value as EntityOption[]) : [];
}

/**
 * The New grant form (Financing page and the New menu). Percentage grants only: the form has no
 * reduction type, provider or project-wide option. Page-agnostic: the dialog host decides what
 * happens after Save, and the edit form of the grant page extends it.
 */
export function useGrantFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('budget');
  const statusVariants = useStatusBadgeVariants();

  const fields: ObjectFormField[] = [
    {
      name: 'name',
      label: t('financing.fields.name'),
      kind: 'text',
      essential: true,
      required: true,
      maxLength: NAME_MAX,
    },
    {
      name: 'reductionValue',
      label: t('financing.fields.rate'),
      kind: 'number',
      essential: true,
      required: true,
      width: 'half',
      min: 0,
      step: 0.01,
      inputMode: 'decimal',
      hint: t('financing.hints.rate'),
    },
    {
      name: 'maximumAmount',
      label: t('financing.grant.cap'),
      kind: 'number',
      essential: true,
      width: 'half',
      min: 0,
      step: 0.01,
      inputMode: 'decimal',
    },
    {
      name: 'items',
      label: t('financing.fields.items'),
      kind: 'custom',
      essential: true,
      required: true,
      render: (ctx) => (
        <EntityMultiPicker
          id={ctx.id}
          value={chosen(ctx.value)}
          onChange={(next) => ctx.setValue(next)}
          picker={{ kind: 'taskOrPurchase', disabled: ctx.busy }}
          removeLabel={(option) => t('financing.work.removeChip', { name: option.label })}
          countLabel={(count) => t('financing.work.selected', { count })}
          invalid={ctx.invalid}
          describedBy={ctx.describedBy}
          testId="grant-form-items"
        />
      ),
    },
    {
      name: 'applicationStatus',
      label: t('financing.fields.status'),
      kind: 'select',
      width: 'half',
      options: SUBSIDY_APPLICATION_STATUSES.map((status) => ({
        value: status,
        label: statusVariants.grant[status].label,
      })),
    },
    {
      name: 'applicationDeadline',
      label: t('financing.fields.deadline'),
      kind: 'date',
      width: 'half',
    },
    {
      name: 'categories',
      label: t('financing.fields.categories'),
      kind: 'custom',
      hint: t('financing.hints.categories'),
      render: (ctx) => (
        <EntityMultiPicker
          id={ctx.id}
          value={chosen(ctx.value)}
          onChange={(next) => ctx.setValue(next)}
          picker={{
            kind: 'category',
            create: 'off',
            disabled: ctx.busy,
            specialOptions: [
              { id: NO_CATEGORY_OPTION_ID, label: t('financing.fields.noCategory') },
            ],
          }}
          removeLabel={(option) => t('financing.work.removeChip', { name: option.label })}
          countLabel={(count) => t('financing.work.selected', { count })}
          invalid={ctx.invalid}
          describedBy={ctx.describedBy}
          testId="grant-form-categories"
        />
      ),
    },
    { name: 'description', label: t('financing.fields.description'), kind: 'textarea' },
    { name: 'eligibility', label: t('financing.fields.eligibility'), kind: 'textarea' },
    { name: 'notes', label: t('financing.fields.notes'), kind: 'textarea' },
  ];

  const initialValues: ObjectFormValues = {
    name: '',
    reductionValue: '',
    maximumAmount: '',
    items: [],
    applicationStatus: 'eligible',
    applicationDeadline: '',
    categories: [],
    description: '',
    eligibility: '',
    notes: '',
  };

  const validate = (values: ObjectFormValues): ObjectFormErrors => {
    const errors: Record<string, string> = {};
    if (!text(values.name).trim()) errors.name = t('financing.errors.nameRequired');
    const rawRate = text(values.reductionValue).trim();
    const rate = Number(rawRate);
    if (!(rawRate !== '' && Number.isFinite(rate) && rate > 0 && rate <= RATE_MAX)) {
      errors.reductionValue = t('financing.errors.rateInvalid');
    }
    const rawCap = text(values.maximumAmount).trim();
    if (rawCap !== '' && !(Number.isFinite(Number(rawCap)) && Number(rawCap) > 0)) {
      errors.maximumAmount = t('financing.errors.amountInvalid');
    }
    if (chosen(values.items).length === 0) errors.items = t('financing.errors.itemsRequired');
    return errors;
  };

  const object = t('financing.nouns.grant');
  return {
    id: 'grant',
    title: t('financing.form.titleNewGrant', { object }),
    fields,
    initialValues,
    validate,
    addAnother: true,
    submit: async (values) => {
      const rawCap = text(values.maximumAmount).trim();
      const categories = chosen(values.categories);
      const created = await createSubsidyProgram({
        name: text(values.name).trim(),
        reductionType: 'percentage',
        reductionValue: Number(text(values.reductionValue)),
        maximumAmount: rawCap === '' ? null : Number(rawCap),
        applicationStatus: text(values.applicationStatus) as SubsidyApplicationStatus,
        applicationDeadline: text(values.applicationDeadline) || null,
        categoryIds: categories
          .filter((option) => option.id !== NO_CATEGORY_OPTION_ID)
          .map((option) => option.id),
        includesNoCategoryItems: categories.some((option) => option.id === NO_CATEGORY_OPTION_ID),
        description: text(values.description).trim() || null,
        eligibility: text(values.eligibility).trim() || null,
        notes: text(values.notes).trim() || null,
        items: chosen(values.items).map((option) => ({
          type: option.itemType!,
          id: option.entityId!,
        })),
      });
      return {
        id: created.id,
        href: routeUrl('grant', { id: created.id }),
        label: created.name,
      };
    },
    addedMessage: (result) => t('financing.form.added', { name: result.label }),
  };
}

import { useTranslation } from 'react-i18next';
import { SUBSIDY_APPLICATION_STATUSES, routeUrl } from '@cornerstone/shared';
import type { SubsidyApplicationStatus } from '@cornerstone/shared';
import { EntityMultiPicker } from '../components/EntityPicker/EntityMultiPicker.js';
import type { EntityOption } from '../components/EntityPicker/types.js';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormScope,
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

export interface GrantFormOptions {
  /** Default 'create' (the dialog). 'edit' = the grant page Details and Eligibility cards. */
  readonly scope?: ObjectFormScope;
  /** Edit scope: a legacy fixed-amount grant ("Fixed reduction", > 0, no 100 ceiling, no rate hint). */
  readonly fixed?: boolean;
}

export interface GrantValueMessages {
  readonly nameRequired: string;
  readonly rateInvalid: string;
  readonly amountInvalid: string;
  readonly itemsRequired: string;
}

/** The messages of `validateGrantValues` (translation only). */
export function useGrantValueMessages(): GrantValueMessages {
  const { t } = useTranslation('budget');
  return {
    nameRequired: t('financing.errors.nameRequired'),
    rateInvalid: t('financing.errors.rateInvalid'),
    amountInvalid: t('financing.errors.amountInvalid'),
    itemsRequired: t('financing.errors.itemsRequired'),
  };
}

/**
 * Every grant rule, dialog and cards alike. A fixed-amount grant (edit only) needs a reduction
 * above 0 with no ceiling; a percentage grant above 0 and at most 100. At least one item is
 * required only when creating.
 */
export function validateGrantValues(
  values: ObjectFormValues,
  messages: GrantValueMessages,
  options: { readonly fixed?: boolean; readonly scope?: ObjectFormScope } = {},
): ObjectFormErrors {
  const { fixed = false, scope = 'create' } = options;
  const errors: Record<string, string> = {};
  if (!text(values.name).trim()) errors.name = messages.nameRequired;
  const rawRate = text(values.reductionValue).trim();
  const rate = Number(rawRate);
  if (fixed) {
    if (!(rawRate !== '' && Number.isFinite(rate) && rate > 0)) {
      errors.reductionValue = messages.amountInvalid;
    }
  } else if (!(rawRate !== '' && Number.isFinite(rate) && rate > 0 && rate <= RATE_MAX)) {
    errors.reductionValue = messages.rateInvalid;
  }
  const rawCap = text(values.maximumAmount).trim();
  if (rawCap !== '' && !(Number.isFinite(Number(rawCap)) && Number(rawCap) > 0)) {
    errors.maximumAmount = messages.amountInvalid;
  }
  if (scope === 'create' && chosen(values.items).length === 0) {
    errors.items = messages.itemsRequired;
  }
  return errors;
}

/**
 * The grant form: the New grant dialog (Financing page and the New menu) and, with
 * `scope: 'edit'`, the fields of the grant page cards. Percentage grants only when creating: the
 * form has no reduction type, provider or project-wide option. Page-agnostic: the dialog host
 * decides what happens after Save.
 */
export function useGrantFormSchema(options: GrantFormOptions = {}): ObjectFormSchema {
  const { scope = 'create' } = options;
  const fixed = scope === 'edit' && options.fixed === true;
  const { t } = useTranslation('budget');
  const statusVariants = useStatusBadgeVariants();
  const messages = useGrantValueMessages();

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
      name: 'applicationStatus',
      label: t('financing.fields.status'),
      kind: 'select',
      essential: true,
      scope: 'create',
      width: 'half',
      options: SUBSIDY_APPLICATION_STATUSES.map((status) => ({
        value: status,
        label: statusVariants.grant[status].label,
      })),
    },
    {
      name: 'reductionValue',
      label: fixed ? t('financing.grant.fixedReductionField') : t('financing.fields.rate'),
      kind: 'number',
      essential: true,
      required: true,
      width: 'half',
      min: 0,
      max: fixed ? undefined : RATE_MAX,
      step: 0.01,
      inputMode: 'decimal',
      hint: fixed ? undefined : t('financing.hints.rate'),
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
      hint: t('financing.hints.cap'),
    },
    {
      name: 'applicationDeadline',
      label: t('financing.fields.deadline'),
      kind: 'date',
      essential: true,
      width: 'half',
    },
    {
      name: 'items',
      label: t('financing.fields.items'),
      kind: 'custom',
      essential: true,
      required: true,
      scope: 'create',
      testId: 'grant-form-items',
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
          testId={ctx.testId ?? 'grant-form-items'}
        />
      ),
    },
    {
      name: 'categories',
      label: t('financing.fields.categories'),
      kind: 'custom',
      hint: t('financing.hints.categories'),
      testId: 'grant-form-categories',
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
          testId={ctx.testId ?? 'grant-form-categories'}
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

  const object = t('financing.nouns.grant');
  return {
    id: 'grant',
    title: t('financing.form.titleNewGrant', { object }),
    fields: fieldsForScope(fields, scope),
    initialValues,
    validate: (values) => validateGrantValues(values, messages, { fixed, scope }),
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

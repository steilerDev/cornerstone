import { useTranslation } from 'react-i18next';
import { BUDGET_SOURCE_STATUSES, BUDGET_SOURCE_TYPES, routeUrl } from '@cornerstone/shared';
import type { BudgetSourceStatus, BudgetSourceType } from '@cornerstone/shared';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
  ObjectFormScope,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { useStatusBadgeVariants } from '../hooks/useStatusBadgeVariants.js';
import { I18N_UNION_KEYS } from '../i18n/unionKeys.js';
import { createBudgetSource } from '../lib/budgetSourcesApi.js';

const NAME_MAX = 200;
const REFERENCE_MAX = 200;
const CONTACT_MAX = 500;
const RATE_MAX = 100;

/** The types a person can pick: Own funds is the system source and is never created. */
const CREATABLE_SOURCE_TYPES = BUDGET_SOURCE_TYPES.filter((type) => type !== 'discretionary');

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export interface FundingSourceFormOptions {
  /** Default 'create' (the dialog). 'edit' = the funding source page Details card. */
  readonly scope?: ObjectFormScope;
  /** Edit scope: the record is Own funds (Type hidden, amount may be 0). Ignored in create scope. */
  readonly isDiscretionary?: boolean;
}

export interface FundingSourceValueMessages {
  readonly nameRequired: string;
  readonly amountInvalid: string;
  readonly amountNotNegative: string;
  readonly interestInvalid: string;
}

/** The messages of `validateFundingSourceValues` (translation only). */
export function useFundingSourceValueMessages(): FundingSourceValueMessages {
  const { t } = useTranslation('budget');
  return {
    nameRequired: t('financing.errors.nameRequired'),
    amountInvalid: t('financing.errors.amountMinimum'),
    amountNotNegative: t('financing.errors.amountNotNegative'),
    interestInvalid: t('financing.errors.interestInvalid'),
  };
}

/** The smallest regular funding source amount (mirrors updateBudgetSource: >= 0.01). */
const AMOUNT_MIN = 0.01;

/**
 * Every funding source rule, dialog and card alike. The amount must be at least 0.01, except the
 * Own funds source (`isDiscretionary`), which accepts 0 or more (mirrors `updateBudgetSource`).
 */
export function validateFundingSourceValues(
  values: ObjectFormValues,
  messages: FundingSourceValueMessages,
  options: { readonly isDiscretionary?: boolean } = {},
): ObjectFormErrors {
  const own = options.isDiscretionary === true;
  const errors: Record<string, string> = {};
  if (!text(values.name).trim()) errors.name = messages.nameRequired;
  const rawAmount = text(values.totalAmount).trim();
  const amount = Number(rawAmount);
  if (!(
    rawAmount !== '' &&
    Number.isFinite(amount) &&
    (own ? amount >= 0 : amount >= AMOUNT_MIN)
  )) {
    errors.totalAmount = own ? messages.amountNotNegative : messages.amountInvalid;
  }
  const rawRate = text(values.interestRate).trim();
  if (rawRate !== '') {
    const rate = Number(rawRate);
    if (!(Number.isFinite(rate) && rate >= 0 && rate <= RATE_MAX)) {
      errors.interestRate = messages.interestInvalid;
    }
  }
  return errors;
}

/**
 * The funding source form: the New funding source dialog (Financing page and the New menu;
 * page-agnostic, the host decides what happens after Save) and, with `scope: 'edit'`, the fields
 * of the funding source page Details card.
 */
export function useFundingSourceFormSchema(
  options: FundingSourceFormOptions = {},
): ObjectFormSchema {
  const { scope = 'create' } = options;
  const own = scope === 'edit' && options.isDiscretionary === true;
  const { t } = useTranslation('budget');
  const statusVariants = useStatusBadgeVariants();
  const messages = useFundingSourceValueMessages();

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
      name: 'sourceType',
      label: t('financing.fields.type'),
      kind: 'select',
      essential: true,
      required: true,
      width: 'half',
      options: CREATABLE_SOURCE_TYPES.map((type) => ({
        value: type,
        label: t(I18N_UNION_KEYS.fundingSourceType.key(type)),
      })),
    },
    {
      name: 'totalAmount',
      label: t('financing.fields.amount'),
      kind: 'number',
      essential: true,
      required: true,
      width: 'half',
      min: own ? 0 : AMOUNT_MIN,
      step: 0.01,
      inputMode: 'decimal',
    },
    {
      name: 'interestRate',
      label: t('financing.fields.interestRate'),
      kind: 'number',
      essential: true,
      width: 'half',
      min: 0,
      max: RATE_MAX,
      step: 0.01,
      inputMode: 'decimal',
    },
    {
      name: 'status',
      label: t('financing.fields.status'),
      kind: 'select',
      essential: true,
      scope: 'create',
      width: 'half',
      options: BUDGET_SOURCE_STATUSES.map((status) => ({
        value: status,
        label: statusVariants.fundingSource[status].label,
      })),
    },
    { name: 'terms', label: t('financing.fields.terms'), kind: 'textarea' },
    {
      name: 'reference',
      label: t('financing.fields.reference'),
      kind: 'text',
      maxLength: REFERENCE_MAX,
    },
    {
      name: 'contactAddress',
      label: t('financing.fields.contactAddress'),
      kind: 'textarea',
      maxLength: CONTACT_MAX,
    },
    { name: 'notes', label: t('financing.fields.notes'), kind: 'textarea' },
  ];

  const initialValues: ObjectFormValues = {
    name: '',
    sourceType: 'bank_loan',
    totalAmount: '',
    interestRate: '',
    status: 'active',
    terms: '',
    reference: '',
    contactAddress: '',
    notes: '',
  };

  const object = t('financing.nouns.source');
  return {
    id: 'funding-source',
    title: t('financing.form.titleNewSource', { object }),
    fields: fieldsForScope(fields, scope).filter((field) => !(own && field.name === 'sourceType')),
    initialValues,
    validate: (values) => validateFundingSourceValues(values, messages, { isDiscretionary: own }),
    addAnother: true,
    submit: async (values) => {
      const rawRate = text(values.interestRate).trim();
      const created = await createBudgetSource({
        name: text(values.name).trim(),
        sourceType: text(values.sourceType) as BudgetSourceType,
        totalAmount: Number(text(values.totalAmount)),
        interestRate: rawRate === '' ? null : Number(rawRate),
        status: text(values.status) as BudgetSourceStatus,
        terms: text(values.terms).trim() || null,
        reference: text(values.reference).trim() || null,
        contactAddress: text(values.contactAddress).trim() || null,
        notes: text(values.notes).trim() || null,
      });
      return {
        id: created.id,
        href: routeUrl('fundingSource', { id: created.id }),
        label: created.name,
      };
    },
    addedMessage: (result) => t('financing.form.added', { name: result.label }),
  };
}

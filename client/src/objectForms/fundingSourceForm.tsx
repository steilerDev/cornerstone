import { useTranslation } from 'react-i18next';
import { BUDGET_SOURCE_STATUSES, BUDGET_SOURCE_TYPES, routeUrl } from '@cornerstone/shared';
import type { BudgetSourceStatus, BudgetSourceType } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormField,
  ObjectFormSchema,
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

/**
 * The New funding source form (Financing page and the New menu). Page-agnostic: the dialog host
 * decides what happens after Save, and the edit form of the funding source page extends it.
 */
export function useFundingSourceFormSchema(): ObjectFormSchema {
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
      min: 0,
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
      step: 0.01,
      inputMode: 'decimal',
    },
    {
      name: 'status',
      label: t('financing.fields.status'),
      kind: 'select',
      essential: true,
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

  const validate = (values: ObjectFormValues): ObjectFormErrors => {
    const errors: Record<string, string> = {};
    if (!text(values.name).trim()) errors.name = t('financing.errors.nameRequired');
    const amount = Number(text(values.totalAmount));
    if (!(text(values.totalAmount).trim() !== '' && Number.isFinite(amount) && amount > 0)) {
      errors.totalAmount = t('financing.errors.amountInvalid');
    }
    const rawRate = text(values.interestRate).trim();
    if (rawRate !== '') {
      const rate = Number(rawRate);
      if (!(Number.isFinite(rate) && rate >= 0 && rate <= RATE_MAX)) {
        errors.interestRate = t('financing.errors.interestInvalid');
      }
    }
    return errors;
  };

  const object = t('financing.nouns.source');
  return {
    id: 'funding-source',
    title: t('financing.form.titleNewSource', { object }),
    fields,
    initialValues,
    validate,
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

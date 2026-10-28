import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormValues,
} from '../components/ObjectForm/types.js';
import { EntityPicker } from '../components/EntityPicker/EntityPicker.js';
import { getCategoryDisplayName } from '../lib/categoryUtils.js';
import { useTrades } from '../hooks/useTrades.js';
import { isEmailAddress } from '../lib/emailAddress.js';
import { createVendor } from '../lib/vendorsApi.js';

/** A company as a picker offers it. */
export interface CompanyOption {
  readonly id: string;
  readonly name: string;
}

const NAME_MAX_LENGTH = 200;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The New company form. Field names are the API body keys, so server `details.fields[].path`
 * maps onto them.
 */
export function useCompanyFormSchema(): ObjectFormSchema {
  const { t } = useTranslation('budget');
  const { t: tSettings } = useTranslation('settings');
  const { trades } = useTrades();

  return {
    id: 'company',
    title: t('companies.form.title'),
    initialValues: { name: '', tradeId: '', phone: '', email: '', address: '', notes: '' },
    fields: [
      {
        name: 'name',
        label: t('companies.form.name'),
        kind: 'text',
        essential: true,
        required: true,
        maxLength: NAME_MAX_LENGTH,
        testId: 'company-name-input',
      },
      {
        name: 'tradeId',
        label: t('companies.form.trade'),
        kind: 'custom',
        essential: true,
        testId: 'company-trade-input',
        render: (ctx) => {
          const tradeId = typeof ctx.value === 'string' ? ctx.value : '';
          const trade = trades.find((candidate) => candidate.id === tradeId);
          return (
            <EntityPicker
              kind="trade"
              id={ctx.id}
              value={tradeId}
              selectedLabel={
                trade
                  ? getCategoryDisplayName(tSettings, trade.name, trade.translationKey)
                  : undefined
              }
              onChange={ctx.setValue}
              disabled={ctx.busy}
              placeholder={t('companies.form.tradePlaceholder')}
              inputAriaProps={{
                'aria-invalid': ctx.invalid || undefined,
                'aria-describedby': ctx.describedBy,
              }}
            />
          );
        },
      },
      {
        name: 'phone',
        label: t('companies.form.phone'),
        kind: 'tel',
        autoComplete: 'tel',
        maxLength: 50,
        testId: 'company-phone-input',
      },
      {
        name: 'email',
        label: t('companies.form.email'),
        kind: 'email',
        autoComplete: 'email',
        maxLength: 255,
        testId: 'company-email-input',
      },
      {
        name: 'address',
        label: t('companies.form.address'),
        kind: 'textarea',
        maxLength: 500,
        testId: 'company-address-input',
      },
      {
        name: 'notes',
        label: t('companies.form.notes'),
        kind: 'textarea',
        maxLength: 10000,
        testId: 'company-notes-input',
      },
    ],
    validate: (values: ObjectFormValues): ObjectFormErrors => {
      const errors: Record<string, string> = {};
      const name = text(values.name);
      if (!name) errors.name = t('companies.form.nameRequired');
      else if (name.length > NAME_MAX_LENGTH) errors.name = t('companies.form.nameTooLong');
      const email = text(values.email);
      if (email && !isEmailAddress(email)) errors.email = t('companies.form.emailInvalid');
      return errors;
    },
    submit: async (values) => {
      const name = text(values.name);
      const vendor = await createVendor({
        name,
        tradeId: text(values.tradeId) || null,
        phone: text(values.phone) || null,
        email: text(values.email) || null,
        address: text(values.address) || null,
        notes: text(values.notes) || null,
      });
      return { id: vendor.id, href: routeUrl('company', { id: vendor.id }), label: vendor.name };
    },
  };
}

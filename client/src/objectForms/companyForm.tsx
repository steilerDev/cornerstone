import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { TradeSummary } from '@cornerstone/shared';
import { fieldsForScope } from '../components/ObjectForm/objectFormState.js';
import type {
  ObjectFormErrors,
  ObjectFormSchema,
  ObjectFormScope,
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

export interface CompanyFormOptions {
  /** Default 'create' (the dialog). 'edit' = the company page cards. */
  readonly scope?: ObjectFormScope;
  /** Reference data to load (default: all). Only the About card renders Trade. */
  readonly load?: { readonly trades?: boolean };
  /** The saved trade of the company (edit): its name shows before the trades list loads. */
  readonly knownTrade?: TradeSummary | null;
}

export interface CompanyValueMessages {
  readonly nameRequired: string;
  readonly nameTooLong: string;
  readonly emailInvalid: string;
}

/** The messages of `validateCompanyValues` (translation only). */
export function useCompanyValueMessages(): CompanyValueMessages {
  const { t } = useTranslation('budget');
  return {
    nameRequired: t('companies.form.nameRequired'),
    nameTooLong: t('companies.form.nameTooLong'),
    emailInvalid: t('companies.form.emailInvalid'),
  };
}

/** Every company rule, dialog and cards alike; keys are field names (missing keys read as ''). */
export function validateCompanyValues(
  values: ObjectFormValues,
  messages: CompanyValueMessages,
): ObjectFormErrors {
  const errors: Record<string, string> = {};
  const name = String(values.name ?? '').trim();
  if (!name) errors.name = messages.nameRequired;
  else if (name.length > NAME_MAX_LENGTH) errors.name = messages.nameTooLong;
  const email = String(values.email ?? '').trim();
  if (email && !isEmailAddress(email)) errors.email = messages.emailInvalid;
  return errors;
}

/**
 * The company form: the New company dialog (default) and, with `scope: 'edit'`, the fields of the
 * company page cards. Field names are the API body keys, so server `details.fields[].path` maps
 * onto them.
 */
export function useCompanyFormSchema(options: CompanyFormOptions = {}): ObjectFormSchema {
  const { scope = 'create', load, knownTrade } = options;
  const { t } = useTranslation('budget');
  const { t: tSettings } = useTranslation('settings');
  const { trades } = useTrades({ enabled: load?.trades ?? true });
  const messages = useCompanyValueMessages();

  return {
    id: 'company',
    title: t('companies.form.title'),
    initialValues: { name: '', tradeId: '', phone: '', email: '', address: '', notes: '' },
    fields: fieldsForScope(
      [
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
            const trade =
              trades.find((candidate) => candidate.id === tradeId) ??
              (knownTrade?.id === tradeId ? knownTrade : undefined);
            // New trade comes from TagCreateProvider (a stacked dialog, not a child step), so the cards
            // keep it like the task Who card keeps New company.
            return (
              <EntityPicker
                kind="trade"
                inputTestId={ctx.testId}
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
      scope,
    ),
    validate: (values) => validateCompanyValues(values, messages),
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

import { useId } from 'react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { TradeSummary, UpdateVendorRequest, VendorDetail } from '@cornerstone/shared';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import type { ObjectFormValues } from '../../components/ObjectForm/types.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { DetailRow } from '../../components/SectionCard/SectionCardFields.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { telHref } from '../../components/CallButton/telHref.js';
import { useUserText } from '../../hooks/useUserText.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { updateVendor } from '../../lib/vendorsApi.js';
import {
  useCompanyFormSchema,
  useCompanyValueMessages,
  validateCompanyValues,
} from '../../objectForms/companyForm.js';
import styles from './VendorDetailPage.module.css';

type Draft = Readonly<Record<string, string>>;

interface CardDraftOptions<K extends string> {
  readonly vendorId: string;
  readonly initial: Readonly<Record<K, string>>;
  readonly validate: (draft: Readonly<Record<K, string>>) => Partial<Record<K, string>>;
  readonly toBody: (
    draft: Readonly<Record<K, string>>,
    initial: Readonly<Record<K, string>>,
  ) => UpdateVendorRequest;
  readonly onSaved: () => Promise<unknown>;
}

/** Binds the shared card draft to the vendor PATCH; `toBody` maps the draft to the request. */
function useVendorCardDraft<K extends string>({
  vendorId,
  initial,
  validate,
  toBody,
  onSaved,
}: CardDraftOptions<K>) {
  const { t } = useTranslation('budget');
  return useCardDraft<K>({
    initial,
    validate,
    save: (draft) => updateVendor(vendorId, toBody(draft, initial)),
    saveError: t('companyPage.saveError'),
    // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
    onSaved: () =>
      onSaved().then(
        () => undefined,
        () => undefined,
      ),
  });
}

export interface CompanyDetailCardsProps {
  readonly vendor: VendorDetail;
  /** After a successful save: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
  /** Lets the header's "Add phone number" open the Phone and e-mail card. */
  readonly phoneCardRef: Ref<SectionCardController>;
}

/** The Phone and e-mail, Address and About cards of the Overview tab. */
export function CompanyDetailCards({ vendor, onSaved, phoneCardRef }: CompanyDetailCardsProps) {
  return (
    <>
      <PhoneEmailCard vendor={vendor} onSaved={onSaved} controllerRef={phoneCardRef} />
      <AddressCard vendor={vendor} onSaved={onSaved} />
      <AboutCard vendor={vendor} onSaved={onSaved} />
    </>
  );
}

interface CardProps {
  readonly vendor: VendorDetail;
  readonly onSaved: () => Promise<unknown>;
}

interface CompanyFieldsProps {
  readonly names: readonly string[];
  readonly load: { readonly trades: boolean };
  readonly knownTrade: TradeSummary | null;
  readonly values: ObjectFormValues;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
  readonly testIds: Readonly<Partial<Record<string, string>>>;
}

/** Mounted in edit mode only: the company schema (the New company dialog's fields), per-card load. */
function CompanyFields({
  names,
  load,
  knownTrade,
  values,
  errors,
  onChange,
  idPrefix,
  testIds,
}: CompanyFieldsProps) {
  const schema = useCompanyFormSchema({ scope: 'edit', load, knownTrade });
  return (
    <ObjectFormFields
      fields={schema.fields}
      names={names}
      values={values}
      errors={errors}
      onChange={onChange}
      idPrefix={idPrefix}
      testIds={testIds}
    />
  );
}

function changed(draft: Draft, initial: Draft, field: string): boolean {
  return draft[field] !== initial[field];
}

function PhoneEmailCard({
  vendor,
  onSaved,
  controllerRef,
}: CardProps & { readonly controllerRef: Ref<SectionCardController> }) {
  const { t } = useTranslation('budget');
  const messages = useCompanyValueMessages();
  const baseId = useId();
  const card = useVendorCardDraft({
    vendorId: vendor.id,
    initial: { phone: vendor.phone ?? '', email: vendor.email ?? '' },
    validate: (draft) => pickErrors(validateCompanyValues(draft, messages), ['phone', 'email']),
    toBody: (draft, initial) => ({
      ...(changed(draft, initial, 'phone') ? { phone: draft.phone.trim() || null } : {}),
      ...(changed(draft, initial, 'email') ? { email: draft.email.trim() || null } : {}),
    }),
    onSaved,
  });

  return (
    <SectionCard
      id="company-phone-email"
      title={t('companyPage.sections.phoneEmail')}
      testId="company-phone-email"
      controllerRef={controllerRef}
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <CompanyFields
            names={['phone', 'email']}
            load={{ trades: false }}
            knownTrade={vendor.trade}
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as 'phone' | 'email', toDraftText(value))}
            idPrefix={`${baseId}-`}
            testIds={{ phone: 'company-field-phone', email: 'company-field-email' }}
          />
        ),
      }}
    >
      <dl className={styles.details}>
        <DetailRow label={t('companies.form.phone')} testId="company-detail-phone">
          {vendor.phone ? (
            <a href={telHref(vendor.phone)} className={styles.inlineLink}>
              {vendor.phone}
            </a>
          ) : null}
        </DetailRow>
        <DetailRow label={t('companies.form.email')} testId="company-detail-email">
          {vendor.email ? (
            <a href={`mailto:${vendor.email}`} className={styles.inlineLink}>
              {vendor.email}
            </a>
          ) : null}
        </DetailRow>
      </dl>
    </SectionCard>
  );
}

function AddressCard({ vendor, onSaved }: CardProps) {
  const { t } = useTranslation('budget');
  const userText = useUserText();
  const baseId = useId();
  const card = useVendorCardDraft({
    vendorId: vendor.id,
    initial: { address: vendor.address ?? '' },
    validate: () => ({}),
    toBody: (draft) => ({ address: draft.address.trim() || null }),
    onSaved,
  });

  return (
    <SectionCard
      id="company-address"
      title={t('companyPage.sections.address')}
      testId="company-address"
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <CompanyFields
            names={['address']}
            load={{ trades: false }}
            knownTrade={vendor.trade}
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as 'address', toDraftText(value))}
            idPrefix={`${baseId}-`}
            testIds={{ address: 'company-field-address' }}
          />
        ),
      }}
    >
      <dl className={styles.details}>
        <DetailRow label={t('companies.form.address')} testId="company-detail-address">
          {vendor.address ? <span {...userText(styles.preLine)}>{vendor.address}</span> : null}
        </DetailRow>
      </dl>
    </SectionCard>
  );
}

function AboutCard({ vendor, onSaved }: CardProps) {
  const { t } = useTranslation('budget');
  const { t: tSettings } = useTranslation('settings');
  const userText = useUserText();
  const messages = useCompanyValueMessages();
  const baseId = useId();
  const card = useVendorCardDraft({
    vendorId: vendor.id,
    initial: {
      name: vendor.name,
      tradeId: vendor.trade?.id ?? '',
      notes: vendor.notes ?? '',
    },
    validate: (draft) =>
      pickErrors(validateCompanyValues(draft, messages), ['name', 'tradeId', 'notes']),
    toBody: (draft, initial) => ({
      ...(changed(draft, initial, 'name') ? { name: draft.name.trim() } : {}),
      ...(changed(draft, initial, 'tradeId') ? { tradeId: draft.tradeId || null } : {}),
      ...(changed(draft, initial, 'notes') ? { notes: draft.notes.trim() || null } : {}),
    }),
    onSaved,
  });

  const tradeLabel = (trade: { name: string; translationKey: string | null }) =>
    getCategoryDisplayName(tSettings, trade.name, trade.translationKey);

  return (
    <SectionCard
      id="company-about"
      title={t('companyPage.sections.about')}
      testId="company-about"
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <CompanyFields
            names={['name', 'tradeId', 'notes']}
            load={{ trades: true }}
            knownTrade={vendor.trade}
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) =>
              card.set(name as 'name' | 'tradeId' | 'notes', toDraftText(value))
            }
            idPrefix={`${baseId}-`}
            testIds={{ name: 'company-field-name', notes: 'company-field-notes' }}
          />
        ),
      }}
    >
      <dl className={styles.details}>
        <DetailRow label={t('companies.form.name')} testId="company-detail-name">
          <span {...userText()}>{vendor.name}</span>
        </DetailRow>
        <DetailRow label={t('companies.form.trade')} testId="company-detail-trade">
          {vendor.trade ? tradeLabel(vendor.trade) : null}
        </DetailRow>
        <DetailRow label={t('companies.form.notes')} testId="company-detail-notes">
          {vendor.notes ? <span {...userText(styles.preLine)}>{vendor.notes}</span> : null}
        </DetailRow>
        <DetailRow label={t('companyPage.fields.addedBy')} testId="company-detail-added-by">
          {vendor.createdBy ? <span {...userText()}>{vendor.createdBy.displayName}</span> : null}
        </DetailRow>
      </dl>
    </SectionCard>
  );
}

export default CompanyDetailCards;

import { useId, useState } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateVendorRequest, VendorDetail } from '@cornerstone/shared';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { FormError } from '../../components/FormError/FormError.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import type { SectionCardController } from '../../components/SectionCard/SectionCard.js';
import { telHref } from '../../components/CallButton/telHref.js';
import { useTrades } from '../../hooks/useTrades.js';
import { useUserText } from '../../hooks/useUserText.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { isEmailAddress } from '../../lib/emailAddress.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { updateVendor } from '../../lib/vendorsApi.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './VendorDetailPage.module.css';

const NAME_MAX = 200;
const PHONE_MAX = 50;
const EMAIL_MAX = 255;
const ADDRESS_MAX = 500;
const NOTES_MAX = 10000;

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

/** The draft, field errors and explicit Save of one detail card. */
function useCardDraft<K extends string>({
  vendorId,
  initial,
  validate,
  toBody,
  onSaved,
}: CardDraftOptions<K>) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [draft, setDraft] = useState<Readonly<Record<K, string>>>(initial);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);

  const keys = Object.keys(initial) as K[];
  const dirty = keys.some((key) => draft[key] !== initial[key]);

  const discard = () => {
    setDraft(initial);
    setErrors({});
    setBanner(null);
  };

  const save = async (): Promise<boolean> => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return false;
    try {
      await updateVendor(vendorId, toBody(draft, initial));
    } catch (err) {
      setBanner(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('companyPage.saveError'),
      );
      return false;
    }
    setBanner(null);
    // The PATCH succeeded: a failed page refresh is the page's own error state, not a failed save.
    await onSaved().catch(() => undefined);
    return true;
  };

  const set = (field: K, value: string) => setDraft((prev) => ({ ...prev, [field]: value }));

  return { draft, set, errors, banner, dirty, discard, save };
}

interface FieldShellProps {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly error: string | undefined;
  readonly children: (aria: {
    readonly invalid: true | undefined;
    readonly describedBy: string | undefined;
  }) => ReactNode;
}

/** Label, control and the field error next to it. */
function FieldShell({ id, label, required = false, error, children }: FieldShellProps) {
  const { t: tc } = useTranslation('common');
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? <span className={styles.required}> {tc('objectForm.required')}</span> : null}
      </label>
      {children({
        invalid: error ? true : undefined,
        describedBy: error ? errorId : undefined,
      })}
      <FormError variant="field" id={errorId} message={error} />
    </div>
  );
}

/** A read-mode row: label and value, or an en dash with a screen-reader "Not set". */
function DetailRow({
  label,
  testId,
  children,
}: {
  readonly label: string;
  readonly testId: string;
  readonly children: ReactNode | null;
}) {
  const { t: tc } = useTranslation('common');
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd data-testid={testId}>
        {children ?? (
          <>
            <span aria-hidden="true">–</span>
            <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
          </>
        )}
      </dd>
    </div>
  );
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

function changed(draft: Draft, initial: Draft, field: string): boolean {
  return draft[field] !== initial[field];
}

function PhoneEmailCard({
  vendor,
  onSaved,
  controllerRef,
}: CardProps & { readonly controllerRef: Ref<SectionCardController> }) {
  const { t } = useTranslation('budget');
  const baseId = useId();
  const card = useCardDraft({
    vendorId: vendor.id,
    initial: { phone: vendor.phone ?? '', email: vendor.email ?? '' },
    validate: (draft) => {
      const found: { email?: string } = {};
      const email = draft.email.trim();
      if (email && !isEmailAddress(email)) found.email = t('companies.form.emailInvalid');
      return found;
    },
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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <FieldShell id={`${baseId}-phone`} label={t('companies.form.phone')} error={undefined}>
              {() => (
                <input
                  id={`${baseId}-phone`}
                  ref={firstFieldRef as RefObject<HTMLInputElement | null>}
                  type="tel"
                  autoComplete="tel"
                  className={sharedStyles.input}
                  value={card.draft.phone}
                  maxLength={PHONE_MAX}
                  onChange={(e) => card.set('phone', e.target.value)}
                  data-testid="company-field-phone"
                />
              )}
            </FieldShell>
            <FieldShell
              id={`${baseId}-email`}
              label={t('companies.form.email')}
              error={card.errors.email}
            >
              {(aria) => (
                <input
                  id={`${baseId}-email`}
                  type="email"
                  autoComplete="email"
                  className={sharedStyles.input}
                  value={card.draft.email}
                  maxLength={EMAIL_MAX}
                  onChange={(e) => card.set('email', e.target.value)}
                  aria-invalid={aria.invalid}
                  aria-describedby={aria.describedBy}
                  data-testid="company-field-email"
                />
              )}
            </FieldShell>
          </div>
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
  const card = useCardDraft({
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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <FieldShell
              id={`${baseId}-address`}
              label={t('companies.form.address')}
              error={undefined}
            >
              {() => (
                <textarea
                  id={`${baseId}-address`}
                  ref={firstFieldRef as RefObject<HTMLTextAreaElement | null>}
                  className={sharedStyles.textarea}
                  rows={3}
                  value={card.draft.address}
                  maxLength={ADDRESS_MAX}
                  onChange={(e) => card.set('address', e.target.value)}
                  data-testid="company-field-address"
                />
              )}
            </FieldShell>
          </div>
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
  const { trades } = useTrades();
  const baseId = useId();
  const card = useCardDraft({
    vendorId: vendor.id,
    initial: {
      name: vendor.name,
      tradeId: vendor.trade?.id ?? '',
      notes: vendor.notes ?? '',
    },
    validate: (draft) => {
      const found: { name?: string } = {};
      const name = draft.name.trim();
      if (!name) found.name = t('companies.form.nameRequired');
      else if (name.length > NAME_MAX) found.name = t('companies.form.nameTooLong');
      return found;
    },
    toBody: (draft, initial) => ({
      ...(changed(draft, initial, 'name') ? { name: draft.name.trim() } : {}),
      ...(changed(draft, initial, 'tradeId') ? { tradeId: draft.tradeId || null } : {}),
      ...(changed(draft, initial, 'notes') ? { notes: draft.notes.trim() || null } : {}),
    }),
    onSaved,
  });

  const tradeLabel = (trade: { name: string; translationKey: string | null }) =>
    getCategoryDisplayName(tSettings, trade.name, trade.translationKey);
  const pickedTrade =
    trades.find((candidate) => candidate.id === card.draft.tradeId) ?? vendor.trade;

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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <FieldShell
              id={`${baseId}-name`}
              label={t('companies.form.name')}
              required
              error={card.errors.name}
            >
              {(aria) => (
                <input
                  id={`${baseId}-name`}
                  ref={firstFieldRef as RefObject<HTMLInputElement | null>}
                  className={sharedStyles.input}
                  value={card.draft.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => card.set('name', e.target.value)}
                  aria-invalid={aria.invalid}
                  aria-describedby={aria.describedBy}
                  data-testid="company-field-name"
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-trade`} label={t('companies.form.trade')} error={undefined}>
              {() => (
                <EntityPicker
                  kind="trade"
                  id={`${baseId}-trade`}
                  value={card.draft.tradeId}
                  selectedLabel={
                    card.draft.tradeId && pickedTrade ? tradeLabel(pickedTrade) : undefined
                  }
                  onChange={(next) => card.set('tradeId', next)}
                  placeholder={t('companies.form.tradePlaceholder')}
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-notes`} label={t('companies.form.notes')} error={undefined}>
              {() => (
                <textarea
                  id={`${baseId}-notes`}
                  className={sharedStyles.textarea}
                  rows={4}
                  value={card.draft.notes}
                  maxLength={NOTES_MAX}
                  onChange={(e) => card.set('notes', e.target.value)}
                  data-testid="company-field-notes"
                />
              )}
            </FieldShell>
          </div>
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

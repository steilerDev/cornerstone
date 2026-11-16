import { useId } from 'react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import type { ObjectFormValues } from '../../components/ObjectForm/types.js';
import { SectionCard, SectionCardScope } from '../../components/SectionCard/index.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { DetailRow } from '../../components/SectionCard/SectionCardFields.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import type { KnownCompany } from '../../hooks/useCompanyName.js';
import { useUserText } from '../../hooks/useUserText.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import {
  usePurchaseFormSchema,
  usePurchaseValueMessages,
  validatePurchaseValues,
} from '../../objectForms/purchaseForm.js';
import sharedStyles from '../../styles/shared.module.css';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './HouseholdItemDetailPage.module.css';

/** The schema fields the card shows, in order. */
const NAMES = ['name', 'category', 'quantity', 'vendorId', 'url', 'area', 'description'] as const;
type Name = (typeof NAMES)[number];
const TEST_IDS = {
  name: 'purchase-field-name',
  quantity: 'purchase-field-quantity',
  url: 'purchase-field-url',
  description: 'purchase-field-description',
};

interface DetailsFieldsProps {
  readonly values: ObjectFormValues;
  readonly errors: Partial<Record<Name, string>>;
  readonly onChange: (name: string, value: unknown) => void;
  readonly idPrefix: string;
  readonly knownCompany: KnownCompany | null;
}

/** Mounted in edit mode only: the purchase schema (same fields as the New purchase dialog). */
function DetailsFields({ values, errors, onChange, idPrefix, knownCompany }: DetailsFieldsProps) {
  const schema = usePurchaseFormSchema({ scope: 'edit', knownCompany });
  return (
    <ObjectFormFields
      fields={schema.fields}
      names={NAMES}
      values={values}
      errors={errors}
      onChange={onChange}
      idPrefix={idPrefix}
      testIds={TEST_IDS}
    />
  );
}

export interface PurchaseOverviewPanelProps extends PurchasePanelProps {
  /** Lets the `e` shortcut and the empty strip facts open the Details card. */
  readonly detailsCardRef: Ref<SectionCardController>;
}

/** The host of a product link that is safe to open (http or https); null for anything else. */
export function safeLinkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.host : null;
  } catch {
    return null;
  }
}

/** The Overview tab: the Details card. */
export function PurchaseOverviewPanel({
  purchase,
  refresh,
  originState,
  detailsCardRef,
}: PurchaseOverviewPanelProps) {
  return (
    <SectionCardScope>
      <div className={styles.panel}>
        <DetailsCard
          purchase={purchase}
          originState={originState}
          onSaved={refresh}
          controllerRef={detailsCardRef}
        />
      </div>
    </SectionCardScope>
  );
}

interface DetailsCardProps {
  readonly purchase: HouseholdItemPageDetail;
  readonly originState: PurchasePanelProps['originState'];
  readonly onSaved: () => Promise<void>;
  readonly controllerRef: Ref<SectionCardController>;
}

function DetailsCard({ purchase, originState, onSaved, controllerRef }: DetailsCardProps) {
  const { t } = useTranslation('householdItems');
  const { t: tSettings } = useTranslation('settings');
  const userText = useUserText();
  const baseId = useId();
  const messages = usePurchaseValueMessages();

  const categoryName = getCategoryDisplayName(
    tSettings,
    purchase.categoryEntry.name,
    purchase.categoryEntry.translationKey,
  );
  const initial = {
    name: purchase.name,
    description: purchase.description ?? '',
    category: purchase.categoryEntry.id,
    quantity: String(purchase.quantity),
    vendorId: purchase.vendor?.id ?? '',
    url: purchase.url ?? '',
    area: purchase.area?.id ?? '',
  };
  const card = useCardDraft({
    initial,
    validate: (draft) => pickErrors(validatePurchaseValues(draft, messages), NAMES),
    save: (draft) =>
      updateHouseholdItem(purchase.id, {
        ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
        ...(draft.description !== initial.description
          ? { description: draft.description.trim() || null }
          : {}),
        ...(draft.category !== initial.category ? { category: draft.category } : {}),
        ...(draft.quantity !== initial.quantity ? { quantity: Number(draft.quantity) } : {}),
        ...(draft.vendorId !== initial.vendorId ? { vendorId: draft.vendorId || null } : {}),
        ...(draft.url !== initial.url ? { url: draft.url.trim() || null } : {}),
        ...(draft.area !== initial.area ? { areaId: draft.area || null } : {}),
      }),
    saveError: t('purchasePage.overview.saveError'),
    onSaved,
  });

  const link = purchase.url || null;
  const linkHost = link === null ? null : safeLinkHost(link);
  const nothingAdded =
    !purchase.description &&
    purchase.vendor === null &&
    !purchase.url &&
    purchase.area === null &&
    purchase.quantity === 1;

  return (
    <SectionCard
      id="purchase-details"
      title={t('purchasePage.overview.details')}
      testId="section-purchase-details"
      controllerRef={controllerRef}
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <DetailsFields
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as Name, toDraftText(value))}
            idPrefix={`${baseId}-`}
            knownCompany={purchase.vendor}
          />
        ),
      }}
    >
      {nothingAdded ? (
        <p className={styles.muted} data-testid="purchase-detail-empty">
          {t('purchasePage.overview.nothingYet')}
        </p>
      ) : null}
      <dl className={styles.details}>
        {purchase.description ? (
          <DetailRow
            label={t('create.form.description.label')}
            testId="purchase-detail-description"
          >
            <span className={styles.userTextBlock}>
              <span {...userText()}>{purchase.description}</span>
            </span>
          </DetailRow>
        ) : null}
        <DetailRow label={t('create.form.category.label')} testId="purchase-detail-category">
          {categoryName}
        </DetailRow>
        {purchase.quantity > 1 ? (
          <DetailRow label={t('create.form.quantity.label')} testId="purchase-detail-quantity">
            {purchase.quantity}
          </DetailRow>
        ) : null}
        {purchase.vendor ? (
          <DetailRow label={t('create.form.vendor.label')} testId="purchase-detail-company">
            <NavAnchor
              to={routeUrl('company', { id: purchase.vendor.id })}
              state={originState}
              className={styles.link}
            >
              <span {...userText()}>{purchase.vendor.name}</span>
            </NavAnchor>
          </DetailRow>
        ) : null}
        {link ? (
          <DetailRow label={t('create.form.url.label')} testId="purchase-detail-link">
            {linkHost ? (
              <a href={link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {linkHost}
                <span className={sharedStyles.srOnly}>
                  {' '}
                  {t('purchasePage.overview.opensInNewTab')}
                </span>
              </a>
            ) : (
              <span {...userText()}>{link}</span>
            )}
          </DetailRow>
        ) : null}
        {purchase.area ? (
          <DetailRow label={t('create.form.area.label')} testId="purchase-detail-area">
            <AreaBreadcrumb area={purchase.area} />
          </DetailRow>
        ) : null}
      </dl>
    </SectionCard>
  );
}

export default PurchaseOverviewPanel;

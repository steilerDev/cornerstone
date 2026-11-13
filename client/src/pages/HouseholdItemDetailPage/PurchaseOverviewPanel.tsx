import { useId } from 'react';
import type { Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { HouseholdItemPageDetail } from '@cornerstone/shared';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/AreaBreadcrumb.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { SectionCard, SectionCardScope } from '../../components/SectionCard/index.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { DetailRow, FieldShell } from '../../components/SectionCard/SectionCardFields.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useUserText } from '../../hooks/useUserText.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import { updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import sharedStyles from '../../styles/shared.module.css';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './HouseholdItemDetailPage.module.css';

const NAME_MAX = 500;
const DESCRIPTION_MAX = 5000;
const URL_MAX = 2000;

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
  const { t: tc } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const userText = useUserText();
  const { areas } = useAreas();
  const baseId = useId();

  const categoryName = getCategoryDisplayName(
    tSettings,
    purchase.categoryEntry.name,
    purchase.categoryEntry.translationKey,
  );
  const initial = {
    name: purchase.name,
    description: purchase.description ?? '',
    categoryId: purchase.categoryEntry.id,
    quantity: String(purchase.quantity),
    vendorId: purchase.vendor?.id ?? '',
    url: purchase.url ?? '',
    areaId: purchase.area?.id ?? '',
  };
  const card = useCardDraft({
    initial,
    validate: (draft) => {
      const errors: Partial<Record<keyof typeof initial, string>> = {};
      if (!draft.name.trim()) errors.name = t('create.form.name.error');
      if (!draft.categoryId) errors.categoryId = t('create.form.category.error');
      const quantity = Number(draft.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        errors.quantity = t('create.form.quantity.error');
      }
      return errors;
    },
    save: (draft) =>
      updateHouseholdItem(purchase.id, {
        ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
        ...(draft.description !== initial.description
          ? { description: draft.description.trim() || null }
          : {}),
        ...(draft.categoryId !== initial.categoryId ? { category: draft.categoryId } : {}),
        ...(draft.quantity !== initial.quantity ? { quantity: Number(draft.quantity) } : {}),
        ...(draft.vendorId !== initial.vendorId ? { vendorId: draft.vendorId || null } : {}),
        ...(draft.url !== initial.url ? { url: draft.url.trim() || null } : {}),
        ...(draft.areaId !== initial.areaId ? { areaId: draft.areaId || null } : {}),
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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <FieldShell
              id={`${baseId}-name`}
              label={t('create.form.name.label')}
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
                  data-testid="purchase-field-name"
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-description`} label={t('create.form.description.label')}>
              {() => (
                <textarea
                  id={`${baseId}-description`}
                  className={sharedStyles.textarea}
                  rows={4}
                  value={card.draft.description}
                  maxLength={DESCRIPTION_MAX}
                  onChange={(e) => card.set('description', e.target.value)}
                  data-testid="purchase-field-description"
                />
              )}
            </FieldShell>
            <FieldShell
              id={`${baseId}-category`}
              label={t('create.form.category.label')}
              required
              error={card.errors.categoryId}
            >
              {(aria) => (
                <EntityPicker
                  kind="category"
                  id={`${baseId}-category`}
                  value={card.draft.categoryId}
                  selectedLabel={categoryName}
                  onChange={(next) => card.set('categoryId', next)}
                  placeholder={t('create.form.category.placeholder')}
                  inputAriaProps={{
                    'aria-required': true,
                    'aria-invalid': aria.invalid,
                    'aria-describedby': aria.describedBy,
                  }}
                />
              )}
            </FieldShell>
            <FieldShell
              id={`${baseId}-quantity`}
              label={t('create.form.quantity.label')}
              required
              error={card.errors.quantity}
            >
              {(aria) => (
                <input
                  id={`${baseId}-quantity`}
                  type="number"
                  min={1}
                  step={1}
                  className={sharedStyles.input}
                  value={card.draft.quantity}
                  onChange={(e) => card.set('quantity', e.target.value)}
                  aria-invalid={aria.invalid}
                  aria-describedby={aria.describedBy}
                  data-testid="purchase-field-quantity"
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-company`} label={t('create.form.vendor.label')}>
              {() => (
                <EntityPicker
                  kind="company"
                  id={`${baseId}-company`}
                  value={card.draft.vendorId}
                  knownCompany={purchase.vendor}
                  noneLabel={t('create.form.vendor.placeholder')}
                  onChange={(next) => card.set('vendorId', next)}
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-url`} label={t('create.form.url.label')}>
              {() => (
                <input
                  id={`${baseId}-url`}
                  type="url"
                  className={sharedStyles.input}
                  value={card.draft.url}
                  maxLength={URL_MAX}
                  placeholder={t('create.form.url.placeholder')}
                  onChange={(e) => card.set('url', e.target.value)}
                  data-testid="purchase-field-url"
                />
              )}
            </FieldShell>
            <FieldShell id={`${baseId}-area`} label={t('create.form.area.label')}>
              {() => (
                <EntityPicker
                  kind="area"
                  id={`${baseId}-area`}
                  areas={areas}
                  noneLabel={tc('aria.noArea')}
                  value={card.draft.areaId}
                  onChange={(next) => card.set('areaId', next)}
                />
              )}
            </FieldShell>
          </div>
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

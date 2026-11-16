import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { HouseholdItemSummary, UpdateHouseholdItemRequest } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { ObjectFormFields } from '../../components/ObjectForm/ObjectFormFields.js';
import { pickErrors, toDraftText } from '../../components/ObjectForm/objectFormState.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { DetailRow } from '../../components/SectionCard/SectionCardFields.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { purchaseLateDays } from '../../lib/scheduleDates.js';
import {
  usePurchaseFormSchema,
  usePurchaseValueMessages,
  validatePurchaseValues,
} from '../../objectForms/purchaseForm.js';
import { purchaseLateExplanation } from './purchaseDates.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './PurchaseTimingPanel.module.css';

type PurchaseDeliveryCardProps = Pick<PurchasePanelProps, 'purchase' | 'refresh'>;

/** The schema fields the card shows, in order. */
const NAMES = [
  'orderDate',
  'earliestDeliveryDate',
  'latestDeliveryDate',
  'actualDeliveryDate',
] as const;
type DeliveryKey = (typeof NAMES)[number];
const TEST_IDS = {
  orderDate: 'purchase-ordered-input',
  earliestDeliveryDate: 'purchase-earliest-input',
  latestDeliveryDate: 'purchase-latest-input',
  actualDeliveryDate: 'purchase-delivered-input',
};

/** Mounted in edit mode only: the purchase schema (same fields as the New purchase dialog). */
function DeliveryFields(props: Omit<Parameters<typeof ObjectFormFields>[0], 'fields' | 'names'>) {
  const schema = usePurchaseFormSchema({ scope: 'edit' });
  return <ObjectFormFields fields={schema.fields} names={NAMES} {...props} />;
}

function seedOf(purchase: HouseholdItemSummary): Record<DeliveryKey, string> {
  return {
    orderDate: purchase.orderDate ?? '',
    earliestDeliveryDate: purchase.earliestDeliveryDate ?? '',
    latestDeliveryDate: purchase.latestDeliveryDate ?? '',
    actualDeliveryDate: purchase.actualDeliveryDate ?? '',
  };
}

/**
 * The Delivery card of the Timing tab: the order and delivery dates, the computed target, and
 * (when the purchase is late) why (decisions D3, D11).
 */
export function PurchaseDeliveryCard({ purchase, refresh }: PurchaseDeliveryCardProps) {
  const { t } = useTranslation('householdItems');
  const { formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const baseId = useId();
  const messages = usePurchaseValueMessages();
  const today = todayLocalIsoDate();

  const initial = seedOf(purchase);
  const card = useCardDraft<DeliveryKey>({
    initial,
    validate: (draft) => pickErrors(validatePurchaseValues(draft, messages), NAMES),
    save: (draft) => {
      const body: UpdateHouseholdItemRequest = {};
      if (draft.orderDate !== initial.orderDate) body.orderDate = draft.orderDate || null;
      if (draft.earliestDeliveryDate !== initial.earliestDeliveryDate) {
        body.earliestDeliveryDate = draft.earliestDeliveryDate || null;
      }
      if (draft.latestDeliveryDate !== initial.latestDeliveryDate) {
        body.latestDeliveryDate = draft.latestDeliveryDate || null;
      }
      if (draft.actualDeliveryDate !== initial.actualDeliveryDate) {
        body.actualDeliveryDate = draft.actualDeliveryDate || null;
      }
      return updateHouseholdItem(purchase.id, body);
    },
    saveError: t('purchasePage.timing.saveError'),
    onSaved: refresh,
  });

  const showDate = (date: string | null) => (date === null ? null : formatDate(date));
  const explanation = purchaseLateExplanation(purchase, today);
  const lateBadge = scheduleSignalBadgeProps(
    { signal: 'late', days: purchaseLateDays(purchase, today) },
    statusVariants.scheduleSignal,
  );

  const explanationText =
    explanation === null
      ? null
      : explanation.kind === 'latest'
        ? t('purchasePage.timing.lateLatest', { date: formatDate(explanation.date) })
        : explanation.kind === 'target'
          ? t('purchasePage.timing.lateTarget', { date: formatDate(explanation.date) })
          : t('purchasePage.timing.lateGeneric');

  return (
    <SectionCard
      id="purchase-delivery"
      title={t('purchasePage.timing.delivery')}
      testId="section-purchase-delivery"
      edit={{
        dirty: card.dirty,
        onStart: card.discard,
        onSave: card.save,
        onDiscard: card.discard,
        error: card.banner,
        renderFields: () => (
          <DeliveryFields
            values={card.draft}
            errors={card.errors}
            onChange={(name, value) => card.set(name as DeliveryKey, toDraftText(value))}
            idPrefix={`${baseId}-`}
            testIds={TEST_IDS}
          />
        ),
      }}
    >
      <dl className={styles.facts}>
        <DetailRow label={t('create.form.orderDate.label')} testId="purchase-delivery-ordered">
          {showDate(purchase.orderDate)}
        </DetailRow>
        <DetailRow
          label={t('create.form.earliestDelivery.label')}
          testId="purchase-delivery-earliest"
        >
          {showDate(purchase.earliestDeliveryDate)}
        </DetailRow>
        <DetailRow label={t('create.form.latestDelivery.label')} testId="purchase-delivery-latest">
          {showDate(purchase.latestDeliveryDate)}
        </DetailRow>
        <DetailRow
          label={t('purchasePage.timing.targetDelivery')}
          testId="purchase-delivery-target"
        >
          {showDate(purchase.targetDeliveryDate)}
        </DetailRow>
        <DetailRow
          label={t('create.form.actualDelivery.label')}
          testId="purchase-delivery-delivered"
        >
          {showDate(purchase.actualDeliveryDate)}
        </DetailRow>
      </dl>
      {explanationText !== null && (
        <p className={styles.lateReason} data-testid="purchase-late-reason">
          <Badge variants={lateBadge.variants} value={lateBadge.value} />
          <span className={styles.lateText}>{explanationText}</span>
        </p>
      )}
    </SectionCard>
  );
}

export default PurchaseDeliveryCard;

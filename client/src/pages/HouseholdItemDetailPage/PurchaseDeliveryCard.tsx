import { useId } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { HouseholdItemSummary, UpdateHouseholdItemRequest } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { DetailRow, FieldShell } from '../../components/SectionCard/SectionCardFields.js';
import { useCardDraft } from '../../components/SectionCard/useCardDraft.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { updateHouseholdItem } from '../../lib/householdItemsApi.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { purchaseLateDays } from '../../lib/scheduleDates.js';
import { purchaseLateExplanation } from './purchaseDates.js';
import type { PurchasePanelProps } from './purchasePageTypes.js';
import styles from './PurchaseTimingPanel.module.css';

type PurchaseDeliveryCardProps = Pick<PurchasePanelProps, 'purchase' | 'refresh'>;

interface DateFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly testId: string;
}

function DateField({ id, label, value, onChange, error, inputRef, testId }: DateFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error}>
      {({ invalid, describedBy }) => (
        <input
          ref={inputRef}
          id={id}
          type="date"
          className={styles.input}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-testid={testId}
        />
      )}
    </FieldShell>
  );
}

type DeliveryKey = 'ordered' | 'earliest' | 'latest' | 'delivered';

function seedOf(purchase: HouseholdItemSummary): Record<DeliveryKey, string> {
  return {
    ordered: purchase.orderDate ?? '',
    earliest: purchase.earliestDeliveryDate ?? '',
    latest: purchase.latestDeliveryDate ?? '',
    delivered: purchase.actualDeliveryDate ?? '',
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
  const today = todayLocalIsoDate();

  const initial = seedOf(purchase);
  const card = useCardDraft<DeliveryKey>({
    initial,
    validate: (draft) => {
      const errors: Partial<Record<DeliveryKey, string>> = {};
      if (draft.earliest !== '' && draft.latest !== '' && draft.latest < draft.earliest) {
        errors.latest = t('create.form.deliveryWindow.error');
      }
      if (draft.ordered !== '' && draft.delivered !== '' && draft.delivered < draft.ordered) {
        errors.delivered = t('create.form.deliveryDates.error');
      }
      return errors;
    },
    save: (draft) => {
      const body: UpdateHouseholdItemRequest = {};
      if (draft.ordered !== initial.ordered) body.orderDate = draft.ordered || null;
      if (draft.earliest !== initial.earliest) body.earliestDeliveryDate = draft.earliest || null;
      if (draft.latest !== initial.latest) body.latestDeliveryDate = draft.latest || null;
      if (draft.delivered !== initial.delivered) body.actualDeliveryDate = draft.delivered || null;
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
        renderFields: ({ firstFieldRef }) => (
          <div className={styles.fields}>
            <DateField
              id={`${baseId}-ordered`}
              label={t('create.form.orderDate.label')}
              value={card.draft.ordered}
              onChange={(value) => card.set('ordered', value)}
              inputRef={firstFieldRef as RefObject<HTMLInputElement | null>}
              testId="purchase-ordered-input"
            />
            <DateField
              id={`${baseId}-earliest`}
              label={t('create.form.earliestDelivery.label')}
              value={card.draft.earliest}
              onChange={(value) => card.set('earliest', value)}
              testId="purchase-earliest-input"
            />
            <DateField
              id={`${baseId}-latest`}
              label={t('create.form.latestDelivery.label')}
              value={card.draft.latest}
              onChange={(value) => card.set('latest', value)}
              error={card.errors.latest}
              testId="purchase-latest-input"
            />
            <DateField
              id={`${baseId}-delivered`}
              label={t('create.form.actualDelivery.label')}
              value={card.draft.delivered}
              onChange={(value) => card.set('delivered', value)}
              error={card.errors.delivered}
              testId="purchase-delivered-input"
            />
          </div>
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

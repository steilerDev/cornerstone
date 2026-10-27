import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetSource } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import { InvoiceDepositFormModal } from './InvoiceDepositFormModal.js';
import styles from './InvoiceConvertPage.module.css';
import type { UseConvertOffer } from './useConvertOffer.js';

export interface ConvertPaymentsCardProps {
  readonly invoiceId: string;
  readonly convert: UseConvertOffer;
  readonly budgetSources: readonly BudgetSource[];
  /** Id of the Refund due block, for the Convert button's `aria-describedby`. */
  readonly refundDueId: string;
}

type PendingFocus = 'addRefund' | 'afterSave';

/**
 * What the progress payments mean for the final amount: the payments stay as they are, and a
 * refund due is proposed, never required. "Add refund" records it in one step.
 */
export function ConvertPaymentsCard({
  invoiceId,
  convert,
  budgetSources,
  refundDueId,
}: ConvertPaymentsCardProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const [refundOpen, setRefundOpen] = useState(false);
  const addRefundRef = useRef<HTMLButtonElement>(null);
  const recordedRef = useRef<HTMLParagraphElement>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const { shortfall, refundPreset, recordedRefund, depositTotals } = convert;

  // Back from the refund modal: Add refund while a refund is still due, else the confirmation.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (refundOpen || pending === null) return;
    pendingFocusRef.current = null;
    const target = pending === 'afterSave' && shortfall === 0 ? recordedRef : addRefundRef;
    target.current!.focus();
  }, [refundOpen, shortfall]);

  const closeRefund = () => {
    pendingFocusRef.current = 'addRefund';
    setRefundOpen(false);
  };

  const refundSaved = async (deposit: Parameters<UseConvertOffer['onRefundSaved']>[0]) => {
    await convert.onRefundSaved(deposit);
    pendingFocusRef.current = 'afterSave';
    setRefundOpen(false);
  };

  const sourceName =
    budgetSources.find((source) => source.id === refundPreset.budgetSourceId)?.name ??
    t('convertPage.refund.noSource');

  return (
    <SectionCard
      id="convert-payments"
      title={t('convertPage.payments.title')}
      testId="convert-payments"
    >
      <div className={styles.stack}>
        <dl className={styles.summary}>
          <dt>{t('convertPage.payments.progressPayments')}</dt>
          <dd data-testid="convert-progress-payments">
            {formatCurrency(depositTotals.netDeposits)}
          </dd>
          <dt>{t('convertPage.payments.finalAmount')}</dt>
          <dd>{formatCurrency(convert.finalAmount ?? 0)}</dd>
          <dt className={styles.summaryStrong}>{t('convertPage.payments.finalPayment')}</dt>
          <dd data-testid="convert-final-payment">{formatCurrency(convert.finalPayment)}</dd>
        </dl>
        <p className={styles.hint}>{t('convertPage.payments.unchanged')}</p>

        {shortfall > 0 && (
          <div className={styles.refundDue} id={refundDueId} data-testid="convert-refund-due">
            <h3 className={styles.refundHeading}>
              {t('convertPage.refund.heading', { amount: formatCurrency(shortfall) })}
            </h3>
            <p className={styles.refundMessage}>
              {t('convertPage.refund.message', { amount: formatCurrency(shortfall) })}
            </p>
            <dl className={styles.refundFacts}>
              <dt>{t('convertPage.refund.amount')}</dt>
              <dd>
                {formatCurrency(-shortfall)}{' '}
                <Badge variants={statusVariants.refund} value="refund" />
              </dd>
              <dt>{t('convertPage.refund.dueDate')}</dt>
              <dd>{formatDate(refundPreset.dueDate)}</dd>
              <dt>{t('convertPage.refund.source')}</dt>
              <dd>{sourceName}</dd>
            </dl>
            <button
              type="button"
              ref={addRefundRef}
              className={styles.secondaryButton}
              onClick={() => setRefundOpen(true)}
              disabled={convert.isSaving}
              data-testid="convert-add-refund"
            >
              {t('convertPage.refund.add')}
            </button>
          </div>
        )}

        <div role="status">
          {recordedRefund !== null && shortfall === 0 && (
            <p
              ref={recordedRef}
              tabIndex={-1}
              className={styles.recorded}
              data-testid="convert-refund-recorded"
            >
              {t('convertPage.refund.recorded', { amount: formatCurrency(recordedRefund) })}
            </p>
          )}
        </div>
      </div>

      {refundOpen && (
        <InvoiceDepositFormModal
          invoiceId={invoiceId}
          mode="add"
          lockEntryType
          initialValues={refundPreset}
          budgetSources={budgetSources}
          onSaved={(deposit) => void refundSaved(deposit)}
          onClose={closeRefund}
        />
      )}
    </SectionCard>
  );
}

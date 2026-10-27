import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceDeposit, InvoiceDetail } from '@cornerstone/shared';
import { RelatedList } from '../../components/RelatedList/index.js';
import type { RelatedListRow } from '../../components/RelatedList/index.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { progressPaymentTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { useFormatters } from '../../lib/formatters.js';
import { deleteDeposit } from '../../lib/invoiceDepositsApi.js';
import { changeDepositStatus, depositStatusBody } from '../../lib/statusChangeApi.js';
import type { OriginState } from '../../navigation/origin.js';
import { buildPaymentRows } from './invoicePaymentRows.js';
import type { PaymentDialogs } from './usePaymentDialogs.js';
import styles from './InvoiceDetailPage.module.css';

export interface InvoicePaymentsPanelProps {
  readonly invoice: InvoiceDetail;
  readonly payments: Pick<PaymentDialogs, 'openAdd' | 'openEdit'>;
  /** Refreshes the page record after a change. */
  readonly onChanged: () => Promise<unknown>;
  readonly headingRef: RefObject<HTMLElement | null>;
  readonly originState: OriginState;
}

/** The Payments tab: Progress payments (with the final payment) and Refunds. */
export function InvoicePaymentsPanel({
  invoice,
  payments,
  onChanged,
  headingRef,
  originState,
}: InvoicePaymentsPanelProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { formatCurrency, formatDate } = useFormatters();
  const variants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();

  const renderStatus = (deposit: InvoiceDeposit, title: string) => (
    <StatusMenu
      transitions={progressPaymentTransitions(tc, deposit)}
      badge={{ variants: variants.progressPayment, value: deposit.status }}
      currentLabel={variants.progressPayment[deposit.status].label}
      focusFallbackRef={headingRef}
      testId={`payment-status-${deposit.id}`}
      onApply={(to, date) =>
        runStatusChange({
          request: () =>
            changeDepositStatus(
              invoice.id,
              deposit.id,
              depositStatusBody(deposit.status, to, date),
            ),
          recordName: title,
          statusLabel: variants.progressPayment[to].label,
          dedupeKey: `deposit:${deposit.id}`,
          onChanged: () => void onChanged(),
          onUndone: async () => {
            await onChanged();
          },
        })
      }
    />
  );

  const rows = buildPaymentRows({ invoice, t, formatCurrency, formatDate, variants, renderStatus });
  const depositById = (id: string) => invoice.deposits.find((deposit) => deposit.id === id)!;

  const onEdit = (row: RelatedListRow, opener: HTMLButtonElement) => {
    payments.openEdit(depositById(row.id), row.title, opener);
  };
  const onRemove = async (row: RelatedListRow) => {
    const result = await deleteDeposit(invoice.id, row.id);
    await onChanged();
    return result.undo;
  };

  const shared = {
    headingLevel: 2 as const,
    onEdit,
    onRemove,
    onRestored: async () => {
      await onChanged();
    },
    linkState: originState,
  };

  return (
    <div className={styles.paymentLists}>
      <RelatedList
        {...shared}
        title={t('invoicePage.payments.progressTitle')}
        testId="invoice-progress-payments"
        rows={rows.progress}
        count={rows.progressCount}
        action={{
          kind: 'button',
          label: t('invoicePage.actions.addProgressPayment'),
          onActivate: (opener) => payments.openAdd('deposit', opener),
        }}
        emptyMessage={t('invoicePage.payments.progressEmpty')}
      />
      <RelatedList
        {...shared}
        title={t('invoicePage.payments.refundsTitle')}
        testId="invoice-refunds"
        rows={rows.refunds}
        action={{
          kind: 'button',
          label: t('invoicePage.actions.addRefund'),
          onActivate: (opener) => payments.openAdd('refund', opener),
        }}
        emptyMessage={t('invoicePage.payments.refundsEmpty')}
      />
    </div>
  );
}

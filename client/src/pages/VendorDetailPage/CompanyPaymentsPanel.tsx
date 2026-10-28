import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { InvoiceListRow, VendorDetail } from '@cornerstone/shared';
import { Badge } from '../../components/Badge/Badge.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { RelatedList } from '../../components/RelatedList/RelatedList.js';
import type { RelatedListAction, RelatedListRow } from '../../components/RelatedList/types.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUserText } from '../../hooks/useUserText.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchFailureMessage } from '../../lib/fetchFailure.js';
import { useFormatters } from '../../lib/formatters.js';
import { deleteInvoice } from '../../lib/invoicesApi.js';
import type { OriginState } from '../../navigation/origin.js';
import { useOpenInvoiceForm } from '../../objectForms/useOpenInvoiceForm.js';
import type { InvoiceFormKind } from '../../objectForms/invoiceCreateContext.js';
import { countSubmitted, groupCompanyPayments } from './companyPayments.js';
import type { UseCompanyPaymentsResult } from './useCompanyPayments.js';
import styles from './VendorDetailPage.module.css';

export interface CompanyPaymentsPanelProps {
  readonly vendor: VendorDetail;
  readonly payments: UseCompanyPaymentsResult;
  readonly originState: OriginState;
  /** After a delete: the page refresh (the rows reload with the new revision). */
  readonly onChanged: () => Promise<unknown>;
  /** Last-resort focus target after a delete. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}

/** The Payments tab: Paid and Still to pay, then the company's invoices, offers and progress payments. */
export function CompanyPaymentsPanel({
  vendor,
  payments,
  originState,
  onChanged,
  headingRef,
}: CompanyPaymentsPanelProps) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { formatCurrency, formatDate } = useFormatters();
  const statusVariants = useStatusBadgeVariants();
  const userText = useUserText();
  const openForm = useOpenInvoiceForm();
  const [deleting, setDeleting] = useState<InvoiceListRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const impact = useDeleteImpact('invoice', deleting?.id ?? null);

  const { rows, failure } = payments;
  const loadError =
    rows === null && failure !== null
      ? fetchFailureMessage(failure, tErrors, t('companyPage.payments.loadError'))
      : null;
  const groups = rows === null ? null : groupCompanyPayments(rows);
  const wholeEmpty =
    groups !== null &&
    groups.invoices.length === 0 &&
    groups.offers.length === 0 &&
    groups.progressPayments.length === 0;
  const submitted = groups === null ? 0 : countSubmitted(groups.invoices);

  const noNumber = t('invoices.list.noNumber');

  const startNew = openForm
    ? (kind: InvoiceFormKind, opener: HTMLElement) =>
        openForm({
          kind,
          company: { id: vendor.id, name: vendor.name },
          originState,
          returnFocusRef: { current: opener },
        })
    : null;

  const addAction = (kind: InvoiceFormKind): RelatedListAction | undefined =>
    startNew
      ? {
          kind: 'button',
          label:
            kind === 'invoice'
              ? t('companyPage.payments.newInvoice')
              : t('companyPage.payments.newOffer'),
          onActivate: (opener) => startNew(kind, opener),
        }
      : undefined;

  const openDelete = (row: InvoiceListRow) => {
    const list = row.status === 'quotation' ? 'company-offers' : 'company-invoices';
    returnFocusRef.current = document.querySelector<HTMLElement>(
      `[data-testid="${list}-actions-${row.id}"]`,
    );
    setDeleteError('');
    setDeleteBlocked(false);
    setDeleting(row);
  };

  const closeDelete = () => {
    setDeleting(null);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const confirmDelete = async () => {
    const row = deleting!;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteInvoice(vendor.id, row.id);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('companyPage.payments.deleteError'));
      }
      setIsDeleting(false);
      return;
    }
    // The row is gone: focus its list's New button (it stays while that list has other rows),
    // or the page heading when this was the list's last row.
    const quotation = row.status === 'quotation';
    const group = quotation ? groups!.offers : groups!.invoices;
    const addButton = document.querySelector<HTMLElement>(
      `[data-testid="${quotation ? 'company-offers' : 'company-invoices'}-add"]`,
    );
    returnFocusRef.current =
      group.length === 1 ? headingRef.current : (addButton ?? headingRef.current);
    setDeleting(null);
    setIsDeleting(false);
    await onChanged();
  };

  const recordRow = (row: InvoiceListRow): RelatedListRow => {
    const isOffer = row.status === 'quotation';
    const facts: string[] = [];
    if (!isOffer && row.dueDate) {
      facts.push(t('companyPage.payments.due', { date: formatDate(row.dueDate) }));
    }
    facts.push(t('companyPage.payments.paidAmount', { amount: formatCurrency(row.paid) }));
    if (isOffer) {
      facts.push(
        t('companyPage.payments.remainingOnOffer', {
          amount: formatCurrency(row.remainingOnOffer!),
        }),
      );
    } else if (row.status !== 'claimed') {
      facts.push(
        t('companyPage.payments.stillToPayAmount', { amount: formatCurrency(row.openAmount) }),
      );
    }
    return {
      id: row.id,
      title: row.invoiceNumber ?? noNumber,
      to: routeUrl('invoice', { id: row.id }),
      badges: isOffer ? undefined : <Badge variants={statusVariants.invoice} value={row.status} />,
      facts: facts.join(' · '),
      amount: formatCurrency(row.amount),
      menuItems: [
        {
          id: 'delete',
          label: tc('button.delete'),
          variant: 'destructive',
          testId: `company-invoice-delete-${row.id}`,
          onClick: () => openDelete(row),
        },
      ],
      removable: false,
    };
  };

  if (wholeEmpty) {
    return (
      <EmptyState
        message={t('companyPage.payments.allEmpty')}
        action={
          startNew
            ? {
                label: t('companyPage.payments.newInvoice'),
                onClick: () => startNew('invoice', document.activeElement as HTMLElement),
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className={styles.payments}>
      <p className={styles.totals} data-testid="company-payments-totals">
        {t('companyPage.payments.paid')}{' '}
        <span data-figure="paid" data-testid="company-paid-figure">
          {formatCurrency(vendor.paid)}
        </span>
        {' · '}
        {t('companyPage.payments.stillToPay')}{' '}
        <span data-figure="still-to-pay" data-testid="company-still-to-pay-figure">
          {formatCurrency(vendor.stillToPay)}
        </span>
      </p>
      {submitted > 0 ? (
        <p className={styles.submittedNote} data-testid="company-submitted-note">
          {t('companyPage.payments.submittedNote', { count: submitted })}
        </p>
      ) : null}
      <RelatedList
        title={t('companyPage.payments.invoices')}
        headingLevel={2}
        testId="company-invoices"
        rows={groups === null ? null : groups.invoices.map(recordRow)}
        loadError={loadError}
        onRetry={payments.retry}
        emptyMessage={t('companyPage.payments.invoicesEmpty')}
        action={addAction('invoice')}
        linkState={originState}
      />
      <RelatedList
        title={t('companyPage.payments.offers')}
        headingLevel={2}
        testId="company-offers"
        rows={groups === null ? null : groups.offers.map(recordRow)}
        loadError={loadError}
        onRetry={payments.retry}
        emptyMessage={t('companyPage.payments.offersEmpty')}
        action={addAction('offer')}
        linkState={originState}
      />
      {groups !== null && groups.progressPayments.length > 0 ? (
        <RelatedList
          title={t('companyPage.payments.progressPayments')}
          headingLevel={2}
          testId="company-progress-payments"
          rows={groups.progressPayments.map(({ deposit, parent }): RelatedListRow => {
            const refund = deposit.entryType === 'refund';
            return {
              id: deposit.id,
              title: t('companyPage.payments.progressPaymentTitle', {
                date: formatDate(deposit.paidDate ?? deposit.dueDate),
              }),
              to: routeUrl('invoice', { id: parent.id }, { payment: deposit.id }),
              badges: (
                <>
                  <Badge variants={statusVariants.progressPayment} value={deposit.status} />
                  {refund ? <Badge variants={statusVariants.refund} value="refund" /> : null}
                </>
              ),
              facts: parent.invoiceNumber ? (
                <span {...userText()}>{parent.invoiceNumber}</span>
              ) : (
                noNumber
              ),
              amount: formatCurrency(refund ? -deposit.amount : deposit.amount),
            };
          })}
          emptyMessage=""
          linkState={originState}
        />
      ) : null}
      {deleting && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', {
            name:
              deleting.invoiceNumber ??
              (deleting.status === 'quotation'
                ? t('companyPage.payments.deleteNameOffer')
                : t('companyPage.payments.deleteNameInvoice')),
          })}
          consequences={impact}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void confirmDelete()}
          onCancel={closeDelete}
          returnFocusRef={returnFocusRef}
          testIdPrefix="company-invoice-delete"
        />
      )}
    </div>
  );
}

export default CompanyPaymentsPanel;

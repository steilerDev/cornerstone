import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type { InvoiceDetail, InvoiceStatus } from '@cornerstone/shared';
import { CostLinesSection } from '../../components/CostLineTable/index.js';
import { useInvoiceCostLines } from '../../components/CostLineTable/useInvoiceCostLines.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { useDocumentsPanel } from '../../components/DocumentsPanel/index.js';
import { InvoicePaperlessPickerModal } from '../../components/invoices/InvoicePaperlessPickerModal.js';
import { ObjectHeader } from '../../components/ObjectHeader/index.js';
import type { ObjectHeaderPrimary } from '../../components/ObjectHeader/index.js';
import { ObjectTabs } from '../../components/ObjectTabs/ObjectTabs.js';
import { useObjectTabs } from '../../components/ObjectTabs/useObjectTabs.js';
import { PageLayout } from '../../components/PageLayout/PageLayout.js';
import { Skeleton } from '../../components/Skeleton/Skeleton.js';
import { SummaryStrip } from '../../components/SummaryStrip/SummaryStrip.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { invoiceTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useInvoiceDisplayTitle } from '../../hooks/useInvoiceDisplayTitle.js';
import { useQueryTargetHighlight } from '../../hooks/useQueryTargetHighlight.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { deleteInvoice, fetchInvoiceById } from '../../lib/invoicesApi.js';
import { changeInvoiceStatus, invoiceStatusBody } from '../../lib/statusChangeApi.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { TITLE_SEPARATOR } from '../../navigation/pageIdentity.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { useUserText } from '../../hooks/useUserText.js';
import sharedStyles from '../../styles/shared.module.css';
import { ConvertQuotationModal } from './ConvertQuotationModal.js';
import { InvoiceDepositFormModal } from './InvoiceDepositFormModal.js';
import { InvoiceEditModal } from './InvoiceEditModal.js';
import { InvoiceHistoryPanel } from './InvoiceHistoryPanel.js';
import { InvoicePaymentsPanel } from './InvoicePaymentsPanel.js';
import { INVOICE_HEADER_ACTIONS } from './invoiceHeaderActions.js';
import { invoiceSources } from './invoiceSources.js';
import { useConvertQuotation } from './useConvertQuotation.js';
import { useInvoiceRecord } from './useInvoiceRecord.js';
import type { UseInvoiceRecordResult } from './useInvoiceRecord.js';
import { useInvoiceSummaryFacts } from './useInvoiceSummaryFacts.js';
import { usePaymentDialogs } from './usePaymentDialogs.js';
import styles from './InvoiceDetailPage.module.css';

/** Reads the route id once; the view below always has an invoice id. */
export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('invoices')} replace />;
  return <InvoiceDetailView id={id} />;
}

function InvoiceDetailView({ id }: { id: string }) {
  const { t } = useTranslation('budget');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const record = useInvoiceRecord(id);
  const { invoice, isLoading, error, notFound } = record;

  const invoiceTitle = useInvoiceDisplayTitle(invoice);
  // The title of the loaded invoice, or the plain noun while it is not (or cannot be) shown.
  const invoiceName = invoiceTitle ?? tc('navigation.invoice');
  const h1Text =
    isLoading || !invoice
      ? notFound && !isLoading
        ? tc('navigation.invoiceNotFound')
        : tc('navigation.invoice')
      : invoiceName;
  useDocumentTitle(h1Text);
  const originState = useOriginState(invoice ? invoiceTitle : null);

  if (isLoading) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <Skeleton lines={4} loadingLabel={t('invoiceDetail.loading')} />
      </PageLayout>
    );
  }

  if (error || !invoice) {
    return (
      <PageLayout title={h1Text} breadcrumbs={<PageBreadcrumbs />}>
        <div className={styles.errorCard} role="alert">
          {notFound ? null : <h2 className={styles.errorTitle}>{t('invoiceDetail.error')}</h2>}
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => navigate(routeUrl('invoices'))}
            >
              {tc('navigation.backTo', { origin: tc('navigation.invoices') })}
            </button>
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={() => void record.reload()}
            >
              {t('invoiceDetail.retry')}
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <InvoiceDetailLoaded
      id={id}
      invoice={invoice}
      record={record}
      h1Text={h1Text}
      invoiceName={invoiceName}
      originState={originState}
    />
  );
}

interface InvoiceDetailLoadedProps {
  readonly id: string;
  readonly invoice: InvoiceDetail;
  readonly record: UseInvoiceRecordResult;
  readonly h1Text: string;
  readonly invoiceName: string;
  readonly originState: ReturnType<typeof useOriginState>;
}

function InvoiceDetailLoaded({
  id,
  invoice,
  record,
  h1Text,
  invoiceName,
  originState,
}: InvoiceDetailLoadedProps) {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const userText = useUserText();
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();
  const [searchParams] = useSearchParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeadingAfterConvertRef = useRef(false);
  const paymentDeepLinkHandledRef = useRef(false);

  const costLines = useInvoiceCostLines(id);
  const documents = useDocumentsPanel('invoice', id);
  const tabs = useObjectTabs(['cost', 'payments', 'history']);
  const payments = usePaymentDialogs({ invoice, costLines, onSaved: record.refresh });
  const sources = useMemo(
    () => invoiceSources(costLines.lines, costLines.budgetSources),
    [costLines.lines, costLines.budgetSources],
  );
  const facts = useInvoiceSummaryFacts({
    invoice,
    costLines,
    documentsFact: documents.fact,
    tabs,
    originState,
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('invoice', showDeleteModal ? id : null);

  const isOffer = invoice.status === 'quotation';

  const convert = useConvertQuotation({
    invoice,
    refreshInvoice: async () => {
      const fresh = await fetchInvoiceById(id);
      record.apply(fresh);
      return fresh;
    },
    onConverted: () => {
      focusHeadingAfterConvertRef.current = true;
      void record.refresh();
      void costLines.reload();
    },
  });

  // The Convert button unmounts once the status changes, so move focus to the page heading.
  useEffect(() => {
    if (focusHeadingAfterConvertRef.current) {
      focusHeadingAfterConvertRef.current = false;
      headingRef.current?.focus();
    }
  }, [invoice]);

  // A link that carries only ?payment= (History, Attention) lands on the Payments tab.
  useEffect(() => {
    if (paymentDeepLinkHandledRef.current) return;
    paymentDeepLinkHandledRef.current = true;
    if (searchParams.has('payment') && tabs.active !== 'payments') tabs.select('payments');
  }, [searchParams, tabs]);

  useQueryTargetHighlight({
    param: 'payment',
    ready: tabs.active === 'payments',
    selector: (paymentId) =>
      `[data-testid="invoice-progress-payments-link-${CSS.escape(paymentId)}"], [data-testid="invoice-refunds-link-${CSS.escape(paymentId)}"]`,
    highlightClassName: styles.paymentTarget!,
    onMissing: () => showToast('info', t('invoiceDetail.deposits.paymentGone')),
  });

  const applyStatus = (to: InvoiceStatus) =>
    runStatusChange({
      request: () => changeInvoiceStatus(invoice.vendorId, invoice.id, invoiceStatusBody(to)),
      recordName: invoiceName,
      statusLabel: statusVariants.invoice[to].label,
      dedupeKey: `invoice:${invoice.id}`,
      onChanged: () => void record.refresh(),
      onUndone: async () => {
        await record.refresh();
      },
    });

  const statusMenuProps = {
    transitions: invoiceTransitions(tc, invoice),
    badge: { variants: statusVariants.invoice, value: invoice.status },
    currentLabel: statusVariants.invoice[invoice.status].label,
    focusFallbackRef: headingRef,
    onApply: (to: InvoiceStatus) => applyStatus(to),
  };

  const openAddPayment = () => {
    const active = document.activeElement;
    payments.openAdd('deposit', active instanceof HTMLElement ? active : null);
  };

  const actions = INVOICE_HEADER_ACTIONS[invoice.status];
  let primary: ObjectHeaderPrimary<InvoiceStatus>;
  switch (actions.primary) {
    case 'markPaid':
      primary = {
        kind: 'status',
        status: { ...statusMenuProps, actionTo: 'paid', testId: 'invoice-primary-mark-paid' },
      };
      break;
    case 'prepareBankReport': {
      const [only] = sources;
      primary = {
        kind: 'link',
        label: t('invoicePage.actions.prepareBankReport'),
        to: routeUrl(
          'bankReport',
          undefined,
          sources.length === 1 && only ? { sourceId: only.id } : undefined,
        ),
        state: originState,
        testId: 'invoice-primary-bank-report',
      };
      break;
    }
    case 'addProgressPayment':
      primary = {
        kind: 'button',
        label: t('invoicePage.actions.addProgressPayment'),
        onClick: openAddPayment,
        testId: 'invoice-primary-add-payment',
      };
      break;
  }

  const vendorName = invoice.vendorName;
  const description = (
    <>
      <NavAnchor
        to={routeUrl('company', { id: invoice.vendorId })}
        state={originState}
        data-testid="invoice-company-link"
        {...userText()}
      >
        {vendorName}
      </NavAnchor>
      {invoice.notes ? (
        <>
          {TITLE_SEPARATOR}
          <span {...userText()}>{invoice.notes}</span>
        </>
      ) : null}
    </>
  );

  const openDeleteModal = () => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError('');
    setDeleteBlocked(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteInvoice(invoice.vendorId, invoice.id);
      navigate(routeUrl('invoices'), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('invoiceDetail.messages.deleteError'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const typeLabel = tc(isOffer ? 'navigation.offer' : 'navigation.invoice');

  const header = (
    <ObjectHeader
      title={h1Text}
      titleIsUserText={Boolean(invoice.vendorName.trim() || invoice.invoiceNumber?.trim())}
      breadcrumbs={<PageBreadcrumbs />}
      description={description}
      headingRef={headingRef}
      testId="invoice-header"
      status={
        isOffer ? undefined : <StatusMenu {...statusMenuProps} testId="invoice-status-badge" />
      }
      secondary={
        actions.secondary === 'convert' ? (
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            data-testid="convert-quotation-button"
            onClick={convert.open}
          >
            {t('invoiceDetail.buttons.convertToFinal')}
          </button>
        ) : actions.secondary === 'addProgressPayment' ? (
          <button
            type="button"
            className={sharedStyles.btnSecondary}
            data-testid="invoice-secondary-add-payment"
            onClick={(event) => payments.openAdd('deposit', event.currentTarget)}
          >
            {t('invoicePage.actions.addProgressPayment')}
          </button>
        ) : undefined
      }
      primary={primary}
      menu={{
        onDelete: openDeleteModal,
        extraItems: [
          {
            id: 'edit',
            label: t('invoicePage.actions.editDetails'),
            onClick: () => setShowEditModal(true),
            testId: 'invoice-menu-edit',
          },
        ],
      }}
    />
  );

  return (
    <PageLayout header={header}>
      <SummaryStrip typeLabel={typeLabel} facts={facts} testId="invoice-summary" />

      <ObjectTabs
        controller={tabs}
        typeLabel={typeLabel}
        idPrefix="invoice-tabs"
        counts={{
          cost: costLines.loading ? null : costLines.lines.length,
          payments: invoice.deposits.length,
        }}
        panels={{
          cost: () => (
            <div className={styles.costCard}>
              <CostLinesSection
                host={{
                  kind: 'invoice',
                  id: invoice.id,
                  label: invoiceName,
                  status: invoice.status,
                  amount: invoice.amount,
                  vendorId: invoice.vendorId,
                }}
                documentLines={costLines}
                onChanged={async () => {
                  await record.refresh();
                }}
                linkState={originState}
              />
            </div>
          ),
          payments: () => (
            <InvoicePaymentsPanel
              invoice={invoice}
              payments={payments}
              onChanged={record.refresh}
              headingRef={headingRef}
              originState={originState}
            />
          ),
          history: () => <InvoiceHistoryPanel invoiceId={id} revision={record.revision} />,
        }}
      />

      {documents.panel}

      {/* Quotation conversion flow: one modal at a time, never stacked */}
      {convert.view === 'form' && <ConvertQuotationModal convert={convert} />}
      {convert.view === 'paperless' && (
        <InvoicePaperlessPickerModal
          onDocumentSelected={convert.onDocumentSelected}
          onManualEntry={convert.onPickerClosed}
          onClose={convert.onPickerClosed}
          paperlessUrl={convert.paperless.paperlessUrl}
        />
      )}
      {convert.view === 'refund' && (
        <InvoiceDepositFormModal
          invoiceId={invoice.id}
          mode="add"
          lockEntryType
          initialValues={{ entryType: 'refund', status: 'pending', ...convert.refundPreset }}
          budgetSources={convert.budgetSources}
          onSaved={() => void convert.onRefundSaved()}
          onClose={convert.onRefundClosed}
        />
      )}

      {payments.dialog}

      {showEditModal && (
        <InvoiceEditModal
          invoice={invoice}
          onSaved={record.refresh}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showDeleteModal && (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: invoiceName })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={isDeleting}
          blocked={deleteBlocked}
          error={deleteError || null}
          onConfirm={() => void handleDelete()}
          onCancel={closeDeleteModal}
          testIdPrefix="invoice-delete"
        />
      )}
    </PageLayout>
  );
}

export default InvoiceDetailPage;

import { routeUrl } from '@cornerstone/shared';
import { useId } from 'react';
import type { TFunction } from 'i18next';
import type { SourceReportType, PaperlessStatusResponse } from '@cornerstone/shared';
import { Spinner } from '../../components/Spinner/Spinner.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';

interface Step5ActionsProps {
  useCase: SourceReportType;
  paperlessStatus: PaperlessStatusResponse | null;
  /** The report's funding source (target of the "Open History" link). */
  sourceId: string;
  isMarkingClaimed: boolean;
  claimSuccess: boolean;
  claimedInvoiceCount: number;
  claimedDepositCount: number;
  finishedWithoutMarking: boolean;
  selectedInvoiceCount: number;
  onPreviewPdf: () => void;
  onDownload: () => void;
  onMarkClaimed?: () => void;
  onFinishWithoutMarking?: () => void;
  onUploadPaperless: () => void;
  activeAction: 'preview' | 'download' | 'paperless' | null;
  /** Number of generated PDF files (multi-PDF split, #2161). Default 1 = unchanged labels. */
  partCount?: number;
  /** Number of parts whose last upload failed; > 0 turns "Upload all" into "Retry failed". */
  retryFailedCount?: number;
  /** Transfer progress line (e.g. "Uploading 2 of 3…"). */
  statusMessage?: string | null;
  /** Disables every action (e.g. while the parts are being prepared). */
  disabled?: boolean;
  t: TFunction;
}

export function Step5Actions({
  useCase,
  paperlessStatus,
  sourceId,
  isMarkingClaimed,
  claimSuccess,
  claimedInvoiceCount,
  claimedDepositCount,
  finishedWithoutMarking,
  selectedInvoiceCount,
  onPreviewPdf,
  onDownload,
  onMarkClaimed,
  onFinishWithoutMarking,
  onUploadPaperless,
  activeAction,
  partCount = 1,
  retryFailedCount = 0,
  statusMessage = null,
  disabled = false,
  t,
}: Step5ActionsProps) {
  const isClaim = useCase === 'claim';
  const isBusy = activeAction !== null || disabled;
  const isMultiPart = partCount > 1;
  const isRetry = isMultiPart && retryFailedCount > 0;
  const downloadLabel = isMultiPart
    ? t('sourceReports.parts.downloadAll', { count: partCount })
    : t('sourceReports.download');
  let uploadLabel = t('sourceReports.uploadPaperless');
  if (isRetry) {
    uploadLabel = t('sourceReports.parts.retryFailed', { count: retryFailedCount });
  } else if (isMultiPart) {
    uploadLabel = t('sourceReports.parts.uploadAll', { count: partCount });
  }

  const originState = useOriginState();
  const zeroReasonId = useId();
  const nothingSelected = selectedInvoiceCount === 0;

  return (
    <div className={styles.actionsContainer}>
      {/* Persistent live region: always mounted so text changes are announced. */}
      <p
        className={statusMessage ? styles.transferStatus : sharedStyles.srOnly}
        role="status"
        aria-atomic="true"
      >
        {statusMessage}
      </p>

      <div className={styles.getReport}>
        <button
          type="button"
          className={sharedStyles.btnSecondary}
          onClick={onPreviewPdf}
          disabled={isBusy}
        >
          {activeAction === 'preview' && (
            <span aria-hidden="true">
              <Spinner size="sm" color="muted" />
            </span>
          )}
          {t('sourceReports.editable.previewPdf')}
        </button>

        <button
          type="button"
          className={sharedStyles.btnPrimary}
          onClick={onDownload}
          disabled={isBusy}
        >
          {activeAction === 'download' && (
            <span aria-hidden="true">
              <Spinner size="sm" color="muted" />
            </span>
          )}
          {downloadLabel}
        </button>

        {paperlessStatus?.configured && paperlessStatus?.reachable && (
          <button
            type="button"
            className={isRetry ? sharedStyles.btnPrimary : sharedStyles.btnSecondary}
            onClick={onUploadPaperless}
            disabled={isBusy}
          >
            {activeAction === 'paperless' && (
              <span aria-hidden="true">
                <Spinner size="sm" color="muted" />
              </span>
            )}
            {uploadLabel}
          </button>
        )}
      </div>

      {isClaim &&
        (claimSuccess ? (
          <div className={sharedStyles.bannerSuccess} role="status">
            <div>
              {finishedWithoutMarking
                ? t('sourceReports.finishedWithoutMarkingSuccess')
                : t('sourceReports.claimSuccess', {
                    invoices: t('sourceReports.invoiceCount', { count: claimedInvoiceCount }),
                    progressPayments: t('sourceReports.progressPaymentCount', {
                      count: claimedDepositCount,
                    }),
                  })}
            </div>
            <NavAnchor
              to={routeUrl('invoices')}
              state={originState}
              className={sharedStyles.bannerLink}
            >
              {t('sourceReports.viewInvoices')}
            </NavAnchor>
            {!finishedWithoutMarking && (
              <NavAnchor
                to={routeUrl('fundingSource', { id: sourceId }, { tab: 'history' })}
                state={originState}
                className={sharedStyles.bannerLink}
              >
                {t('sourceReports.openHistory')}
              </NavAnchor>
            )}
          </div>
        ) : (
          <section className={styles.afterSend}>
            <h3>{t('sourceReports.afterSend.heading')}</h3>
            <p>{t('sourceReports.afterSend.text', { count: selectedInvoiceCount })}</p>
            <div className={styles.afterSendActions}>
              <button
                type="button"
                className={`${sharedStyles.btnSecondary} ${styles.inertSecondary}`}
                onClick={nothingSelected ? undefined : onMarkClaimed}
                disabled={isBusy || isMarkingClaimed}
                aria-disabled={nothingSelected || undefined}
                aria-describedby={nothingSelected ? zeroReasonId : undefined}
              >
                {nothingSelected
                  ? t('sourceReports.markSubmittedNone')
                  : t('sourceReports.markSubmitted', { count: selectedInvoiceCount })}
              </button>
              {nothingSelected && (
                <span id={zeroReasonId} className={sharedStyles.srOnly}>
                  {t('sourceReports.mark.zeroReason')}
                </span>
              )}
              <button
                type="button"
                className={sharedStyles.btnText}
                onClick={onFinishWithoutMarking}
                disabled={isBusy}
              >
                {t('sourceReports.finishWithoutMarking')}
              </button>
            </div>
          </section>
        ))}
    </div>
  );
}

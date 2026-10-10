import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { SourceReportType, PaperlessStatusResponse } from '@cornerstone/shared';
import { Spinner } from '../../components/Spinner/Spinner.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';

interface Step5ActionsProps {
  useCase: SourceReportType;
  paperlessStatus: PaperlessStatusResponse | null;
  isMarkingClaimed: boolean;
  claimError: string | null;
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
  isMarkingClaimed,
  claimError,
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
      {claimSuccess ? (
        <div className={sharedStyles.bannerSuccess}>
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
          <Link to="/budget/invoices" className={sharedStyles.bannerLink}>
            {t('sourceReports.viewInvoices')}
          </Link>
        </div>
      ) : (
        <>
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

          {isClaim && (
            <>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={onMarkClaimed}
                disabled={isBusy || isMarkingClaimed || selectedInvoiceCount === 0}
              >
                {selectedInvoiceCount === 0
                  ? t('sourceReports.markSubmittedNone')
                  : t('sourceReports.markSubmitted', { count: selectedInvoiceCount })}
              </button>

              <button
                type="button"
                className={sharedStyles.btnSecondaryCompact}
                onClick={onFinishWithoutMarking}
                disabled={isBusy}
              >
                {t('sourceReports.finishWithoutMarking')}
              </button>
            </>
          )}

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
        </>
      )}

      {claimError && (
        <div className={sharedStyles.bannerError} role="alert">
          {claimError}
        </div>
      )}
    </div>
  );
}

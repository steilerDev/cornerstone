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
  claimedCount: number;
  finishedWithoutMarking: boolean;
  selectedInvoiceCount: number;
  onPreviewPdf: () => void;
  onDownload: () => void;
  onMarkClaimed?: () => void;
  onFinishWithoutMarking?: () => void;
  onUploadPaperless: () => void;
  activeAction: 'preview' | 'download' | 'paperless' | null;
  t: TFunction;
}

export function Step5Actions({
  useCase,
  paperlessStatus,
  isMarkingClaimed,
  claimError,
  claimSuccess,
  claimedCount,
  finishedWithoutMarking,
  selectedInvoiceCount,
  onPreviewPdf,
  onDownload,
  onMarkClaimed,
  onFinishWithoutMarking,
  onUploadPaperless,
  activeAction,
  t,
}: Step5ActionsProps) {
  const isClaim = useCase === 'claim';

  return (
    <div className={styles.actionsContainer}>
      {claimSuccess ? (
        <div className={sharedStyles.bannerSuccess}>
          <div>
            {finishedWithoutMarking
              ? t('sourceReports.finishedWithoutMarkingSuccess')
              : t('sourceReports.claimSuccess', { count: claimedCount })}
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
            disabled={activeAction !== null}
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
            disabled={activeAction !== null}
          >
            {activeAction === 'download' && (
              <span aria-hidden="true">
                <Spinner size="sm" color="muted" />
              </span>
            )}
            {t('sourceReports.download')}
          </button>

          {isClaim && (
            <>
              <button
                type="button"
                className={sharedStyles.btnPrimary}
                onClick={onMarkClaimed}
                disabled={activeAction !== null || isMarkingClaimed}
              >
                {t('sourceReports.markClaimed', { count: selectedInvoiceCount })}
              </button>

              <button
                type="button"
                className={sharedStyles.btnSecondaryCompact}
                onClick={onFinishWithoutMarking}
                disabled={activeAction !== null}
              >
                {t('sourceReports.finishWithoutMarking')}
              </button>
            </>
          )}

          {paperlessStatus?.configured && paperlessStatus?.reachable && (
            <button
              type="button"
              className={sharedStyles.btnSecondary}
              onClick={onUploadPaperless}
              disabled={activeAction !== null}
            >
              {activeAction === 'paperless' && (
                <span aria-hidden="true">
                  <Spinner size="sm" color="muted" />
                </span>
              )}
              {t('sourceReports.uploadPaperless')}
            </button>
          )}
        </>
      )}

      {claimError && <div className={sharedStyles.formErrorBanner}>{claimError}</div>}
    </div>
  );
}

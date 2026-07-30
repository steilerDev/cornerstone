import { Link } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { SourceReportType, PaperlessStatusResponse } from '@cornerstone/shared';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';

interface Step4OptionsProps {
  attachDocuments: boolean;
  onAttachDocumentsChange: (value: boolean) => void;
  includeCoverLetter: boolean;
  onIncludeCoverLetterChange: (value: boolean) => void;
  coverLetterDisabled: boolean;
  useCase: SourceReportType;
  paperlessStatus: PaperlessStatusResponse | null;
  isMarkingClaimed: boolean;
  claimError: string | null;
  claimSuccess: boolean;
  claimedCount: number;
  finishedWithoutMarking: boolean;
  selectedInvoiceCount: number;
  onDownload: () => void;
  onMarkClaimed?: () => void;
  onFinishWithoutMarking?: () => void;
  onUploadPaperless: () => void;
  isSaving: boolean;
  t: TFunction;
}

export function Step4Options({
  attachDocuments,
  onAttachDocumentsChange,
  includeCoverLetter,
  onIncludeCoverLetterChange,
  coverLetterDisabled,
  useCase,
  paperlessStatus,
  isMarkingClaimed,
  claimError,
  claimSuccess,
  claimedCount,
  finishedWithoutMarking,
  selectedInvoiceCount,
  onDownload,
  onMarkClaimed,
  onFinishWithoutMarking,
  onUploadPaperless,
  isSaving,
  t,
}: Step4OptionsProps) {
  const isClaim = useCase === 'claim';
  const showCoverLetterDisabledHint = coverLetterDisabled
    ? t('sourceReports.coverLetterDisabledReason')
    : undefined;

  return (
    <div className={styles.step4Column}>
      {/* Options panel */}
      <div className={styles.optionsCard}>
        <div className={styles.optionRow}>
          <input
            type="checkbox"
            id="attachDocuments"
            checked={attachDocuments}
            onChange={(e) => onAttachDocumentsChange(e.target.checked)}
            className={styles.optionCheckbox}
          />
          <label htmlFor="attachDocuments" className={styles.optionLabel}>
            {t('sourceReports.attachDocuments')}
          </label>
          <div className={styles.optionHelper}>{t('sourceReports.attachDocumentsHelper')}</div>
        </div>

        <div className={styles.optionRow}>
          <input
            type="checkbox"
            id="includeCoverLetter"
            checked={includeCoverLetter}
            onChange={(e) => onIncludeCoverLetterChange(e.target.checked)}
            className={styles.optionCheckbox}
            disabled={coverLetterDisabled}
            title={showCoverLetterDisabledHint}
          />
          <label
            htmlFor="includeCoverLetter"
            className={styles.optionLabel}
            title={showCoverLetterDisabledHint}
          >
            {t('sourceReports.includeCoverLetter')}
          </label>
          <div className={styles.optionHelper}>{t('sourceReports.includeCoverLetterHelper')}</div>
        </div>
      </div>

      {/* Actions */}
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
              className={sharedStyles.btnPrimary}
              onClick={onDownload}
              disabled={isSaving}
            >
              {t('sourceReports.download')}
            </button>

            {isClaim && (
              <>
                <button
                  type="button"
                  className={sharedStyles.btnPrimary}
                  onClick={onMarkClaimed}
                  disabled={isSaving || isMarkingClaimed}
                >
                  {t('sourceReports.markClaimed', { count: selectedInvoiceCount })}
                </button>

                <button
                  type="button"
                  className={sharedStyles.btnSecondaryCompact}
                  onClick={onFinishWithoutMarking}
                  disabled={isSaving}
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
                disabled={isSaving}
              >
                {t('sourceReports.uploadPaperless')}
              </button>
            )}
          </>
        )}

        {claimError && <div className={sharedStyles.formErrorBanner}>{claimError}</div>}
      </div>
    </div>
  );
}

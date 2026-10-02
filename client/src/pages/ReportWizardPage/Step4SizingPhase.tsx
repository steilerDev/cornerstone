import type { Ref } from 'react';
import type { TFunction } from 'i18next';
import { FormError } from '../../components/FormError/FormError.js';
import { Spinner } from '../../components/Spinner/Spinner.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';
import type { SizingState } from './useReportParts.js';

interface Step4SizingPhaseProps {
  sizing: SizingState;
  onCancel: () => void;
  onRetry: () => void;
  onContinue: () => void;
  onBack: () => void;
  retryRef: Ref<HTMLButtonElement>;
  t: TFunction;
}

/** Replaces the step 4 content while attachment sizes are acquired (and when that fails). */
export function Step4SizingPhase({
  sizing,
  onCancel,
  onRetry,
  onContinue,
  onBack,
  retryRef,
  t,
}: Step4SizingPhaseProps) {
  if (sizing.phase === 'running') {
    const progressText = t('sourceReports.sizing.progress', {
      current: sizing.done,
      total: sizing.total,
    });
    return (
      <div className={styles.sizingCard} data-testid="sizing-phase">
        <span aria-hidden="true">
          <Spinner size="md" />
        </span>
        <p role="status" aria-atomic="true">
          {progressText}
        </p>
        <progress
          className={styles.sizingProgress}
          max={sizing.total}
          value={sizing.done}
          aria-label={progressText}
        />
        <div className={styles.buttonRow}>
          <button type="button" className={sharedStyles.btnSecondary} onClick={onCancel}>
            {t('common:button.cancel')}
          </button>
        </div>
      </div>
    );
  }

  if (sizing.phase === 'failed') {
    return (
      <div className={styles.sizingCard} data-testid="sizing-failed">
        <FormError
          variant="banner"
          message={t('sourceReports.sizing.fetchFailed', { count: sizing.failures.length })}
        />
        <ul className={styles.failedList}>
          {sizing.failures.map((failure) => (
            <li key={`${failure.invoiceId}-${failure.documentId}`}>
              {t('sourceReports.sizing.fetchFailedItem', {
                title:
                  failure.title ??
                  t('sourceReports.sizing.documentFallbackTitle', { id: failure.documentId }),
                vendor: failure.vendorName,
                invoiceNumber: failure.invoiceNumber ?? '—',
              })}
            </li>
          ))}
        </ul>
        <div className={styles.buttonRow}>
          <button
            type="button"
            ref={retryRef}
            className={sharedStyles.btnPrimary}
            onClick={onRetry}
          >
            {t('common:button.retry')}
          </button>
          <button type="button" className={sharedStyles.btnSecondary} onClick={onContinue}>
            {t('sourceReports.sizing.continueAnyway')}
          </button>
          <button type="button" className={sharedStyles.btnSecondary} onClick={onBack}>
            {t('common:button.back')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}

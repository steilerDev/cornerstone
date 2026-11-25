import type { TFunction } from 'i18next';
import type { SourceReportType } from '@cornerstone/shared';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { TermHintPopover } from '../../components/Tooltip/TermHintPopover.js';
import styles from './ReportWizardPage.module.css';

interface Step1UseCaseProps {
  value: SourceReportType | null;
  onChange: (useCase: SourceReportType) => void;
  t: TFunction;
}

const USE_CASES: readonly SourceReportType[] = ['claim', 'budget-overview', 'proof-of-funds'];

export function Step1UseCase({ value, onChange, t }: Step1UseCaseProps) {
  return (
    <fieldset className={styles.useCaseFieldset}>
      <legend className={styles.useCaseLabel}>{t('sourceReports.useCaseLabel')}</legend>

      <div
        className={styles.useCaseGrid}
        role="radiogroup"
        aria-label={t('sourceReports.useCaseLabel')}
      >
        {USE_CASES.map((useCase) => (
          <div key={useCase} className={styles.useCaseItem}>
            <label
              className={
                useCase === 'claim'
                  ? `${styles.useCaseCard} ${styles.useCaseCardWithHint}`
                  : styles.useCaseCard
              }
            >
              <input
                type="radio"
                name="useCase"
                value={useCase}
                checked={value === useCase}
                onChange={(e) => onChange(e.target.value as SourceReportType)}
                className={styles.useCaseRadio}
              />
              <div className={styles.useCaseTitle}>
                {t(I18N_UNION_KEYS.reportUseCase.key(useCase))}
              </div>
              <div className={styles.useCaseHelper}>
                {t(I18N_UNION_KEYS.reportUseCaseHelper.key(useCase))}
              </div>
            </label>
            {useCase === 'claim' ? (
              <span className={styles.useCaseHint}>
                <TermHintPopover terms={['drawDownRequest']} align="end" />
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

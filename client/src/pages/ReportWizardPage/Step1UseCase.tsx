import type { TFunction } from 'i18next';
import type { SourceReportType } from '@cornerstone/shared';
import styles from './ReportWizardPage.module.css';

interface Step1UseCaseProps {
  value: SourceReportType | null;
  onChange: (useCase: SourceReportType) => void;
  t: TFunction;
}

const USE_CASES: SourceReportType[] = ['budget-overview', 'claim', 'proof-of-funds'];

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
          <label key={useCase} className={styles.useCaseCard}>
            <input
              type="radio"
              name="useCase"
              value={useCase}
              checked={value === useCase}
              onChange={(e) => onChange(e.target.value as SourceReportType)}
              className={styles.useCaseRadio}
            />
            <div className={styles.useCaseTitle}>{t(`sourceReports.useCase.${useCase}`)}</div>
            <div className={styles.useCaseHelper}>
              {t(`sourceReports.useCaseHelper.${useCase}`)}
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

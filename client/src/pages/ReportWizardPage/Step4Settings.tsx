import type { TFunction } from 'i18next';
import type { ResolvedLocale } from '../../contexts/LocaleContext.js';
import styles from './ReportWizardPage.module.css';

interface Step4SettingsProps {
  reportLanguage: ResolvedLocale;
  onReportLanguageChange: (language: ResolvedLocale) => void;
  attachDocuments: boolean;
  onAttachDocumentsChange: (value: boolean) => void;
  includeCoverLetter: boolean;
  onIncludeCoverLetterChange: (value: boolean) => void;
  coverLetterDisabled: boolean;
  t: TFunction;
}

export function Step4Settings({
  reportLanguage,
  onReportLanguageChange,
  attachDocuments,
  onAttachDocumentsChange,
  includeCoverLetter,
  onIncludeCoverLetterChange,
  coverLetterDisabled,
  t,
}: Step4SettingsProps) {
  const showCoverLetterDisabledHint = coverLetterDisabled
    ? t('sourceReports.coverLetterDisabledReason')
    : undefined;

  return (
    <div className={styles.settingsCard}>
      {/* Language section */}
      <div className={styles.settingsSection}>
        <h3 id="report-language-heading" className={styles.sectionTitle}>
          {t('sourceReports.settingsStep.languageHeading')}
        </h3>
        <div
          className={styles.languageGroup}
          role="group"
          aria-labelledby="report-language-heading"
        >
          <label>
            <input
              type="radio"
              name="reportLanguage"
              value="en"
              checked={reportLanguage === 'en'}
              onChange={() => onReportLanguageChange('en')}
            />
            English
          </label>
          <label>
            <input
              type="radio"
              name="reportLanguage"
              value="de"
              checked={reportLanguage === 'de'}
              onChange={() => onReportLanguageChange('de')}
            />
            Deutsch
          </label>
        </div>
        <div className={styles.optionHelper}>{t('sourceReports.settingsStep.languageHelper')}</div>
      </div>

      {/* Document options section */}
      <div className={styles.settingsDivider}>
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
    </div>
  );
}

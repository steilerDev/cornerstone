import type { TFunction } from 'i18next';
import type { ResolvedLocale } from '../../contexts/LocaleContext.js';
import { FormError } from '../../components/FormError/FormError.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReportWizardPage.module.css';

export type MaxFileSizeError = 'invalid' | 'min' | 'decimals';

interface Step4SettingsProps {
  reportLanguage: ResolvedLocale;
  onReportLanguageChange: (language: ResolvedLocale) => void;
  attachDocuments: boolean;
  onAttachDocumentsChange: (value: boolean) => void;
  includeCoverLetter: boolean;
  onIncludeCoverLetterChange: (value: boolean) => void;
  coverLetterDisabled: boolean;
  /** Maximum file size (MB) input text. The block renders only when `onMaxFileSizeChange` is set. */
  maxFileSize?: string;
  onMaxFileSizeChange?: (value: string) => void;
  maxFileSizeError?: MaxFileSizeError | null;
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
  maxFileSize = '',
  onMaxFileSizeChange,
  maxFileSizeError = null,
  t,
}: Step4SettingsProps) {
  // The error is irrelevant (value kept but ignored) while attachments are off.
  const visibleLimitError = attachDocuments ? maxFileSizeError : null;
  let limitErrorMessage: string | null = null;
  switch (visibleLimitError) {
    case 'invalid':
      limitErrorMessage = t('sourceReports.settingsStep.maxFileSizeError.invalid');
      break;
    case 'min':
      limitErrorMessage = t('sourceReports.settingsStep.maxFileSizeError.min');
      break;
    case 'decimals':
      limitErrorMessage = t('sourceReports.settingsStep.maxFileSizeError.decimals');
      break;
    default:
      break;
  }

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

        {onMaxFileSizeChange && (
          <div className={styles.maxFileSizeBlock}>
            <label htmlFor="maxFileSize" className={styles.optionLabel}>
              {t('sourceReports.settingsStep.maxFileSizeLabel')}
            </label>
            <div className={styles.maxFileSizeRow}>
              <div className={styles.maxFileSizeInputWrap}>
                <input
                  id="maxFileSize"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className={[sharedStyles.input, limitErrorMessage ? styles.inputInvalid : '']
                    .filter(Boolean)
                    .join(' ')}
                  value={maxFileSize}
                  onChange={(e) => onMaxFileSizeChange(e.target.value)}
                  disabled={!attachDocuments}
                  aria-invalid={limitErrorMessage ? true : undefined}
                  aria-describedby={[
                    'maxFileSizeHelper',
                    limitErrorMessage ? 'maxFileSizeError' : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              </div>
              <span className={styles.maxFileSizeUnit} aria-hidden="true">
                {t('sourceReports.settingsStep.maxFileSizeUnit')}
              </span>
            </div>
            <div id="maxFileSizeHelper" className={styles.optionHelper}>
              {attachDocuments
                ? t('sourceReports.settingsStep.maxFileSizeHelper')
                : t('sourceReports.settingsStep.maxFileSizeDisabledHint')}
            </div>
            <FormError variant="field" id="maxFileSizeError" message={limitErrorMessage} />
          </div>
        )}

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

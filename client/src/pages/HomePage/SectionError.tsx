import { useTranslation } from 'react-i18next';
import type { HomeSectionId } from '@cornerstone/shared';
import { FormError } from '../../components/FormError/FormError.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import shared from '../../styles/shared.module.css';
import styles from './HomePage.module.css';

export interface SectionErrorProps {
  section: HomeSectionId;
  onRetry: () => void;
  testId: string;
}

/** The error state of one Home section: a banner naming the section and a retry button. */
export function SectionError({ section, onRetry, testId }: SectionErrorProps) {
  const { t } = useTranslation('home');
  const set = I18N_UNION_KEYS.homeSection;
  return (
    <div className={styles.sectionError} data-testid={testId}>
      <FormError message={t('error.section', { section: t(set.key(section)) })} />
      <button type="button" className={shared.btnSecondaryCompact} onClick={onRetry}>
        {t('error.retry')}
      </button>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import styles from './BudgetPage.module.css';

export function BudgetPage() {
  const { t } = useTranslation('budget');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('overview.title')}</h1>
      <p className={styles.description}>{t('overview.emptyStateDescription')}</p>
    </div>
  );
}

export default BudgetPage;

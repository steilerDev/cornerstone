import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation('common');

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('notFound.title')}</h1>
      <p className={styles.description}>{t('notFound.description')}</p>
      <Link to="/project" className={styles.homeLink}>
        {t('notFound.backLink')}
      </Link>
    </div>
  );
}

export default NotFoundPage;

import { routeUrl } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation('common');
  useDocumentTitle(t('notFound.title'));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t('notFound.title')}</h1>
      <p className={styles.description}>{t('notFound.description')}</p>
      <Link to={routeUrl('project')} className={styles.homeLink}>
        {t('notFound.backLink')}
      </Link>
    </div>
  );
}

export default NotFoundPage;

import { useTranslation } from 'react-i18next';
import { HOME_HELP_URL } from '../../lib/externalLinks.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import shared from '../../styles/shared.module.css';
import styles from './HomePage.module.css';

export interface MovedNoticeProps {
  onDismiss: () => void;
}

/** The one-time "What moved where" notice. Static (not a live region). */
export function MovedNotice({ onDismiss }: MovedNoticeProps) {
  const { t } = useTranslation('home');
  return (
    <div className={`${shared.bannerInfo} ${styles.notice}`} data-testid="home-moved-notice">
      <p className={styles.noticeText}>
        <strong>{t('notice.title')}</strong> {t('notice.body')}{' '}
        {/* External help page: a plain anchor opened in a new tab. */}
        <a href={HOME_HELP_URL} target="_blank" rel="noopener noreferrer">
          {t('page.whatMoved')}
          <span className={shared.srOnly}> {t('page.opensNewTab')}</span>
        </a>
      </p>
      <button
        type="button"
        className={shared.bannerClose}
        aria-label={t('notice.dismiss')}
        onClick={() => {
          onDismiss();
          focusPageHeading();
        }}
        data-testid="home-moved-notice-dismiss"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

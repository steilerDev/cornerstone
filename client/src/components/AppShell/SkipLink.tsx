import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './SkipLink.module.css';

/** id of the shell's one <main>; the skip link and AuthGuard focus it. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * First tab stop of the app shell: moves keyboard focus to <main> without navigating (#2261).
 * A plain <a href> on purpose (not a router Link): it adds no navigation destination.
 */
export function SkipLink() {
  const { t } = useTranslation('common');

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) return;
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    main.focus();
  };

  return (
    <a href={`#${MAIN_CONTENT_ID}`} className={styles.skipLink} onClick={onClick}>
      {t('aria.skipToContent')}
    </a>
  );
}

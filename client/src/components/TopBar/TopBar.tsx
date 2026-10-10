import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isApplePlatform } from '../../lib/platform.js';
import { UserMenu } from '../UserMenu/UserMenu.js';
import styles from './TopBar.module.css';

export interface TopBarProps {
  /** Receives the breadcrumb slot element (AppShell provides it to pages via BreadcrumbSlotContext). */
  readonly breadcrumbSlotRef: (el: HTMLDivElement | null) => void;
}

/** Desktop top bar (from 1024 px): breadcrumbs, search, new, attention and the user menu. */
export function TopBar({ breadcrumbSlotRef }: TopBarProps) {
  const { t } = useTranslation('common');
  const apple = useMemo(() => isApplePlatform(), []);

  return (
    <header className={styles.topBar} data-testid="top-bar">
      <div ref={breadcrumbSlotRef} className={styles.slot} data-testid="top-bar-slot" />
      <div className={styles.actions}>
        <button
          type="button"
          aria-disabled="true"
          className={styles.search}
          data-testid="top-bar-search"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <span>{t('topBar.search')}</span>
          <kbd aria-hidden="true" className={styles.kbd}>
            {apple ? t('topBar.searchShortcutApple') : t('topBar.searchShortcutOther')}
          </kbd>
        </button>
        <button
          type="button"
          aria-disabled="true"
          className={styles.newButton}
          data-testid="top-bar-new"
        >
          <span>{t('topBar.new')}</span>
          <span aria-hidden="true">▾</span>
        </button>
        <button
          type="button"
          aria-disabled="true"
          aria-label={t('topBar.attention')}
          className={styles.bell}
          data-testid="top-bar-attention"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 11V7a4 4 0 0 1 8 0v4l1 1.5H3L4 11z" />
            <path d="M6.5 14a1.5 1.5 0 0 0 3 0" />
          </svg>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

export default TopBar;

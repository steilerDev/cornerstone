import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useHouseName } from '../../contexts/HouseNameContext.js';
import { useScrolledPastHeading } from '../../hooks/useScrolledPastHeading.js';
import { isApplePlatform } from '../../lib/platform.js';
import { UserMenu } from '../UserMenu/UserMenu.js';
import styles from './TopBar.module.css';

export interface TopBarProps {
  /** Receives the breadcrumb slot element (AppShell provides it to pages via BreadcrumbSlotContext). */
  readonly breadcrumbSlotRef: (el: HTMLDivElement | null) => void;
  /** 'compact' below 1024 px (phone and tablet), 'desktop' from 1024 px. */
  readonly variant?: 'desktop' | 'compact';
}

/** Phone and tablet top bar: Back link (or house name), scrolled-heading title, search. */
function CompactTopBar({ breadcrumbSlotRef }: Pick<TopBarProps, 'breadcrumbSlotRef'>) {
  const { t } = useTranslation('common');
  const { houseName } = useHouseName();
  const location = useLocation();
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const title = useScrolledPastHeading(headerEl, location.key);

  return (
    <header
      ref={setHeaderEl}
      className={`${styles.topBar} ${styles.compact}`}
      data-testid="top-bar"
    >
      <div ref={breadcrumbSlotRef} className={styles.slotCompact} data-testid="top-bar-slot" />
      <span className={styles.houseName} data-testid="top-bar-house-name">
        {houseName ?? t('appName')}
      </span>
      <div
        className={styles.title}
        aria-hidden="true"
        data-visible={title ? 'true' : 'false'}
        data-testid="top-bar-title"
      >
        {title}
      </div>
      <button
        type="button"
        aria-disabled="true"
        aria-label={t('topBar.search')}
        className={styles.searchIcon}
        data-testid="top-bar-search"
      >
        <svg
          width="20"
          height="20"
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
      </button>
    </header>
  );
}

/** Top bar: desktop (from 1024 px) has breadcrumbs, search, new, attention and the user menu. */
export function TopBar({ breadcrumbSlotRef, variant = 'desktop' }: TopBarProps) {
  if (variant === 'compact') return <CompactTopBar breadcrumbSlotRef={breadcrumbSlotRef} />;
  return <DesktopTopBar breadcrumbSlotRef={breadcrumbSlotRef} />;
}

function DesktopTopBar({ breadcrumbSlotRef }: Pick<TopBarProps, 'breadcrumbSlotRef'>) {
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

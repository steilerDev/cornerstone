import { useEffect } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnScreenKeyboard } from '../../hooks/useOnScreenKeyboard.js';
import { navHref } from '../../navigation/navActive.js';
import type { NavActive } from '../../navigation/navActive.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import {
  NAV_SECTIONS,
  PHONE_BAR,
  PHONE_BAR_SECTIONS,
  PHONE_CAPTURE_ROUTE,
} from '../../navigation/navConfig.js';
import styles from './BottomBar.module.css';

export interface BottomBarProps {
  readonly active: NavActive | null;
  readonly moreOpen: boolean;
  readonly moreControlsId: string;
  readonly moreButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onMoreClick: () => void;
  /** Needs-attention count on the Home slot (story 3.4). Nothing renders when undefined or 0. */
  readonly homeBadge?: number;
}

type IconProps = { readonly children: ReactNode; readonly size?: number };

function Icon({ children, size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<'home' | 'diary' | 'capture' | 'photos' | 'more', ReactNode> = {
  home: (
    <Icon>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </Icon>
  ),
  diary: (
    <Icon>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </Icon>
  ),
  capture: (
    <Icon size={20}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  ),
  photos: (
    <Icon>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  ),
  more: (
    <Icon>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Icon>
  ),
};

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Phone and tablet bottom bar: Home, Site diary, New, Photos and the More sheet button. */
export function BottomBar({
  active,
  moreOpen,
  moreControlsId,
  moreButtonRef,
  onMoreClick,
  homeBadge,
}: BottomBarProps) {
  const { t } = useTranslation('common');
  const keyboardOpen = useOnScreenKeyboard();

  useEffect(() => {
    document.documentElement.dataset.shellBar = keyboardOpen ? 'hidden' : 'shown';
    return () => {
      delete document.documentElement.dataset.shellBar;
    };
  }, [keyboardOpen]);

  const moreActive = active !== null && !PHONE_BAR_SECTIONS.includes(active.sectionId);

  return (
    <nav
      aria-label={t('aria.mainNavigation')}
      className={styles.bar}
      data-keyboard-open={keyboardOpen ? 'true' : 'false'}
      data-testid="bottom-bar"
    >
      <ul className={styles.list}>
        {PHONE_BAR.map((slot) => {
          if (slot === 'more') {
            return (
              <li key={slot} className={styles.item}>
                <button
                  ref={moreButtonRef}
                  type="button"
                  className={cx(styles.slot, moreActive && styles.slotActive)}
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  aria-controls={moreControlsId}
                  aria-current={moreActive ? 'true' : undefined}
                  data-testid="bottom-bar-more"
                  onClick={onMoreClick}
                >
                  <span className={styles.icon}>{ICONS.more}</span>
                  <span className={styles.label}>{t('navigation.more')}</span>
                </button>
              </li>
            );
          }
          if (slot === 'capture') {
            return (
              <li key={slot} className={styles.item}>
                <NavAnchor
                  to={navHref(PHONE_CAPTURE_ROUTE)}
                  className={styles.slot}
                  data-testid="bottom-bar-new"
                >
                  <span className={styles.icon}>
                    <span className={styles.newIcon}>{ICONS.capture}</span>
                  </span>
                  <span className={styles.label}>{t('topBar.new')}</span>
                </NavAnchor>
              </li>
            );
          }
          const section = NAV_SECTIONS.find((s) => s.id === slot);
          if (!section) return null;
          const isCurrent = active?.sectionId === slot;
          const badgeCount =
            slot === 'home' && homeBadge !== undefined && homeBadge > 0 ? homeBadge : 0;
          return (
            <li key={slot} className={styles.item}>
              <NavAnchor
                to={navHref(section.route)}
                replace={isCurrent && active.exact}
                className={cx(styles.slot, isCurrent && styles.slotActive)}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={
                  badgeCount > 0 ? t('navigation.homeAttention', { count: badgeCount }) : undefined
                }
                data-testid={`bottom-bar-${slot}`}
              >
                <span className={styles.icon}>
                  {ICONS[slot]}
                  {badgeCount > 0 && (
                    <span className={styles.badge} aria-hidden="true">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </span>
                <span className={styles.label}>{t(section.labelKey)}</span>
              </NavAnchor>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default BottomBar;

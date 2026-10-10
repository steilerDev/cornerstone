import { useMemo } from 'react';
import type { RouteId } from '@cornerstone/shared';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import { GITHUB_URL } from '../../lib/externalLinks.js';
import { navSections } from '../../navigation/navConfig.js';
import type { NavGroup, NavLabelKey, NavSection } from '../../navigation/navConfig.js';
import { navHref, resolveNavActive } from '../../navigation/navActive.js';
import type { NavActive } from '../../navigation/navActive.js';
import { useNavContext } from '../../navigation/useNavContext.js';
import { Logo } from '../Logo/Logo.js';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle.js';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

type LinkVariant = 'top' | 'quiet' | 'nested';
type LinkState = 'active' | 'sectionCurrent' | 'none';

const VARIANT_CLASS: Record<LinkVariant, string> = {
  top: '',
  quiet: styles.navLinkQuiet ?? '',
  nested: styles.navLinkNested ?? '',
};
const STATE_CLASS: Record<LinkState, string> = {
  active: styles.active ?? '',
  sectionCurrent: styles.sectionCurrent ?? '',
  none: '',
};

interface SidebarLinkProps {
  route: RouteId;
  labelKey: NavLabelKey;
  state: LinkState;
  variant: LinkVariant;
  replace: boolean;
  onNavigate: () => void;
  testId: string;
}

function SidebarLink({
  route,
  labelKey,
  state,
  variant,
  replace,
  onNavigate,
  testId,
}: SidebarLinkProps) {
  const { t } = useTranslation('common');
  const className = [styles.navLink, VARIANT_CLASS[variant], STATE_CLASS[state]]
    .filter(Boolean)
    .join(' ');
  return (
    <Link
      to={navHref(route)}
      replace={replace}
      className={className}
      aria-current={state === 'active' ? 'page' : undefined}
      onClick={onNavigate}
      data-testid={testId}
    >
      {t(labelKey)}
    </Link>
  );
}

interface SidebarSectionItemProps {
  section: NavSection;
  active: NavActive | null;
  quiet: boolean;
  onNavigate: () => void;
}

function SidebarSectionItem({ section, active, quiet, onNavigate }: SidebarSectionItemProps) {
  const isCurrent = active?.sectionId === section.id;
  const replace = isCurrent && active.exact;
  const state: LinkState = !isCurrent
    ? 'none'
    : active.viewRoute === null
      ? 'active'
      : 'sectionCurrent';
  return (
    <li>
      <SidebarLink
        route={section.route}
        labelKey={section.labelKey}
        state={state}
        variant={quiet ? 'quiet' : 'top'}
        replace={replace}
        onNavigate={onNavigate}
        testId={`sidebar-section-${section.id}`}
      />
      {isCurrent && section.views.length > 0 && (
        <ul className={styles.navList}>
          {section.views.map((view) => (
            <li key={view.route}>
              <SidebarLink
                route={view.route}
                labelKey={view.labelKey}
                state={view.route === active.viewRoute ? 'active' : 'none'}
                variant="nested"
                replace={replace}
                onNavigate={onNavigate}
                testId={`sidebar-view-${view.route}`}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation('common');
  const { logout } = useAuth();
  const ctx = useNavContext();
  const sections = useMemo(() => navSections(ctx), [ctx]);
  const { pathname } = useLocation();
  const active = useMemo(() => resolveNavActive(pathname, sections), [pathname, sections]);
  const byGroup = (group: NavGroup) => sections.filter((s) => s.group === group);
  const primary = byGroup('primary');
  const quiet = byGroup('secondary');
  const footer = byGroup('footer');
  const sidebarClassName = [styles.sidebar, isOpen && styles.open].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClassName} data-open={isOpen}>
      <Link
        to={navHref('home')}
        className={styles.logoArea}
        aria-label={t('aria.goToHome')}
        onClick={onClose}
      >
        <Logo size={32} className={styles.logo} />
        <span className={styles.logoText}>{t('appName')}</span>
      </Link>
      <nav className={styles.nav} aria-label={t('aria.mainNavigation')}>
        <ul className={styles.navList}>
          {primary.map((section) => (
            <SidebarSectionItem
              key={section.id}
              section={section}
              active={active}
              quiet={false}
              onNavigate={onClose}
            />
          ))}
        </ul>
        {quiet.length > 0 && (
          <>
            <div className={styles.navSeparator} aria-hidden="true" />
            <ul className={styles.navList}>
              {quiet.map((section) => (
                <SidebarSectionItem
                  key={section.id}
                  section={section}
                  active={active}
                  quiet
                  onNavigate={onClose}
                />
              ))}
            </ul>
          </>
        )}
      </nav>
      <div className={styles.sidebarFooter}>
        {footer.length > 0 && (
          <nav aria-label={t('aria.settingsNavigation')}>
            <ul className={styles.navList}>
              {footer.map((section) => (
                <SidebarSectionItem
                  key={section.id}
                  section={section}
                  active={active}
                  quiet={false}
                  onNavigate={onClose}
                />
              ))}
            </ul>
          </nav>
        )}
        <div className={styles.footerLegacy} data-testid="sidebar-footer-legacy">
          <ThemeToggle />
          <button
            type="button"
            className={styles.logoutButton}
            onClick={() => {
              void logout().then(() => onClose());
            }}
          >
            {t('userMenu.logOut')}
          </button>
          <div className={styles.projectInfo}>
            <span>
              {t('appName')} v{__APP_VERSION__}
            </span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.githubLink}
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </aside>
  );
}

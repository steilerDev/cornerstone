import type { RouteId } from '@cornerstone/shared';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { NavGroup, NavLabelKey, NavSection } from '../../navigation/navConfig.js';
import { navHref } from '../../navigation/navActive.js';
import type { NavActive } from '../../navigation/navActive.js';
import { Logo } from '../Logo/Logo.js';
import styles from './Sidebar.module.css';

interface SidebarProps {
  readonly sections: readonly NavSection[];
  readonly active: NavActive | null;
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
  testId: string;
}

function SidebarLink({ route, labelKey, state, variant, replace, testId }: SidebarLinkProps) {
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
}

function SidebarSectionItem({ section, active, quiet }: SidebarSectionItemProps) {
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
                testId={`sidebar-view-${view.route}`}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({ sections, active }: SidebarProps) {
  const { t } = useTranslation('common');
  const byGroup = (group: NavGroup) => sections.filter((s) => s.group === group);
  const primary = byGroup('primary');
  const quiet = byGroup('secondary');
  const footer = byGroup('footer');

  return (
    <aside className={styles.sidebar}>
      <Link to={navHref('home')} className={styles.logoArea} aria-label={t('aria.goToHome')}>
        <Logo size={32} className={styles.logo} />
        <span className={styles.logoText}>{t('appName')}</span>
      </Link>
      <nav className={styles.nav} aria-label={t('aria.mainNavigation')}>
        <ul className={styles.navList}>
          {primary.map((section) => (
            <SidebarSectionItem key={section.id} section={section} active={active} quiet={false} />
          ))}
        </ul>
        {quiet.length > 0 && (
          <>
            <div className={styles.navSeparator} aria-hidden="true" />
            <ul className={styles.navList}>
              {quiet.map((section) => (
                <SidebarSectionItem key={section.id} section={section} active={active} quiet />
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
                />
              ))}
            </ul>
          </nav>
        )}
      </div>
    </aside>
  );
}

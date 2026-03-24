import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './SubNav.module.css';

export interface SubNavTab {
  labelKey: string;
  to: string;
  ns?: string;
  visible?: boolean;
  testId?: string;
}

export interface SubNavProps {
  tabs: SubNavTab[];
  ariaLabel: string;
}

/**
 * SubNav — unified horizontal tab-style navigation component.
 *
 * Renders a scrollable row of tab links for sub-pages.
 * The currently active tab is highlighted using the primary design token.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function SubNav({ tabs, ariaLabel }: SubNavProps) {
  return (
    <nav className={styles.subNav} aria-label={ariaLabel}>
      <div className={styles.tabList} role="list">
        {tabs
          .filter((tab) => tab.visible !== false)
          .map((tab) => (
            <TabLink key={tab.to} tab={tab} />
          ))}
      </div>
    </nav>
  );
}

function TabLink({ tab }: { tab: SubNavTab }) {
  const { t } = useTranslation(tab.ns ?? 'common');
  return (
    <NavLink
      to={tab.to}
      end
      className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      role="listitem"
      {...(tab.testId ? { 'data-testid': tab.testId } : {})}
    >
      {t(tab.labelKey)}
    </NavLink>
  );
}

export default SubNav;

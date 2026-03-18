import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './ProjectSubNav.module.css';

const PROJECT_TABS = [
  { labelKey: 'subnav.project.overview', to: '/project/overview' },
  { labelKey: 'subnav.project.workItems', to: '/project/work-items' },
  { labelKey: 'subnav.project.householdItems', to: '/project/household-items' },
  { labelKey: 'subnav.project.milestones', to: '/project/milestones' },
] as const;

/**
 * ProjectSubNav — horizontal tab-style navigation for the Project section.
 *
 * Renders a scrollable row of tab links for all project sub-pages.
 * The currently active tab is highlighted using the primary design token.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function ProjectSubNav() {
  const { t } = useTranslation('common');

  return (
    <nav className={styles.subNav} aria-label="Project section navigation">
      <div className={styles.tabList} role="list">
        {PROJECT_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            role="listitem"
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default ProjectSubNav;

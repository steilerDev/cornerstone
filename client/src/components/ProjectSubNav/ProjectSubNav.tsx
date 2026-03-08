import { NavLink } from 'react-router-dom';
import styles from './ProjectSubNav.module.css';

const PROJECT_TABS = [
  { label: 'Overview', to: '/project/overview' },
  { label: 'Work Items', to: '/project/work-items' },
  { label: 'Household Items', to: '/project/household-items' },
] as const;

/**
 * ProjectSubNav — horizontal tab-style navigation for the Project section.
 *
 * Renders a scrollable row of tab links for all project sub-pages.
 * The currently active tab is highlighted using the primary design token.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function ProjectSubNav() {
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
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default ProjectSubNav;

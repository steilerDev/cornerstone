import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import styles from './SettingsSubNav.module.css';

const SETTINGS_TABS = [
  { label: 'Profile', to: '/settings/profile' },
  { label: 'Manage', to: '/settings/manage' },
] as const;

/**
 * SettingsSubNav — horizontal tab-style navigation for the Settings section.
 *
 * Renders a scrollable row of tab links for all settings sub-pages.
 * The User Management tab is only visible to admins.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function SettingsSubNav() {
  const { user } = useAuth();

  return (
    <nav className={styles.subNav} aria-label="Settings section navigation">
      <div className={styles.tabList} role="list">
        {SETTINGS_TABS.map((tab) => (
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
        {user?.role === 'admin' && (
          <NavLink
            to="/settings/users"
            end
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            role="listitem"
          >
            User Management
          </NavLink>
        )}
      </div>
    </nav>
  );
}

export default SettingsSubNav;

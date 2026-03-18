import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import styles from './SettingsSubNav.module.css';

const SETTINGS_TABS = [
  { labelKey: 'subnav.settings.profile', to: '/settings/profile' },
  { labelKey: 'subnav.settings.manage', to: '/settings/manage' },
] as const;

/**
 * SettingsSubNav — horizontal tab-style navigation for the Settings section.
 *
 * Renders a scrollable row of tab links for all settings sub-pages.
 * The User Management tab is only visible to admins.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function SettingsSubNav() {
  const { t } = useTranslation('common');
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
            {t(tab.labelKey)}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink
            to="/settings/users"
            end
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            role="listitem"
          >
            {t('subnav.settings.userManagement')}
          </NavLink>
        )}
      </div>
    </nav>
  );
}

export default SettingsSubNav;

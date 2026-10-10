import { routeUrl } from '@cornerstone/shared';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import { Logo } from '../Logo/Logo.js';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle.js';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation('common');
  const { user: _user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSettingsActive = location.pathname.startsWith(routeUrl('settings'));
  const sidebarClassName = [styles.sidebar, isOpen && styles.open].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClassName} data-open={isOpen}>
      <Link
        to={routeUrl('project')}
        className={styles.logoArea}
        aria-label={t('aria.goToOverview')}
      >
        <Logo size={32} className={styles.logo} />
        <span className={styles.logoText}>{t('appName')}</span>
      </Link>
      <nav className={styles.nav} aria-label={t('aria.mainNavigation')}>
        <NavLink
          to={routeUrl('project')}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.project')}
        </NavLink>
        <NavLink
          to={routeUrl('budget')}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.budget')}
        </NavLink>
        <NavLink
          to={routeUrl('schedule')}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.schedule')}
        </NavLink>
        <NavLink
          to={routeUrl('diary')}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.diary')}
        </NavLink>
        <NavLink
          to={routeUrl('photos')}
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.photos')}
        </NavLink>
      </nav>
      <div className={styles.sidebarFooter}>
        <ThemeToggle />
        <button
          type="button"
          className={`${styles.logoutButton} ${isSettingsActive ? styles.active : ''}`}
          aria-current={isSettingsActive ? 'page' : undefined}
          onClick={() => {
            navigate(routeUrl('settings'));
            onClose();
          }}
        >
          {t('nav.settings')}
        </button>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => {
            void logout().then(() => onClose());
          }}
        >
          {t('button.logout')}
        </button>
        <div className={styles.projectInfo}>
          <span>
            {t('appName')} v{__APP_VERSION__}
          </span>
          <a
            href="https://github.com/steilerDev/cornerstone"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.githubLink}
          >
            GitHub
          </a>
        </div>
      </div>
    </aside>
  );
}

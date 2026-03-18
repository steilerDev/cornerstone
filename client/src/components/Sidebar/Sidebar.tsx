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
  const sidebarClassName = [styles.sidebar, isOpen && styles.open].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClassName} data-open={isOpen}>
      <Link to="/project" className={styles.logoArea} aria-label={t('aria.goToOverview')}>
        <Logo size={32} className={styles.logo} />
        <span className={styles.logoText}>{t('appName')}</span>
      </Link>
      <div className={styles.sidebarHeader}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label={t('aria.closeMenu')}
        >
          ✕
        </button>
      </div>
      <nav className={styles.nav} aria-label="Main navigation">
        <NavLink
          to="/project"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.project')}
        </NavLink>
        <NavLink
          to="/budget"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.budget')}
        </NavLink>
        <NavLink
          to="/schedule"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.schedule')}
        </NavLink>
        <NavLink
          to="/diary"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          {t('nav.diary')}
        </NavLink>
      </nav>
      <div className={styles.sidebarFooter}>
        <ThemeToggle />
        <button
          type="button"
          className={`${styles.logoutButton} ${location.pathname.startsWith('/settings') ? styles.active : ''}`}
          onClick={() => {
            navigate('/settings');
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

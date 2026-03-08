import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { Logo } from '../Logo/Logo.js';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle.js';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user: _user, logout } = useAuth();
  const sidebarClassName = [styles.sidebar, isOpen && styles.open].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClassName} data-open={isOpen}>
      <Link to="/project" className={styles.logoArea} aria-label="Go to project overview">
        <Logo size={32} className={styles.logo} />
        <span className={styles.logoText}>Cornerstone</span>
      </Link>
      <div className={styles.sidebarHeader}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close menu"
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
          Project
        </NavLink>
        <NavLink
          to="/budget"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Budget
        </NavLink>
        <NavLink
          to="/schedule"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Schedule
        </NavLink>
      </nav>
      <div className={styles.sidebarFooter}>
        <ThemeToggle />
        <NavLink
          to="/settings"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Settings
        </NavLink>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => {
            void logout().then(() => onClose());
          }}
        >
          Logout
        </button>
        <div className={styles.projectInfo}>
          <span>Cornerstone v{__APP_VERSION__}</span>
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

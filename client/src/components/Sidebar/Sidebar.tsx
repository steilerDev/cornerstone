import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.js';
import { Logo } from '../Logo/Logo.js';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const sidebarClassName = [styles.sidebar, isOpen && styles.open].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClassName} data-open={isOpen}>
      <div className={styles.logoArea}>
        <Logo size={32} className={styles.logo} />
        <span className={styles.logoText}>Cornerstone</span>
      </div>
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
          to="/"
          end
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/work-items"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Work Items
        </NavLink>
        <NavLink
          to="/budget"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Budget
        </NavLink>
        <NavLink
          to="/timeline"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Timeline
        </NavLink>
        <NavLink
          to="/household-items"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Household Items
        </NavLink>
        <NavLink
          to="/documents"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Documents
        </NavLink>
        <NavLink
          to="/tags"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Tags
        </NavLink>
        <div className={styles.navSeparator} />
        <NavLink
          to="/profile"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Profile
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
            onClick={onClose}
          >
            User Management
          </NavLink>
        )}
        <div className={styles.navSeparator} />
        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => {
            void logout().then(() => onClose());
          }}
        >
          Logout
        </button>
      </nav>
    </aside>
  );
}

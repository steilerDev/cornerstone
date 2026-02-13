import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const sidebarClassName = [styles.sidebar, isOpen && styles.open].filter(Boolean).join(' ');

  return (
    <aside className={sidebarClassName}>
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
        <div className={styles.navSeparator} />
        <NavLink
          to="/profile"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          Profile
        </NavLink>
        <NavLink
          to="/admin/users"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          onClick={onClose}
        >
          User Management
        </NavLink>
      </nav>
    </aside>
  );
}

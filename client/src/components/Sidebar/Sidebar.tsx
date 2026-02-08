import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav} aria-label="Main navigation">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/work-items"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Work Items
        </NavLink>
        <NavLink
          to="/budget"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Budget
        </NavLink>
        <NavLink
          to="/timeline"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Timeline
        </NavLink>
        <NavLink
          to="/household-items"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Household Items
        </NavLink>
        <NavLink
          to="/documents"
          className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
        >
          Documents
        </NavLink>
      </nav>
    </aside>
  );
}

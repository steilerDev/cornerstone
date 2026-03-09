import { NavLink } from 'react-router-dom';
import styles from './ScheduleSubNav.module.css';

const SCHEDULE_TABS = [
  { label: 'Gantt', to: '/schedule/gantt' },
  { label: 'Calendar', to: '/schedule/calendar' },
] as const;

export function ScheduleSubNav() {
  return (
    <nav className={styles.subNav} aria-label="Schedule view navigation">
      <div className={styles.tabList} role="list">
        {SCHEDULE_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            role="listitem"
            data-testid={`schedule-view-${tab.label.toLowerCase()}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default ScheduleSubNav;

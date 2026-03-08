import type { ReactNode } from 'react';
import styles from './ScheduleSubNav.module.css';

function GanttIcon(): ReactNode {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="2" y="4" width="10" height="3" rx="1" fill="currentColor" />
      <rect x="5" y="9" width="8" height="3" rx="1" fill="currentColor" />
      <rect x="8" y="14" width="10" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}

function CalendarIcon(): ReactNode {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="2" x2="7" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="2" x2="13" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="3" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

interface ScheduleSubNavProps {
  activeView: 'gantt' | 'calendar';
  onViewChange: (view: 'gantt' | 'calendar') => void;
}

const SCHEDULE_TABS: { view: 'gantt' | 'calendar'; label: string; Icon: () => ReactNode }[] = [
  { view: 'gantt', label: 'Gantt', Icon: GanttIcon },
  { view: 'calendar', label: 'Calendar', Icon: CalendarIcon },
];

export function ScheduleSubNav({ activeView, onViewChange }: ScheduleSubNavProps) {
  return (
    <nav className={styles.subNav} aria-label="Schedule view navigation">
      <div className={styles.tabList} role="list">
        {SCHEDULE_TABS.map(({ view, label, Icon }) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              type="button"
              role="listitem"
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              aria-pressed={isActive}
              onClick={() => onViewChange(view)}
              data-testid={`schedule-view-${view}`}
            >
              <Icon />
              <span className={styles.tabLabel}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default ScheduleSubNav;

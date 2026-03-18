import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './ScheduleSubNav.module.css';

export function ScheduleSubNav() {
  const { t } = useTranslation('schedule');

  const scheduleTabs = [
    { labelKey: 'schedule.navigation.gantt', to: '/schedule/gantt' },
    { labelKey: 'schedule.navigation.calendar', to: '/schedule/calendar' },
  ] as const;

  return (
    <nav className={styles.subNav} aria-label={t('schedule.navigation.gantt')}>
      <div className={styles.tabList} role="list">
        {scheduleTabs.map((tab) => {
          const label = t(tab.labelKey);
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
              role="listitem"
              data-testid={`schedule-view-${tab.labelKey.split('.').pop()!.toLowerCase()}`}
            >
              {label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default ScheduleSubNav;

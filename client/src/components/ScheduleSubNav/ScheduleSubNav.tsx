import { useTranslation } from 'react-i18next';
import { SubNav, type SubNavTab } from '../SubNav/SubNav.js';

export function ScheduleSubNav() {
  const { t } = useTranslation('schedule');

  const scheduleTabs: SubNavTab[] = [
    {
      labelKey: 'schedule.navigation.gantt',
      to: '/schedule/gantt',
      ns: 'schedule',
      testId: 'schedule-view-gantt',
    },
    {
      labelKey: 'schedule.navigation.calendar',
      to: '/schedule/calendar',
      ns: 'schedule',
      testId: 'schedule-view-calendar',
    },
  ];

  return <SubNav tabs={scheduleTabs} ariaLabel={t('schedule.navigation.ariaLabel')} />;
}

export default ScheduleSubNav;

import { routeUrl } from '@cornerstone/shared';
import { useTranslation } from 'react-i18next';
import { SubNav, type SubNavTab } from '../SubNav/SubNav.js';

export function ScheduleSubNav() {
  const { t: tCommon } = useTranslation('common');

  const scheduleTabs: SubNavTab[] = [
    {
      labelKey: 'schedule.navigation.gantt',
      to: routeUrl('scheduleGantt'),
      ns: 'schedule',
      testId: 'schedule-view-gantt',
    },
    {
      labelKey: 'schedule.navigation.calendar',
      to: routeUrl('scheduleCalendar'),
      ns: 'schedule',
      testId: 'schedule-view-calendar',
    },
  ];

  return <SubNav tabs={scheduleTabs} ariaLabel={tCommon('subNav.schedule')} />;
}

export default ScheduleSubNav;

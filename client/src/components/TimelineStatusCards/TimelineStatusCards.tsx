import type { TimelineResponse } from '@cornerstone/shared';
import { UpcomingMilestonesCard } from './UpcomingMilestonesCard.js';
import { WorkItemProgressCard } from './WorkItemProgressCard.js';
import { AtRiskItemsCard } from './AtRiskItemsCard.js';
import { CriticalPathCard } from './CriticalPathCard.js';
import styles from './TimelineStatusCards.module.css';

interface TimelineStatusCardsProps {
  timeline: TimelineResponse;
}

export function TimelineStatusCards({ timeline }: TimelineStatusCardsProps) {
  return (
    <div className={styles.grid}>
      <UpcomingMilestonesCard milestones={timeline.milestones} />
      <WorkItemProgressCard workItems={timeline.workItems} />
      <AtRiskItemsCard workItems={timeline.workItems} />
      <CriticalPathCard criticalPath={timeline.criticalPath} workItems={timeline.workItems} />
    </div>
  );
}

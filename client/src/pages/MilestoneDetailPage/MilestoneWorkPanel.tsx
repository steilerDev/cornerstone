import { MilestoneCountsTowardList } from './MilestoneCountsTowardList.js';
import { MilestoneWaitingForList } from './MilestoneWaitingForList.js';
import type { MilestonePanelProps } from './milestonePageTypes.js';
import styles from './MilestoneDetailPage.module.css';

/** The Work tab of the milestone page: what counts toward the milestone, then what waits for it. */
export function MilestoneWorkPanel({ milestone, refresh, originState }: MilestonePanelProps) {
  return (
    <div className={styles.panel}>
      <MilestoneCountsTowardList
        milestone={milestone}
        refresh={refresh}
        originState={originState}
      />
      <div className={styles.pageEndClearance}>
        <MilestoneWaitingForList
          milestone={milestone}
          refresh={refresh}
          originState={originState}
        />
      </div>
    </div>
  );
}

export default MilestoneWorkPanel;

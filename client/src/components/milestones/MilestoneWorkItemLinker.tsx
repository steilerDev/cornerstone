import type { WorkItemSummary } from '@cornerstone/shared';
import { WorkItemSelector } from './WorkItemSelector.js';
import styles from './MilestonePanel.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MilestoneWorkItemLinkerProps {
  milestoneId: number;
  linkedWorkItems: WorkItemSummary[];
  isLinking: boolean;
  onLink: (workItemId: string) => void;
  onUnlink: (workItemId: string) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Work item linker for milestones (edit mode).
 * Delegates search/chip UI to WorkItemSelector and handles
 * the link/unlink API calls via the provided callbacks.
 */
export function MilestoneWorkItemLinker({
  milestoneId: _milestoneId,
  linkedWorkItems,
  isLinking,
  onLink,
  onUnlink,
  onBack,
}: MilestoneWorkItemLinkerProps) {
  // Adapt WorkItemSummary[] to SelectedWorkItem[]
  const selectedItems = linkedWorkItems.map((wi) => ({ id: wi.id, name: wi.title }));

  return (
    <div className={styles.linkerContainer} data-testid="milestone-work-item-linker">
      {/* Header */}
      <div className={styles.linkerHeader}>
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          aria-label="Back to milestone detail"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 5l-5 5 5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <h3 className={styles.linkerTitle}>Linked Work Items</h3>
      </div>

      <div className={styles.dialogBody}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Linked Work Items
            <span className={styles.linkedCount}>
              {linkedWorkItems.length > 0 ? ` (${linkedWorkItems.length})` : ''}
            </span>
          </label>

          <WorkItemSelector
            selectedItems={selectedItems}
            onAdd={(item) => onLink(item.id)}
            onRemove={(id) => onUnlink(id)}
            disabled={isLinking}
          />
        </div>
      </div>
    </div>
  );
}

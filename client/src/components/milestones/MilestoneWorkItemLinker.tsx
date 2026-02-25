import type { WorkItemSummary, WorkItemDependentSummary } from '@cornerstone/shared';
import { WorkItemSelector } from './WorkItemSelector.js';
import type { SelectedWorkItem } from './WorkItemSelector.js';
import styles from './MilestonePanel.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MilestoneWorkItemLinkerProps {
  milestoneId: number;
  linkedWorkItems: WorkItemSummary[];
  /** Work items that depend on this milestone completing before they can start. */
  dependentWorkItems?: WorkItemDependentSummary[];
  isLinking: boolean;
  onLink: (workItemId: string) => void;
  onUnlink: (workItemId: string) => void;
  /** Called when a dependent work item is added. */
  onLinkDependent: (workItemId: string) => void;
  /** Called when a dependent work item is removed. */
  onUnlinkDependent: (workItemId: string) => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Work item linker for milestones (edit mode).
 * Shows two sections:
 * - Contributing Work Items: work items that feed into this milestone (editable via WorkItemSelector)
 * - Dependent Work Items: work items that require this milestone to complete first (editable via WorkItemSelector)
 *
 * Delegates search/chip UI to WorkItemSelector and handles
 * the link/unlink API calls via the provided callbacks.
 */
export function MilestoneWorkItemLinker({
  milestoneId: _milestoneId,
  linkedWorkItems,
  dependentWorkItems = [],
  isLinking,
  onLink,
  onUnlink,
  onLinkDependent,
  onUnlinkDependent,
  onBack,
}: MilestoneWorkItemLinkerProps) {
  // Adapt WorkItemSummary[] to SelectedWorkItem[]
  const selectedItems = linkedWorkItems.map((wi) => ({ id: wi.id, name: wi.title }));

  // Adapt WorkItemDependentSummary[] to SelectedWorkItem[]
  const selectedDependentItems: SelectedWorkItem[] = dependentWorkItems.map((wi) => ({
    id: wi.id,
    name: wi.title,
  }));

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
        <h3 className={styles.linkerTitle}>Manage Work Items</h3>
      </div>

      <div className={styles.dialogBody}>
        {/* Contributing Work Items — editable */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Contributing Work Items
            <span className={styles.linkedCount}>
              {linkedWorkItems.length > 0 ? ` (${linkedWorkItems.length})` : ''}
            </span>
          </label>
          <p className={styles.fieldHint}>Work items that feed into completing this milestone.</p>

          <WorkItemSelector
            selectedItems={selectedItems}
            onAdd={(item) => onLink(item.id)}
            onRemove={(id) => onUnlink(id)}
            disabled={isLinking}
          />
        </div>

        {/* Dependent Work Items — now editable */}
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>
            Dependent Work Items
            <span className={styles.linkedCount}>
              {dependentWorkItems.length > 0 ? ` (${dependentWorkItems.length})` : ''}
            </span>
          </label>
          <p className={styles.fieldHint}>
            Work items that require this milestone to complete before they can start.
          </p>

          <WorkItemSelector
            selectedItems={selectedDependentItems}
            onAdd={(item) => onLinkDependent(item.id)}
            onRemove={(id) => onUnlinkDependent(id)}
            disabled={isLinking}
          />
        </div>
      </div>
    </div>
  );
}

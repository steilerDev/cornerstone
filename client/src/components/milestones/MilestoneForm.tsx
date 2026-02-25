import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  MilestoneSummary,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
} from '@cornerstone/shared';
import { WorkItemSelector } from './WorkItemSelector.js';
import type { SelectedWorkItem } from './WorkItemSelector.js';
import styles from './MilestonePanel.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MilestoneFormProps {
  /** Existing milestone for edit mode. Null = create mode. */
  milestone: MilestoneSummary | null;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: (data: CreateMilestoneRequest | UpdateMilestoneRequest) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a full ISO timestamp as YYYY-MM-DD for date inputs. */
function toDateInputValue(isoTimestamp: string | null): string {
  if (!isoTimestamp) return '';
  // ISO timestamps can be YYYY-MM-DDTHH:mm:ssZ or just YYYY-MM-DD
  return isoTimestamp.slice(0, 10);
}

/** Format a date for display. */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MilestoneForm({
  milestone,
  isSubmitting,
  submitError,
  onSubmit,
  onCancel,
}: MilestoneFormProps) {
  const isEditMode = milestone !== null;

  const [title, setTitle] = useState(milestone?.title ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [targetDate, setTargetDate] = useState(milestone?.targetDate ?? '');
  const [isCompleted, setIsCompleted] = useState(milestone?.isCompleted ?? false);

  // Work items to link — only used in create mode
  const [selectedWorkItems, setSelectedWorkItems] = useState<SelectedWorkItem[]>([]);

  // Validation errors
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;

    if (!title.trim()) {
      setTitleError('Milestone name is required');
      valid = false;
    } else {
      setTitleError(null);
    }

    if (!targetDate) {
      setDateError('Target date is required');
      valid = false;
    } else {
      setDateError(null);
    }

    return valid;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    if (isEditMode) {
      const data: UpdateMilestoneRequest = {
        title: title.trim(),
        description: description.trim() || null,
        targetDate,
        isCompleted,
      };
      onSubmit(data);
    } else {
      const data: CreateMilestoneRequest = {
        title: title.trim(),
        description: description.trim() || null,
        targetDate,
        workItemIds:
          selectedWorkItems.length > 0 ? selectedWorkItems.map((item) => item.id) : undefined,
      };
      onSubmit(data);
    }
  }

  function handleAddWorkItem(item: SelectedWorkItem) {
    setSelectedWorkItems((prev) => {
      if (prev.some((wi) => wi.id === item.id)) return prev;
      return [...prev, item];
    });
  }

  function handleRemoveWorkItem(id: string) {
    setSelectedWorkItems((prev) => prev.filter((wi) => wi.id !== id));
  }

  // Today's date for "completed on" display
  const todayDisplay = isCompleted
    ? formatDate(
        milestone?.completedAt
          ? toDateInputValue(milestone.completedAt)
          : new Date().toISOString().slice(0, 10),
      )
    : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={isEditMode ? 'Edit milestone' : 'Create milestone'}
      data-testid="milestone-form"
    >
      <div className={styles.dialogBody}>
        {/* Name field */}
        <div className={styles.fieldGroup}>
          <label htmlFor="milestone-title" className={styles.fieldLabel}>
            Name{' '}
            <span className={styles.requiredStar} aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="milestone-title"
            type="text"
            className={`${styles.fieldInput} ${titleError ? styles.fieldInputError : ''}`}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError && e.target.value.trim()) setTitleError(null);
            }}
            placeholder="e.g., Foundation Complete"
            aria-required="true"
            aria-invalid={titleError !== null}
            aria-describedby={titleError ? 'milestone-title-error' : undefined}
            disabled={isSubmitting}
            autoFocus
          />
          {titleError !== null && (
            <span id="milestone-title-error" className={styles.fieldError} role="alert">
              {titleError}
            </span>
          )}
        </div>

        {/* Description field */}
        <div className={styles.fieldGroup}>
          <label htmlFor="milestone-description" className={styles.fieldLabel}>
            Description
          </label>
          <textarea
            id="milestone-description"
            className={styles.fieldTextarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
            disabled={isSubmitting}
          />
        </div>

        {/* Target date field */}
        <div className={styles.fieldGroup}>
          <label htmlFor="milestone-target-date" className={styles.fieldLabel}>
            Target Date{' '}
            <span className={styles.requiredStar} aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="milestone-target-date"
            type="date"
            className={`${styles.fieldInput} ${dateError ? styles.fieldInputError : ''}`}
            value={targetDate}
            onChange={(e) => {
              setTargetDate(e.target.value);
              if (dateError && e.target.value) setDateError(null);
            }}
            aria-required="true"
            aria-invalid={dateError !== null}
            aria-describedby={dateError ? 'milestone-date-error' : undefined}
            disabled={isSubmitting}
          />
          {dateError !== null && (
            <span id="milestone-date-error" className={styles.fieldError} role="alert">
              {dateError}
            </span>
          )}
        </div>

        {/* Work items selector — create mode only */}
        {!isEditMode && (
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              Linked Work Items
              {selectedWorkItems.length > 0 && (
                <span className={styles.linkedCount}> ({selectedWorkItems.length})</span>
              )}
            </label>
            <WorkItemSelector
              selectedItems={selectedWorkItems}
              onAdd={handleAddWorkItem}
              onRemove={handleRemoveWorkItem}
              disabled={isSubmitting}
            />
            <p className={styles.fieldHint}>
              Linked work items contribute to this milestone&rsquo;s projected date &mdash;
              computed from the latest end date of linked items. If the projected date exceeds the
              target date, the milestone shows as late.
            </p>
          </div>
        )}

        {/* Completed checkbox — edit mode only */}
        {isEditMode && (
          <div className={styles.fieldGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isCompleted}
                onChange={(e) => setIsCompleted(e.target.checked)}
                disabled={isSubmitting}
                aria-label="Mark as completed"
              />
              <span className={styles.checkboxText}>Mark as completed</span>
            </label>
            {isCompleted && todayDisplay !== null && (
              <p className={styles.completedDate} aria-live="polite">
                Completed on {todayDisplay}
              </p>
            )}
          </div>
        )}

        {/* API error banner */}
        {submitError !== null && (
          <div className={styles.errorBanner} role="alert">
            {submitError}
          </div>
        )}
      </div>

      <div className={styles.dialogFooter}>
        <button
          type="button"
          className={styles.buttonCancel}
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.buttonConfirm}
          disabled={isSubmitting}
          data-testid="milestone-form-submit"
        >
          {isSubmitting ? 'Saving\u2026' : isEditMode ? 'Save Changes' : 'Create Milestone'}
        </button>
      </div>
    </form>
  );
}

import type { FormEvent } from 'react';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { MilestoneDetail, WorkItemSummary } from '@cornerstone/shared';
import {
  getMilestone,
  updateMilestone,
  deleteMilestone,
  linkWorkItem,
  unlinkWorkItem,
} from '../../lib/milestonesApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate } from '../../lib/formatters.js';
import styles from './MilestoneDetailPage.module.css';

export function MilestoneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const milestoneId = id ? parseInt(id, 10) : NaN;

  const [milestone, setMilestone] = useState<MilestoneDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [is404, setIs404] = useState(false);

  // Form state for editing
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    targetDate: '',
    description: '',
    isCompleted: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Linked work items management
  const [showAddWorkItem, setShowAddWorkItem] = useState(false);
  const [availableWorkItems, setAvailableWorkItems] = useState<WorkItemSummary[]>([]);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('');
  const [isLinkingWorkItem, setIsLinkingWorkItem] = useState(false);
  const [isUnlinkingWorkItem, setIsUnlinkingWorkItem] = useState<Record<string, boolean>>({});

  // Load milestone on mount
  useEffect(() => {
    const loadMilestone = async () => {
      if (isNaN(milestoneId)) {
        setIs404(true);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const data = await getMilestone(milestoneId);
        setMilestone(data);
        setFormData({
          title: data.title,
          targetDate: data.targetDate,
          description: data.description || '',
          isCompleted: data.isCompleted,
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setIs404(true);
        } else if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError('Failed to load milestone. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadMilestone();
  }, [milestoneId]);

  // Load available work items for linking (when add work item modal opens)
  useEffect(() => {
    if (!showAddWorkItem || !milestone) {
      return;
    }

    const loadWorkItems = async () => {
      try {
        const response = await listWorkItems({ pageSize: 1000 });
        // Filter out already-linked work items
        const linkedIds = new Set(milestone.workItems.map((wi) => wi.id));
        const available = response.items.filter((item) => !linkedIds.has(item.id));
        setAvailableWorkItems(available);
      } catch (err) {
        console.error('Failed to load available work items', err);
      }
    };

    loadWorkItems();
  }, [showAddWorkItem, milestone]);

  const handleLinkWorkItem = async () => {
    if (!milestone || !selectedWorkItemId.trim()) {
      return;
    }

    setIsLinkingWorkItem(true);
    setError('');

    try {
      await linkWorkItem(milestone.id, selectedWorkItemId);
      // Reload milestone to get updated work items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
      setSelectedWorkItemId('');
      setShowAddWorkItem(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to link work item. Please try again.');
      }
    } finally {
      setIsLinkingWorkItem(false);
    }
  };

  const handleUnlinkWorkItem = async (workItemId: string) => {
    if (!milestone) return;

    setIsUnlinkingWorkItem((prev) => ({ ...prev, [workItemId]: true }));
    setError('');

    try {
      await unlinkWorkItem(milestone.id, workItemId);
      // Reload milestone to get updated work items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to unlink work item. Please try again.');
      }
    } finally {
      setIsUnlinkingWorkItem((prev) => ({ ...prev, [workItemId]: false }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement | HTMLTextAreaElement;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!milestone) return;

    if (!formData.title.trim()) {
      setError('Title is required.');
      return;
    }

    if (!formData.targetDate.trim()) {
      setError('Target date is required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await updateMilestone(milestone.id, {
        title: formData.title,
        targetDate: formData.targetDate,
        description: formData.description || null,
        isCompleted: formData.isCompleted,
      });

      setIsEditing(false);
      // Reload the milestone to reflect changes
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to save milestone. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!milestone) return;

    setIsDeleting(true);
    setError('');

    try {
      await deleteMilestone(milestone.id);
      navigate('/project/milestones');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError('Failed to delete milestone. Please try again.');
      }
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading milestone...</div>
      </div>
    );
  }

  if (is404 || !milestone) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <h2>Milestone not found</h2>
          <p>The milestone you're looking for doesn't exist.</p>
          <Link to="/project/milestones" className={styles.linkButton}>
            Back to Milestones
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <Link to="/project/milestones" className={styles.backLink}>
            ← Milestones
          </Link>
          <h1 className={styles.pageTitle}>{milestone.title}</h1>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {!isEditing ? (
        // View mode
        <div className={styles.viewCard}>
          <div className={styles.viewHeader}>
            <div className={styles.viewTitle}>
              <h2 className={styles.milestoneTitle}>{milestone.title}</h2>
              <span
                className={`${styles.statusBadge} ${
                  milestone.isCompleted ? styles.statusCompleted : styles.statusPending
                }`}
              >
                {milestone.isCompleted ? 'Completed' : 'Pending'}
              </span>
            </div>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => setIsEditing(true)}
              data-testid="edit-milestone-button"
            >
              Edit
            </button>
          </div>

          <div className={styles.viewBody}>
            <div className={styles.viewField}>
              <label className={styles.fieldLabel}>Target Date</label>
              <p className={styles.fieldValue}>{formatDate(milestone.targetDate)}</p>
            </div>

            {milestone.description && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>Description</label>
                <p className={styles.fieldValue}>{milestone.description}</p>
              </div>
            )}

            {milestone.completedAt && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>Completed At</label>
                <p className={styles.fieldValue}>{formatDate(milestone.completedAt)}</p>
              </div>
            )}

            {/* Linked Work Items Section */}
            <div className={styles.viewField}>
              <label className={styles.fieldLabel}>Linked Work Items</label>
              {milestone.workItems.length === 0 ? (
                <p className={styles.fieldValue}>No work items linked</p>
              ) : (
                <ul className={styles.linkedWorkItemsList}>
                  {milestone.workItems.map((item) => (
                    <li key={item.id} className={styles.linkedWorkItem}>
                      <Link to={`/project/work-items/${item.id}`} className={styles.workItemLink}>
                        {item.title}
                      </Link>
                      <button
                        type="button"
                        className={styles.unlinkButton}
                        onClick={() => handleUnlinkWorkItem(item.id)}
                        disabled={isUnlinkingWorkItem[item.id]}
                        title="Remove this work item from the milestone"
                        data-testid={`unlink-work-item-${item.id}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={styles.addLinkButton}
                onClick={() => setShowAddWorkItem(true)}
                data-testid="add-work-item-link-button"
              >
                + Add Work Item
              </button>
            </div>

            {milestone.dependentWorkItems.length > 0 && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>Dependent Work Items</label>
                <ul className={styles.linkedWorkItemsList}>
                  {milestone.dependentWorkItems.map((item) => (
                    <li key={item.id} className={styles.linkedWorkItem}>
                      <Link to={`/project/work-items/${item.id}`} className={styles.workItemLink}>
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className={styles.viewActions}>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="delete-milestone-button"
            >
              Delete Milestone
            </button>
          </div>
        </div>
      ) : (
        // Edit mode
        <form onSubmit={handleSave} className={styles.editCard}>
          <h2 className={styles.editTitle}>Edit Milestone</h2>

          <div className={styles.formGroup}>
            <label htmlFor="title" className={styles.label}>
              Title <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              className={styles.input}
              placeholder="Milestone title"
              required
              data-testid="milestone-title-input"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="targetDate" className={styles.label}>
              Target Date <span className={styles.required}>*</span>
            </label>
            <input
              type="date"
              id="targetDate"
              name="targetDate"
              value={formData.targetDate}
              onChange={handleInputChange}
              className={styles.input}
              required
              data-testid="milestone-target-date-input"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="description" className={styles.label}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className={styles.textarea}
              placeholder="Optional description"
              rows={4}
              data-testid="milestone-description-input"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="isCompleted" className={styles.checkboxLabel}>
              <input
                type="checkbox"
                id="isCompleted"
                name="isCompleted"
                checked={formData.isCompleted}
                onChange={handleInputChange}
                data-testid="milestone-completed-checkbox"
              />
              <span>Mark as completed</span>
            </label>
          </div>

          <div className={styles.editActions}>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={isSaving}
              data-testid="save-milestone-button"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Delete Milestone</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &quot;<strong>{milestone.title}</strong>&quot;?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={handleDelete}
                disabled={isDeleting}
                data-testid="confirm-delete-milestone"
              >
                {isDeleting ? 'Deleting...' : 'Delete Milestone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add work item link modal */}
      {showAddWorkItem && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isLinkingWorkItem && setShowAddWorkItem(false)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Add Work Item</h2>
            <div className={styles.formGroup}>
              <label htmlFor="workItemSelect" className={styles.label}>
                Select a work item to link
              </label>
              <select
                id="workItemSelect"
                className={styles.input}
                value={selectedWorkItemId}
                onChange={(e) => setSelectedWorkItemId(e.target.value)}
                disabled={isLinkingWorkItem}
                data-testid="work-item-select"
              >
                <option value="">-- Choose a work item --</option>
                {availableWorkItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              {availableWorkItems.length === 0 && (
                <p className={styles.emptyMessage}>All work items are already linked.</p>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setShowAddWorkItem(false)}
                disabled={isLinkingWorkItem}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalActionButton}
                onClick={handleLinkWorkItem}
                disabled={isLinkingWorkItem || !selectedWorkItemId}
                data-testid="confirm-link-work-item"
              >
                {isLinkingWorkItem ? 'Linking...' : 'Link Work Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MilestoneDetailPage;

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  TagResponse,
  UserResponse,
  WorkItemStatus,
  DependencyType,
} from '@cornerstone/shared';
import { createWorkItem } from '../../lib/workItemsApi.js';
import { createDependency } from '../../lib/dependenciesApi.js';
import { fetchTags, createTag } from '../../lib/tagsApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { TagPicker } from '../../components/TagPicker/TagPicker.js';
import {
  DependencySentenceBuilder,
  THIS_ITEM_ID,
  dependencyTypeToVerbs,
} from '../../components/DependencySentenceBuilder/index.js';
import styles from './WorkItemCreatePage.module.css';

interface PendingDependency {
  predecessorId: string; // THIS_ITEM_ID or real ID
  successorId: string; // THIS_ITEM_ID or real ID
  otherItemId: string; // The non-"this" item's real ID
  otherItemTitle: string;
  dependencyType: DependencyType;
}

export default function WorkItemCreatePage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkItemStatus>('not_started');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [startAfter, setStartAfter] = useState('');
  const [startBefore, setStartBefore] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Dependency state
  const [pendingDependencies, setPendingDependencies] = useState<PendingDependency[]>([]);

  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load tags and users on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [tagsResponse, usersResponse] = await Promise.all([fetchTags(), listUsers()]);
        setAvailableTags(tagsResponse.tags);
        setUsers(usersResponse.users.filter((u) => !u.deactivatedAt));
      } catch (err) {
        setError('Failed to load tags and users. Please try again.');
        console.error('Failed to load data:', err);
      } finally {
        setIsLoadingData(false);
      }
    }

    loadData();
  }, []);

  const handleCreateTag = async (name: string, color: string | null): Promise<TagResponse> => {
    const newTag = await createTag({ name, color });
    setAvailableTags((prev) => [...prev, newTag]);
    return newTag;
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Title is required';
    }

    // Validate dates
    if (startDate && endDate && startDate > endDate) {
      errors.dates = 'Start date must be before or equal to end date';
    }

    if (startAfter && startBefore && startAfter > startBefore) {
      errors.constraints = 'Start after date must be before or equal to start before date';
    }

    // Validate duration
    if (durationDays && (isNaN(Number(durationDays)) || Number(durationDays) < 0)) {
      errors.durationDays = 'Duration must be a positive number';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // IDs to exclude from pickers (already pending dependencies — use otherItemId)
  const excludedDepIds = useMemo(
    () => pendingDependencies.map((d) => d.otherItemId),
    [pendingDependencies],
  );

  const handleAddPendingDependency = (data: {
    predecessorId: string;
    successorId: string;
    dependencyType: DependencyType;
    otherItemTitle: string;
  }) => {
    const otherItemId = data.predecessorId === THIS_ITEM_ID ? data.successorId : data.predecessorId;

    // Prevent duplicates
    if (pendingDependencies.some((d) => d.otherItemId === otherItemId)) return;

    setPendingDependencies((prev) => [
      ...prev,
      {
        predecessorId: data.predecessorId,
        successorId: data.successorId,
        otherItemId,
        otherItemTitle: data.otherItemTitle,
        dependencyType: data.dependencyType,
      },
    ]);
  };

  const handleRemovePendingDependency = (otherItemId: string) => {
    setPendingDependencies((prev) => prev.filter((d) => d.otherItemId !== otherItemId));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const workItem = await createWorkItem({
        title: title.trim(),
        description: description.trim() || null,
        status,
        startDate: startDate || null,
        endDate: endDate || null,
        durationDays: durationDays ? Number(durationDays) : null,
        startAfter: startAfter || null,
        startBefore: startBefore || null,
        assignedUserId: assignedUserId || null,
        tagIds: selectedTagIds,
      });

      // Create dependencies sequentially, replacing THIS_ITEM_ID with actual ID
      const failedDeps: string[] = [];
      for (const dep of pendingDependencies) {
        try {
          const predecessorId =
            dep.predecessorId === THIS_ITEM_ID ? workItem.id : dep.predecessorId;
          const successorId = dep.successorId === THIS_ITEM_ID ? workItem.id : dep.successorId;

          await createDependency(successorId, {
            predecessorId,
            dependencyType: dep.dependencyType,
          });
        } catch {
          failedDeps.push(dep.otherItemTitle);
        }
      }

      // Navigate to detail page, optionally with error state
      if (failedDeps.length > 0) {
        navigate(
          `/work-items/${workItem.id}?depError=${encodeURIComponent(failedDeps.join(', '))}`,
        );
      } else {
        navigate(`/work-items/${workItem.id}`);
      }
    } catch (err) {
      setError('Failed to create work item. Please try again.');
      console.error('Failed to create work item:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/work-items')}
          disabled={isSubmitting}
        >
          ← Back to Work Items
        </button>
        <h1 className={styles.title}>Create Work Item</h1>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="title" className={styles.label}>
            Title <span className={styles.required}>*</span>
          </label>
          <input
            type="text"
            id="title"
            className={`${styles.input} ${validationErrors.title ? styles.inputError : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            placeholder="Enter work item title"
          />
          {validationErrors.title && (
            <div className={styles.errorText}>{validationErrors.title}</div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            Description
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder="Describe the work to be done"
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="status" className={styles.label}>
              Status
            </label>
            <select
              id="status"
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkItemStatus)}
              disabled={isSubmitting}
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="assignedUserId" className={styles.label}>
              Assigned To
            </label>
            <select
              id="assignedUserId"
              className={styles.select}
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="startDate" className={styles.label}>
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              className={styles.input}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="endDate" className={styles.label}>
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              className={styles.input}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="durationDays" className={styles.label}>
              Duration (days)
            </label>
            <input
              type="number"
              id="durationDays"
              className={`${styles.input} ${validationErrors.durationDays ? styles.inputError : ''}`}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              disabled={isSubmitting}
              min="0"
              placeholder="0"
            />
            {validationErrors.durationDays && (
              <div className={styles.errorText}>{validationErrors.durationDays}</div>
            )}
          </div>
        </div>

        {validationErrors.dates && <div className={styles.errorText}>{validationErrors.dates}</div>}

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="startAfter" className={styles.label}>
              Start After
            </label>
            <input
              type="date"
              id="startAfter"
              className={styles.input}
              value={startAfter}
              onChange={(e) => setStartAfter(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="startBefore" className={styles.label}>
              Start Before
            </label>
            <input
              type="date"
              id="startBefore"
              className={styles.input}
              value={startBefore}
              onChange={(e) => setStartBefore(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {validationErrors.constraints && (
          <div className={styles.errorText}>{validationErrors.constraints}</div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>Tags</label>
          <TagPicker
            availableTags={availableTags}
            selectedTagIds={selectedTagIds}
            onSelectionChange={setSelectedTagIds}
            onCreateTag={handleCreateTag}
            disabled={isSubmitting}
          />
        </div>

        {/* Dependencies Section */}
        <div className={styles.formGroup}>
          <label className={styles.label}>Dependencies</label>
          <div className={styles.dependenciesSection}>
            {/* Sentence builder */}
            <DependencySentenceBuilder
              thisItemId={THIS_ITEM_ID}
              thisItemLabel="This item"
              excludeIds={excludedDepIds}
              disabled={isSubmitting}
              onAdd={handleAddPendingDependency}
            />

            {/* Pending dependencies list */}
            {pendingDependencies.length > 0 && (
              <ul className={styles.pendingDependenciesList} aria-label="Pending dependencies">
                {pendingDependencies.map((dep) => {
                  const { predecessorVerb, successorVerb } = dependencyTypeToVerbs(
                    dep.dependencyType,
                  );
                  const isThisItemPredecessor = dep.predecessorId === THIS_ITEM_ID;
                  const sentence = isThisItemPredecessor
                    ? `This item must ${predecessorVerb} before "${dep.otherItemTitle}" can ${successorVerb}`
                    : `"${dep.otherItemTitle}" must ${predecessorVerb} before this item can ${successorVerb}`;

                  return (
                    <li key={dep.otherItemId} className={styles.pendingDependencyChip}>
                      <span className={styles.chipSentence}>{sentence}</span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => handleRemovePendingDependency(dep.otherItemId)}
                        aria-label={`Remove dependency involving ${dep.otherItemTitle}`}
                        disabled={isSubmitting}
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => navigate('/work-items')}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Work Item'}
          </button>
        </div>
      </form>
    </div>
  );
}

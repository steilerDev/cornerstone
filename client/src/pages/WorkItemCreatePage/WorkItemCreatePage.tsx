import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserResponse, WorkItemStatus, DependencyType } from '@cornerstone/shared';
import { createWorkItem } from '../../lib/workItemsApi.js';
import { createDependency } from '../../lib/dependenciesApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { useAreas } from '../../hooks/useAreas.js';
import {
  DependencySentenceBuilder,
  THIS_ITEM_ID,
  dependencyTypeToVerbs,
} from '../../components/DependencySentenceBuilder/index.js';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import {
  AssignmentPicker,
  decodeAssignment,
} from '../../components/AssignmentPicker/AssignmentPicker.js';
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
  const { t } = useTranslation('workItems');
  const { areas, isLoading: areasLoading } = useAreas();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkItemStatus>('not_started');
  const [durationDays, setDurationDays] = useState('');
  const [startAfter, setStartAfter] = useState('');
  const [startBefore, setStartBefore] = useState('');
  const [areaId, setAreaId] = useState('');
  const [assignmentValue, setAssignmentValue] = useState('');

  // Dependency state
  const [pendingDependencies, setPendingDependencies] = useState<PendingDependency[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Load users and vendors on mount
  useEffect(() => {
    async function loadData() {
      setIsLoadingData(true);
      try {
        const [usersResponse, vendorsResponse] = await Promise.all([
          listUsers(),
          fetchVendors({ pageSize: 100 }),
        ]);
        setUsers(usersResponse.users.filter((u) => !u.deactivatedAt));
        setVendors(vendorsResponse.vendors);
      } catch (err) {
        setError(t('create.errors.loadFailed'));
        console.error('Failed to load data:', err);
      } finally {
        setIsLoadingData(false);
      }
    }

    loadData();
  }, [t]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = t('create.fields.titleRequiredError');
    }

    if (startAfter && startBefore && startAfter > startBefore) {
      errors.constraints = t('create.fields.constraintsError');
    }

    // Validate duration
    if (durationDays && (isNaN(Number(durationDays)) || Number(durationDays) < 0)) {
      errors.durationDays = t('create.fields.durationError');
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
      const { userId, vendorId } = decodeAssignment(assignmentValue);

      const workItem = await createWorkItem({
        title: title.trim(),
        description: description.trim() || null,
        status,
        durationDays: durationDays ? Number(durationDays) : null,
        startAfter: startAfter || null,
        startBefore: startBefore || null,
        areaId: areaId || null,
        assignedUserId: userId || null,
        assignedVendorId: vendorId || null,
        // NOTE: Story 5.9 rework — budget fields removed from work items.
        // Budget data is managed via the /api/work-items/:id/budgets endpoint.
        // NOTE: startDate/endDate are not set at creation — computed by the scheduling engine.
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
          `/project/work-items/${workItem.id}?depError=${encodeURIComponent(failedDeps.join(', '))}`,
        );
      } else {
        navigate(`/project/work-items/${workItem.id}`);
      }
    } catch (err) {
      setError(t('create.errors.createFailed'));
      console.error('Failed to create work item:', err);
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('create.loading')}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate('/project/work-items')}
          disabled={isSubmitting}
        >
          {t('create.backToWorkItems')}
        </button>
        <h1 className={styles.title}>{t('create.pageTitle')}</h1>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="title" className={styles.label}>
            {t('create.fields.title')}{' '}
            <span className={styles.required}>{t('create.fields.titleRequired')}</span>
          </label>
          <input
            type="text"
            id="title"
            className={`${styles.input} ${validationErrors.title ? styles.inputError : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            placeholder={t('create.fields.titlePlaceholder')}
          />
          {validationErrors.title && (
            <div className={styles.errorText}>{validationErrors.title}</div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description" className={styles.label}>
            {t('create.fields.description')}
          </label>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            rows={4}
            placeholder={t('create.fields.descriptionPlaceholder')}
          />
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="status" className={styles.label}>
              {t('create.fields.status')}
            </label>
            <select
              id="status"
              className={styles.select}
              value={status}
              onChange={(e) => setStatus(e.target.value as WorkItemStatus)}
              disabled={isSubmitting}
            >
              <option value="not_started">{t('create.fields.statusOptions.notStarted')}</option>
              <option value="in_progress">{t('create.fields.statusOptions.inProgress')}</option>
              <option value="completed">{t('create.fields.statusOptions.completed')}</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="area" className={styles.label}>
              {t('create.fields.area')}
            </label>
            {areasLoading ? (
              <div className={styles.select} style={{ opacity: 0.6 }}>
                {t('create.loading')}
              </div>
            ) : (
              <AreaPicker
                areas={areas}
                value={areaId}
                onChange={setAreaId}
                disabled={isSubmitting}
                nullable
              />
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="assignment" className={styles.label}>
              {t('create.fields.assignedTo')}
            </label>
            <AssignmentPicker
              id="assignment"
              users={users}
              vendors={vendors}
              value={assignmentValue}
              onChange={setAssignmentValue}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="durationDays" className={styles.label}>
              {t('create.fields.durationDays')}
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

          <div className={styles.formGroup}>
            <label htmlFor="startAfter" className={styles.label}>
              {t('create.fields.startAfter')}
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
              {t('create.fields.startBefore')}
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

        {/* Dependencies Section */}
        <div className={styles.formGroup}>
          <label className={styles.label}>{t('create.fields.dependencies')}</label>
          <div className={styles.dependenciesSection}>
            {/* Sentence builder */}
            <DependencySentenceBuilder
              thisItemId={THIS_ITEM_ID}
              thisItemLabel={t('create.thisItemLabel')}
              excludeIds={excludedDepIds}
              disabled={isSubmitting}
              onAdd={handleAddPendingDependency}
            />

            {/* Pending dependencies list */}
            {pendingDependencies.length > 0 && (
              <ul
                className={styles.pendingDependenciesList}
                aria-label={t('create.pendingDeps.ariaLabel')}
              >
                {pendingDependencies.map((dep) => {
                  const { predecessorVerb, successorVerb } = dependencyTypeToVerbs(
                    dep.dependencyType,
                  );
                  const isThisItemPredecessor = dep.predecessorId === THIS_ITEM_ID;
                  const sentence = isThisItemPredecessor
                    ? t('create.pendingDeps.thisItemPredecessor', {
                        predecessorVerb,
                        successorVerb,
                        otherItemTitle: dep.otherItemTitle,
                      })
                    : t('create.pendingDeps.otherItemPredecessor', {
                        predecessorVerb,
                        successorVerb,
                        otherItemTitle: dep.otherItemTitle,
                      });

                  return (
                    <li key={dep.otherItemId} className={styles.pendingDependencyChip}>
                      <span className={styles.chipSentence}>{sentence}</span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => handleRemovePendingDependency(dep.otherItemId)}
                        aria-label={t('create.pendingDeps.removeAriaLabel', {
                          otherItemTitle: dep.otherItemTitle,
                        })}
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
            onClick={() => navigate('/project/work-items')}
            disabled={isSubmitting}
          >
            {t('create.actions.cancel')}
          </button>
          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? t('create.actions.creating') : t('create.actions.create')}
          </button>
        </div>
      </form>
    </div>
  );
}

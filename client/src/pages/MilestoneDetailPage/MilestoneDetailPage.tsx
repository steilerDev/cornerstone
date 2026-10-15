import type { FormEvent } from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  MilestoneDetail,
  WorkItemSummary,
  WorkItemLinkedHouseholdItemSummary,
} from '@cornerstone/shared';
import {
  getMilestone,
  updateMilestone,
  deleteMilestone,
  linkWorkItem,
  unlinkWorkItem,
  fetchMilestoneLinkedHouseholdItems,
  addDependentWorkItem,
  removeDependentWorkItem,
} from '../../lib/milestonesApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { listHouseholdItems } from '../../lib/householdItemsApi.js';
import { createHouseholdItemDep, deleteHouseholdItemDep } from '../../lib/householdItemDepsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { milestoneTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeMilestoneStatus, milestoneStatusBody } from '../../lib/statusChangeApi.js';
import { milestoneDisplayStatus, milestoneStatusLabel } from '../../lib/milestoneStatusLabel.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/index.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './MilestoneDetailPage.module.css';
import { routeUrl } from '@cornerstone/shared';

interface LinkableItem {
  readonly key: string;
  readonly title: string;
  readonly kind: 'work_item' | 'household_item';
  readonly area: WorkItemSummary['area'] | null;
}

export function MilestoneDetailPage() {
  const {
    formatCurrency: _formatCurrency,
    formatDate,
    formatTime: _formatTime,
    formatDateTime: _formatDateTime,
  } = useFormatters();
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
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
  });
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact(
    'milestone',
    showDeleteConfirm && milestone ? milestone.id : null,
  );
  const statusVariants = useStatusBadgeVariants();
  const { run: runStatusChange } = useUndoableStatusChange();

  // Linked items management
  const [linkedHouseholdItems, setLinkedHouseholdItems] = useState<
    WorkItemLinkedHouseholdItemSummary[]
  >([]);
  const linkingItemRef = useRef(false);
  const [isUnlinkingItem, setIsUnlinkingItem] = useState<Record<string, boolean>>({});

  // Dependent work items management
  const managingDepsRef = useRef(false);
  const [isRemovingDep, setIsRemovingDep] = useState<Record<string, boolean>>({});

  // Compute projected date from linked work items
  const projectedDate = useMemo(() => {
    if (!milestone) return null;
    let latest: string | null = null;
    for (const wi of milestone.workItems) {
      const end = wi.projectedEndDate ?? wi.endDate;
      if (end && (!latest || end > latest)) {
        latest = end;
      }
    }
    return latest;
  }, [milestone]);

  // Compute delay in days
  const delayDays = useMemo(() => {
    if (!projectedDate || !milestone) return 0;
    const target = new Date(milestone.targetDate);
    const projected = new Date(projectedDate);
    const diff = Math.ceil((projected.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [projectedDate, milestone]);

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
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setIs404(true);
        } else if (err instanceof ApiClientError) {
          setError(translateApiError(err.error.code, tErrors));
        } else {
          setError(t('milestones.detail.error'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadMilestone();
  }, [milestoneId, t, tErrors]);

  // Load the linked household items
  useEffect(() => {
    if (!milestone) {
      return;
    }

    const loadItems = async () => {
      try {
        // Load linked household items
        const linkedHI = await fetchMilestoneLinkedHouseholdItems(milestone.id);
        setLinkedHouseholdItems(linkedHI);
      } catch (err) {
        console.error('Failed to load items', err);
      }
    };

    loadItems();
  }, [milestone]);

  const handleQuickLinkWorkItem = async (workItemId: string) => {
    if (!milestone || linkingItemRef.current) return;

    linkingItemRef.current = true;
    setError('');

    try {
      await linkWorkItem(milestone.id, workItemId);
      // Reload milestone
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedLink'));
      }
    } finally {
      linkingItemRef.current = false;
    }
  };

  const handleQuickLinkHouseholdItem = async (householdItemId: string) => {
    if (!milestone || linkingItemRef.current) return;

    linkingItemRef.current = true;
    setError('');

    try {
      await createHouseholdItemDep(householdItemId, {
        predecessorType: 'milestone',
        predecessorId: milestone.id.toString(),
      });
      // Reload linked household items
      const linkedHI = await fetchMilestoneLinkedHouseholdItems(milestone.id);
      setLinkedHouseholdItems(linkedHI);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedLink'));
      }
    } finally {
      linkingItemRef.current = false;
    }
  };

  const handleUnlinkWorkItem = async (workItemId: string) => {
    if (!milestone) return;

    setIsUnlinkingItem((prev) => ({ ...prev, [`wi-${workItemId}`]: true }));
    setError('');

    try {
      await unlinkWorkItem(milestone.id, workItemId);
      // Reload milestone to get updated work items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedUnlink'));
      }
    } finally {
      setIsUnlinkingItem((prev) => ({ ...prev, [`wi-${workItemId}`]: false }));
    }
  };

  const handleUnlinkHouseholdItem = async (householdItemId: string) => {
    if (!milestone) return;

    setIsUnlinkingItem((prev) => ({ ...prev, [`hi-${householdItemId}`]: true }));
    setError('');

    try {
      await deleteHouseholdItemDep(householdItemId, 'milestone', milestone.id.toString());
      // Reload linked household items
      const linkedHI = await fetchMilestoneLinkedHouseholdItems(milestone.id);
      setLinkedHouseholdItems(linkedHI);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedUnlink'));
      }
    } finally {
      setIsUnlinkingItem((prev) => ({ ...prev, [`hi-${householdItemId}`]: false }));
    }
  };

  const handleAddDependentWorkItem = async (workItemId: string) => {
    if (!milestone || managingDepsRef.current) return;

    managingDepsRef.current = true;
    setError('');

    try {
      await addDependentWorkItem(milestone.id, workItemId);
      // Reload milestone to get updated dependent work items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedAddDependent'));
      }
    } finally {
      managingDepsRef.current = false;
    }
  };

  const handleRemoveDependentWorkItem = async (workItemId: string) => {
    if (!milestone) return;

    setIsRemovingDep((prev) => ({ ...prev, [workItemId]: true }));
    setError('');

    try {
      await removeDependentWorkItem(milestone.id, workItemId);
      // Reload milestone to get updated dependent work items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedRemoveDependent'));
      }
    } finally {
      setIsRemovingDep((prev) => ({ ...prev, [workItemId]: false }));
    }
  };

  const addLinkedItem = (key: string) => {
    const id = key.slice(key.indexOf(':') + 1);
    if (key.startsWith('household_item:')) void handleQuickLinkHouseholdItem(id);
    else void handleQuickLinkWorkItem(id);
  };

  const searchLinkableItems = async (
    query: string,
    excluded: string[],
    signal: AbortSignal,
  ): Promise<LinkableItem[]> => {
    const q = query.trim() || undefined;
    const [workItems, householdItems] = await Promise.all([
      listWorkItems({ q, pageSize: 25 }, { signal }),
      listHouseholdItems({ q, pageSize: 25 }, { signal }),
    ]);
    const options: LinkableItem[] = [
      ...workItems.items.map((w): LinkableItem => ({
        key: `work_item:${w.id}`,
        title: w.title,
        kind: 'work_item',
        area: w.area ?? null,
      })),
      ...householdItems.items.map((h): LinkableItem => ({
        key: `household_item:${h.id}`,
        title: h.name,
        kind: 'household_item',
        area: null,
      })),
    ];
    return options.filter((o) => !excluded.includes(o.key));
  };

  const searchDependentCandidates = async (
    query: string,
    excluded: string[],
    signal: AbortSignal,
  ): Promise<WorkItemSummary[]> => {
    const { items } = await listWorkItems(
      { q: query.trim() || undefined, pageSize: 50 },
      { signal },
    );
    return items.filter((item) => !excluded.includes(item.id));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const reloadMilestone = async () => {
    if (!milestone) return;
    try {
      setMilestone(await getMilestone(milestone.id));
    } catch (err) {
      console.error('Failed to reload milestone:', err);
    }
  };

  // Status change (StatusMenu): Mark reached asks for the date; the PATCH may issue an undo token
  const handleStatusChange = async (to: 'reached' | 'not_reached', date: string | null) => {
    if (!milestone) return;
    await runStatusChange({
      request: () => changeMilestoneStatus(milestone.id, milestoneStatusBody(to, date)),
      recordName: milestone.title,
      statusLabel: tCommon(
        I18N_UNION_KEYS.statusVocabularyMilestone.key(to === 'reached' ? 'reached' : 'upcoming'),
        { days: 0 },
      ),
      dedupeKey: `milestone:${milestone.id}`,
      onChanged: () => void reloadMilestone(),
      onUndone: reloadMilestone,
    });
  };

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!milestone) return;

    if (!formData.title.trim()) {
      setError(t('milestones.create.form.title.error'));
      return;
    }

    if (!formData.targetDate.trim()) {
      setError(t('milestones.create.form.targetDate.error'));
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await updateMilestone(milestone.id, {
        title: formData.title,
        targetDate: formData.targetDate,
        description: formData.description || null,
      });

      setIsEditing(false);
      // Reload the milestone to reflect changes
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(translateApiError(err.error.code, tErrors));
      } else {
        setError(t('milestones.detail.failedSave'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!milestone) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteMilestone(milestone.id);
      navigate(routeUrl('milestones'), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else {
        setDeleteError(t('milestones.detail.failedDelete'));
      }
      setIsDeleting(false);
    }
  };

  const displayStatus = milestoneDisplayStatus({
    isCompleted: milestone?.isCompleted ?? false,
    targetDate: milestone?.targetDate ?? '',
    projectedDate,
  });
  const displayStatusLabel = milestoneStatusLabel(tCommon, {
    isCompleted: milestone?.isCompleted ?? false,
    targetDate: milestone?.targetDate ?? '',
    projectedDate,
  });
  const displayTitle = milestone?.title.trim() || tCommon('navigation.untitledMilestone');
  const h1Text = isLoading
    ? tCommon('navigation.milestone')
    : is404 || !milestone
      ? t('milestones.detail.notFound')
      : displayTitle;
  useDocumentTitle(h1Text);
  const originState = useOriginState(milestone && !isLoading ? displayTitle : undefined);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={styles.pageTitle}>{h1Text}</h1>
        <div className={styles.loading}>{t('milestones.detail.loading')}</div>
      </div>
    );
  }

  if (is404 || !milestone) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <div className={styles.notFound}>
          <h1>{h1Text}</h1>
          <p>{t('milestones.detail.notFoundMessage')}</p>
          <Link to={routeUrl('milestones')} className={styles.linkButton}>
            {tCommon('navigation.backTo', { origin: tCommon('navigation.milestones') })}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageBreadcrumbs />
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{displayTitle}</h1>
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
              <StatusMenu
                testId="milestone-status"
                transitions={milestoneTransitions(tCommon, {
                  isCompleted: milestone.isCompleted,
                  targetDate: milestone.targetDate,
                })}
                badge={{
                  variants: {
                    ...statusVariants.milestone,
                    [displayStatus.status]: {
                      ...statusVariants.milestone[displayStatus.status],
                      label: displayStatusLabel,
                    },
                  },
                  value: displayStatus.status,
                }}
                currentLabel={displayStatusLabel}
                onApply={handleStatusChange}
              />
            </div>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => setIsEditing(true)}
              data-testid="edit-milestone-button"
            >
              {t('milestones.detail.editButton')}
            </button>
          </div>

          <div className={styles.viewBody}>
            <div className={styles.viewField}>
              <label className={styles.fieldLabel}>{t('milestones.detail.view.targetDate')}</label>
              <p className={styles.fieldValue}>{formatDate(milestone.targetDate)}</p>
            </div>

            {projectedDate && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>
                  {t('milestones.detail.view.projectedDate')}
                </label>
                <p className={styles.fieldValue}>
                  {formatDate(projectedDate)}
                  {delayDays > 0 && (
                    <span className={styles.delayBadge}>
                      {delayDays}{' '}
                      {delayDays !== 1
                        ? t('milestones.detail.delay.days')
                        : t('milestones.detail.delay.day')}{' '}
                      {t('milestones.detail.delay.late')}
                    </span>
                  )}
                  {delayDays < 0 && (
                    <span className={styles.aheadBadge}>
                      {Math.abs(delayDays)}{' '}
                      {Math.abs(delayDays) !== 1
                        ? t('milestones.detail.delay.days')
                        : t('milestones.detail.delay.day')}{' '}
                      {t('milestones.detail.delay.ahead')}
                    </span>
                  )}
                </p>
              </div>
            )}

            {milestone.description && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>
                  {t('milestones.detail.view.description')}
                </label>
                <p className={styles.fieldValue}>{milestone.description}</p>
              </div>
            )}

            {milestone.completedAt && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>
                  {t('milestones.detail.view.completedAt')}
                </label>
                <p className={styles.fieldValue}>{formatDate(milestone.completedAt)}</p>
              </div>
            )}

            {/* Linked Items Section */}
            <div className={styles.viewField}>
              <label className={styles.fieldLabel}>{t('milestones.detail.linkedItems')}</label>
              {milestone.workItems.length === 0 && linkedHouseholdItems.length === 0 ? (
                <p className={styles.fieldValue}>{t('milestones.detail.noItemsLinked')}</p>
              ) : (
                <ul className={styles.linkedWorkItemsList}>
                  {milestone.workItems.map((item) => (
                    <li key={`wi-${item.id}`} className={styles.linkedWorkItem}>
                      <span className={styles.itemTypeBadge}>
                        {t('milestones.detail.workItem')}
                      </span>
                      <div className={styles.workItemTitleCell}>
                        <Link
                          to={routeUrl('workItem', { id: item.id })}
                          state={originState}
                          className={styles.workItemLink}
                        >
                          {item.title}
                        </Link>
                        <AreaBreadcrumb area={item.area ?? null} variant="compact" />
                      </div>
                      <button
                        type="button"
                        className={styles.unlinkButton}
                        onClick={() => handleUnlinkWorkItem(item.id)}
                        disabled={isUnlinkingItem[`wi-${item.id}`]}
                        title={t('milestones.detail.unlinkButton')}
                        data-testid={`unlink-work-item-${item.id}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                  {linkedHouseholdItems.map((item) => (
                    <li key={`hi-${item.id}`} className={styles.linkedWorkItem}>
                      <span className={styles.itemTypeBadge}>
                        {t('milestones.detail.householdItem')}
                      </span>
                      <Link
                        to={routeUrl('householdItem', { id: item.id })}
                        state={originState}
                        className={styles.workItemLink}
                      >
                        {item.name}
                      </Link>
                      <button
                        type="button"
                        className={styles.unlinkButton}
                        onClick={() => handleUnlinkHouseholdItem(item.id)}
                        disabled={isUnlinkingItem[`hi-${item.id}`]}
                        title={t('milestones.detail.unlinkHouseholdButton')}
                        data-testid={`unlink-household-item-${item.id}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Inline search to add items (server search) */}
              <div className={styles.inlineSearch}>
                <SearchPicker<LinkableItem>
                  id="milestone-link-search"
                  value=""
                  onChange={() => {}}
                  onSelectItem={(option) => addLinkedItem(option.id)}
                  clearOnSelect
                  excludeIds={[
                    ...milestone.workItems.map((w) => `work_item:${w.id}`),
                    ...linkedHouseholdItems.map((h) => `household_item:${h.id}`),
                  ]}
                  placeholder={t('milestones.detail.searchPlaceholder')}
                  inputAriaProps={{ 'aria-label': t('milestones.detail.searchPlaceholder') }}
                  noResultsMessage={t('milestones.detail.noMatches')}
                  searchFn={searchLinkableItems}
                  renderItem={(o) => ({ id: o.key, label: o.title })}
                  renderSecondary={(o) => (
                    <>
                      <span className={styles.itemTypeBadge}>
                        {o.kind === 'work_item'
                          ? t('milestones.detail.workItem')
                          : t('milestones.detail.householdItem')}
                      </span>
                      {o.kind === 'work_item' && <AreaBreadcrumb area={o.area} variant="compact" />}
                    </>
                  )}
                />
              </div>
            </div>

            <div className={styles.viewField} data-testid="dependent-items-section">
              <label className={styles.fieldLabel}>{t('milestones.detail.dependentItems')}</label>
              {milestone.dependentWorkItems.length > 0 && (
                <ul className={styles.linkedWorkItemsList}>
                  {milestone.dependentWorkItems.map((item) => (
                    <li key={item.id} className={styles.linkedWorkItem}>
                      <Link
                        to={routeUrl('workItem', { id: item.id })}
                        state={originState}
                        className={styles.workItemLink}
                      >
                        {item.title}
                      </Link>
                      <button
                        type="button"
                        className={styles.unlinkButton}
                        onClick={() => handleRemoveDependentWorkItem(item.id)}
                        disabled={isRemovingDep[item.id]}
                        title={t('milestones.detail.removeDependentButton')}
                        data-testid={`remove-dep-work-item-${item.id}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {milestone.dependentWorkItems.length === 0 && (
                <p className={styles.emptyMessage}>{t('milestones.detail.noDependentItems')}</p>
              )}

              {/* Inline search to add dependent work items (server search) */}
              <div className={styles.inlineSearch}>
                <SearchPicker<WorkItemSummary>
                  id="milestone-dependent-search"
                  value=""
                  onChange={() => {}}
                  onSelectItem={(option) => void handleAddDependentWorkItem(option.id)}
                  clearOnSelect
                  excludeIds={[
                    ...milestone.dependentWorkItems.map((d) => d.id),
                    ...milestone.workItems.map((w) => w.id),
                  ]}
                  placeholder={t('milestones.detail.depSearchPlaceholder')}
                  inputAriaProps={{ 'aria-label': t('milestones.detail.depSearchPlaceholder') }}
                  noResultsMessage={t('milestones.detail.noDepMatches')}
                  searchFn={searchDependentCandidates}
                  renderItem={(item) => ({ id: item.id, label: item.title })}
                />
              </div>
            </div>
          </div>

          <div className={styles.viewActions}>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="delete-milestone-button"
            >
              {t('milestones.detail.deleteButton')}
            </button>
          </div>
        </div>
      ) : (
        // Edit mode
        <form onSubmit={handleSave} className={styles.editCard} noValidate>
          <h2 className={styles.editTitle}>{t('milestones.detail.form.title')}</h2>

          <div className={styles.formGroup}>
            <label htmlFor="title" className={styles.label}>
              {t('milestones.detail.form.titleLabel')} <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              className={styles.input}
              placeholder={t('milestones.detail.form.placeholderTitle')}
              required
              data-testid="milestone-title-input"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="targetDate" className={styles.label}>
              {t('milestones.detail.form.targetDateLabel')}{' '}
              <span className={styles.required}>*</span>
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
              {t('milestones.detail.form.descriptionLabel')}
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className={styles.textarea}
              placeholder={t('milestones.detail.form.placeholderDescription')}
              rows={4}
              data-testid="milestone-description-input"
            />
          </div>

          <div className={styles.editActions}>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={isSaving}
              data-testid="save-milestone-button"
            >
              {isSaving ? t('milestones.detail.form.saving') : t('milestones.detail.form.save')}
            </button>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              {t('milestones.detail.form.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: milestone.title })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeleting}
          error={deleteError}
          blocked={deleteBlocked}
          onConfirm={() => void handleDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
          testIdPrefix="milestone-delete"
        />
      )}
    </div>
  );
}

export default MilestoneDetailPage;

import type { FormEvent } from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
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
import { formatDate } from '../../lib/formatters.js';
import styles from './MilestoneDetailPage.module.css';

export function MilestoneDetailPage() {
  const { t } = useTranslation('schedule');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const locationState = location.state as { from?: string; view?: string } | null;
  const fromSchedule = locationState?.from === 'schedule';
  const fromView = locationState?.view;

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

  // Linked items management
  const [itemSearchInput, setItemSearchInput] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [availableWorkItems, setAvailableWorkItems] = useState<WorkItemSummary[]>([]);
  const [availableHouseholdItems, setAvailableHouseholdItems] = useState<
    WorkItemLinkedHouseholdItemSummary[]
  >([]);
  const [linkedHouseholdItems, setLinkedHouseholdItems] = useState<
    WorkItemLinkedHouseholdItemSummary[]
  >([]);
  const [isLinkingItem, setIsLinkingItem] = useState(false);
  const [isUnlinkingItem, setIsUnlinkingItem] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dependent work items management
  const [depSearchInput, setDepSearchInput] = useState('');
  const [showDepDropdown, setShowDepDropdown] = useState(false);
  const [isManagingDeps, setIsManagingDeps] = useState(false);
  const [isRemovingDep, setIsRemovingDep] = useState<Record<string, boolean>>({});
  const depDropdownRef = useRef<HTMLDivElement>(null);

  // Compute projected date from linked work items
  const projectedDate = useMemo(() => {
    if (!milestone) return null;
    let latest: string | null = null;
    for (const wi of milestone.workItems) {
      if (wi.endDate && (!latest || wi.endDate > latest)) {
        latest = wi.endDate;
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
          isCompleted: data.isCompleted,
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setIs404(true);
        } else if (err instanceof ApiClientError) {
          setError(err.error.message);
        } else {
          setError(t('milestones.detail.error'));
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadMilestone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestoneId, t]);

  // Load available work items and household items, and linked household items
  useEffect(() => {
    if (!milestone) {
      return;
    }

    const loadItems = async () => {
      try {
        // Load available work items
        const workItemsResponse = await listWorkItems({ pageSize: 100 });
        const linkedWorkItemIds = new Set(milestone.workItems.map((wi) => wi.id));
        const availableWI = workItemsResponse.items.filter(
          (item) => !linkedWorkItemIds.has(item.id),
        );
        setAvailableWorkItems(availableWI);

        // Load available household items
        const householdItemsResponse = await listHouseholdItems({ pageSize: 100 });
        const linkedHouseholdItemIds = new Set(linkedHouseholdItems.map((hi) => hi.id));
        const availableHI = householdItemsResponse.items.filter(
          (item) => !linkedHouseholdItemIds.has(item.id),
        );
        setAvailableHouseholdItems(availableHI);

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
    if (!milestone) return;

    setIsLinkingItem(true);
    setError('');

    try {
      await linkWorkItem(milestone.id, workItemId);
      // Reload milestone and available items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
      setItemSearchInput('');
      setShowItemDropdown(false);
      // Reload available items and linked household items
      const workItemsResponse = await listWorkItems({ pageSize: 100 });
      const linkedWorkItemIds = new Set(updated.workItems.map((wi) => wi.id));
      const availableWI = workItemsResponse.items.filter((item) => !linkedWorkItemIds.has(item.id));
      setAvailableWorkItems(availableWI);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('milestones.detail.failedLink'));
      }
    } finally {
      setIsLinkingItem(false);
    }
  };

  const handleQuickLinkHouseholdItem = async (householdItemId: string) => {
    if (!milestone) return;

    setIsLinkingItem(true);
    setError('');

    try {
      await createHouseholdItemDep(householdItemId, {
        predecessorType: 'milestone',
        predecessorId: milestone.id.toString(),
      });
      setItemSearchInput('');
      setShowItemDropdown(false);
      // Reload linked household items and available items
      const linkedHI = await fetchMilestoneLinkedHouseholdItems(milestone.id);
      setLinkedHouseholdItems(linkedHI);
      const householdItemsResponse = await listHouseholdItems({ pageSize: 100 });
      const linkedHouseholdItemIds = new Set(linkedHI.map((hi) => hi.id));
      const availableHI = householdItemsResponse.items.filter(
        (item) => !linkedHouseholdItemIds.has(item.id),
      );
      setAvailableHouseholdItems(availableHI);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('milestones.detail.failedLink'));
      }
    } finally {
      setIsLinkingItem(false);
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
      // Reload available work items
      const workItemsResponse = await listWorkItems({ pageSize: 100 });
      const linkedWorkItemIds = new Set(updated.workItems.map((wi) => wi.id));
      const availableWI = workItemsResponse.items.filter((item) => !linkedWorkItemIds.has(item.id));
      setAvailableWorkItems(availableWI);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
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
      // Reload linked household items and available items
      const linkedHI = await fetchMilestoneLinkedHouseholdItems(milestone.id);
      setLinkedHouseholdItems(linkedHI);
      const householdItemsResponse = await listHouseholdItems({ pageSize: 100 });
      const linkedHouseholdItemIds = new Set(linkedHI.map((hi) => hi.id));
      const availableHI = householdItemsResponse.items.filter(
        (item) => !linkedHouseholdItemIds.has(item.id),
      );
      setAvailableHouseholdItems(availableHI);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('milestones.detail.failedUnlink'));
      }
    } finally {
      setIsUnlinkingItem((prev) => ({ ...prev, [`hi-${householdItemId}`]: false }));
    }
  };

  const handleAddDependentWorkItem = async (workItemId: string) => {
    if (!milestone) return;

    setIsManagingDeps(true);
    setError('');

    try {
      await addDependentWorkItem(milestone.id, workItemId);
      // Reload milestone to get updated dependent work items
      const updated = await getMilestone(milestone.id);
      setMilestone(updated);
      setDepSearchInput('');
      setShowDepDropdown(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.error.message);
      } else {
        setError(t('milestones.detail.failedAddDependent'));
      }
    } finally {
      setIsManagingDeps(false);
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
        setError(err.error.message);
      } else {
        setError(t('milestones.detail.failedRemoveDependent'));
      }
    } finally {
      setIsRemovingDep((prev) => ({ ...prev, [workItemId]: false }));
    }
  };

  // Handle click outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowItemDropdown(false);
      }
    };

    if (showItemDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [showItemDropdown]);

  // Handle click outside dependent items dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (depDropdownRef.current && !depDropdownRef.current.contains(event.target as Node)) {
        setShowDepDropdown(false);
      }
    };

    if (showDepDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  }, [showDepDropdown]);

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
        setError(t('milestones.detail.failedSave'));
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
        setError(t('milestones.detail.failedDelete'));
      }
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>{t('milestones.detail.loading')}</div>
      </div>
    );
  }

  if (is404 || !milestone) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <h2>{t('milestones.detail.notFound')}</h2>
          <p>{t('milestones.detail.notFoundMessage')}</p>
          <Link to="/project/milestones" className={styles.linkButton}>
            {t('milestones.detail.backLink')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.navButtons}>
          {fromSchedule ? (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate(fromView ? `/schedule?view=${fromView}` : '/schedule')}
              >
                {t('milestones.detail.backToSchedule')}
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/project/milestones')}
              >
                {t('milestones.detail.toMilestones')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate('/project/milestones')}
              >
                {t('milestones.detail.backButton')}
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/schedule')}
              >
                {t('milestones.detail.toSchedule')}
              </button>
            </>
          )}
        </div>

        <h1 className={styles.pageTitle}>{milestone.title}</h1>
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
                {milestone.isCompleted ? t('milestones.detail.view.status.completed') : t('milestones.detail.view.status.pending')}
              </span>
            </div>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => setIsEditing(true)}
              data-testid="edit-milestone-button"
            >
              {t('milestones.detail.edit')}
            </button>
          </div>

          <div className={styles.viewBody}>
            <div className={styles.viewField}>
              <label className={styles.fieldLabel}>{t('milestones.detail.view.targetDate')}</label>
              <p className={styles.fieldValue}>{formatDate(milestone.targetDate)}</p>
            </div>

            {projectedDate && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>{t('milestones.detail.view.projectedDate')}</label>
                <p className={styles.fieldValue}>
                  {formatDate(projectedDate)}
                  {delayDays > 0 && (
                    <span className={styles.delayBadge}>
                      {delayDays} {delayDays !== 1 ? t('milestones.detail.delay.days') : t('milestones.detail.delay.day')} {t('milestones.detail.delay.late')}
                    </span>
                  )}
                  {delayDays < 0 && (
                    <span className={styles.aheadBadge}>
                      {Math.abs(delayDays)} {Math.abs(delayDays) !== 1 ? t('milestones.detail.delay.days') : t('milestones.detail.delay.day')} {t('milestones.detail.delay.ahead')}
                    </span>
                  )}
                </p>
              </div>
            )}

            {milestone.description && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>{t('milestones.detail.view.description')}</label>
                <p className={styles.fieldValue}>{milestone.description}</p>
              </div>
            )}

            {milestone.completedAt && (
              <div className={styles.viewField}>
                <label className={styles.fieldLabel}>{t('milestones.detail.view.completedAt')}</label>
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
                      <span className={styles.itemTypeBadge}>{t('milestones.detail.workItem')}</span>
                      <Link to={`/project/work-items/${item.id}`} className={styles.workItemLink}>
                        {item.title}
                      </Link>
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
                      <span className={styles.itemTypeBadge}>{t('milestones.detail.householdItem')}</span>
                      <Link
                        to={`/project/household-items/${item.id}`}
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

              {/* Inline search to add items */}
              <div className={styles.inlineSearch} ref={dropdownRef}>
                <input
                  type="text"
                  placeholder={t('milestones.detail.searchPlaceholder')}
                  value={itemSearchInput}
                  onChange={(e) => {
                    setItemSearchInput(e.target.value);
                    setShowItemDropdown(true);
                  }}
                  onFocus={() => setShowItemDropdown(true)}
                  className={styles.searchInput}
                  data-testid="item-search-input"
                  disabled={isLinkingItem}
                />
                {showItemDropdown && itemSearchInput.trim() && (
                  <div className={styles.searchDropdown}>
                    {/* Filter and show matching work items */}
                    {availableWorkItems
                      .filter((item) =>
                        item.title.toLowerCase().includes(itemSearchInput.toLowerCase()),
                      )
                      .map((item) => (
                        <button
                          key={`wi-${item.id}`}
                          type="button"
                          className={styles.searchDropdownItem}
                          onClick={() => handleQuickLinkWorkItem(item.id)}
                          disabled={isLinkingItem}
                        >
                          <span className={styles.itemTypeBadge}>{t('milestones.detail.workItem')}</span>
                          <span>{item.title}</span>
                        </button>
                      ))}
                    {/* Filter and show matching household items */}
                    {availableHouseholdItems
                      .filter((item) =>
                        item.name.toLowerCase().includes(itemSearchInput.toLowerCase()),
                      )
                      .map((item) => (
                        <button
                          key={`hi-${item.id}`}
                          type="button"
                          className={styles.searchDropdownItem}
                          onClick={() => handleQuickLinkHouseholdItem(item.id)}
                          disabled={isLinkingItem}
                        >
                          <span className={styles.itemTypeBadge}>{t('milestones.detail.householdItem')}</span>
                          <span>{item.name}</span>
                        </button>
                      ))}
                    {availableWorkItems.filter((item) =>
                      item.title.toLowerCase().includes(itemSearchInput.toLowerCase()),
                    ).length === 0 &&
                      availableHouseholdItems.filter((item) =>
                        item.name.toLowerCase().includes(itemSearchInput.toLowerCase()),
                      ).length === 0 && (
                        <div className={styles.searchDropdownEmpty}>{t('milestones.detail.noMatches')}</div>
                      )}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.viewField} data-testid="dependent-items-section">
              <label className={styles.fieldLabel}>{t('milestones.detail.dependentItems')}</label>
              {milestone.dependentWorkItems.length > 0 && (
                <ul className={styles.linkedWorkItemsList}>
                  {milestone.dependentWorkItems.map((item) => (
                    <li key={item.id} className={styles.linkedWorkItem}>
                      <Link to={`/project/work-items/${item.id}`} className={styles.workItemLink}>
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

              {/* Inline search to add dependent work items */}
              <div className={styles.inlineSearch} ref={depDropdownRef}>
                <input
                  type="text"
                  placeholder={t('milestones.detail.depSearchPlaceholder')}
                  value={depSearchInput}
                  onChange={(e) => {
                    setDepSearchInput(e.target.value);
                    setShowDepDropdown(true);
                  }}
                  onFocus={() => setShowDepDropdown(true)}
                  className={styles.searchInput}
                  data-testid="dep-search-input"
                  disabled={isManagingDeps}
                />
                {showDepDropdown && depSearchInput.trim() && (
                  <div className={styles.searchDropdown}>
                    {availableWorkItems
                      .filter((item) =>
                        item.title.toLowerCase().includes(depSearchInput.toLowerCase()),
                      )
                      .filter(
                        (item) => !milestone.dependentWorkItems.find((dep) => dep.id === item.id),
                      )
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={styles.searchDropdownItem}
                          onClick={() => handleAddDependentWorkItem(item.id)}
                          disabled={isManagingDeps}
                        >
                          <span>{item.title}</span>
                        </button>
                      ))}
                    {availableWorkItems
                      .filter((item) =>
                        item.title.toLowerCase().includes(depSearchInput.toLowerCase()),
                      )
                      .filter(
                        (item) => !milestone.dependentWorkItems.find((dep) => dep.id === item.id),
                      ).length === 0 && (
                      <div className={styles.searchDropdownEmpty}>
                        {t('milestones.detail.noDepMatches')}
                      </div>
                    )}
                  </div>
                )}
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
              {t('milestones.detail.view.deleteButton')}
            </button>
          </div>
        </div>
      ) : (
        // Edit mode
        <form onSubmit={handleSave} className={styles.editCard}>
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
              {t('milestones.detail.form.targetDateLabel')} <span className={styles.required}>*</span>
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
              <span>{t('milestones.detail.form.markCompleted')}</span>
            </label>
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

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className={styles.modal} role="dialog" aria-modal="true">
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('milestones.detail.deleteConfirm')}</h2>
            <p className={styles.modalText}>
              {t('milestones.detail.deleteMessage')} &quot;<strong>{milestone.title}</strong>&quot;?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                {t('milestones.detail.deleteCancel')}
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={handleDelete}
                disabled={isDeleting}
                data-testid="confirm-delete-milestone"
              >
                {isDeleting ? t('milestones.detail.deleting') : t('milestones.detail.deleteButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MilestoneDetailPage;

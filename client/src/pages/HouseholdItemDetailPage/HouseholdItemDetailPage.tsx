import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemCategory,
  WorkItemStatus,
  HouseholdItemBudgetLine,
  ConfidenceLevel,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
  SubsidyProgram,
  BudgetCategory,
  BudgetSource,
  Vendor,
  HouseholdItemSubsidyPaybackResponse,
  HouseholdItemWorkItemSummary,
  WorkItemSummary,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { getHouseholdItem, deleteHouseholdItem } from '../../lib/householdItemsApi.js';
import {
  fetchHouseholdItemBudgets,
  createHouseholdItemBudget,
  updateHouseholdItemBudget,
  deleteHouseholdItemBudget,
} from '../../lib/householdItemBudgetsApi.js';
import {
  fetchHouseholdItemSubsidies,
  linkHouseholdItemSubsidy,
  unlinkHouseholdItemSubsidy,
  fetchHouseholdItemSubsidyPayback,
} from '../../lib/householdItemSubsidiesApi.js';
import {
  fetchLinkedWorkItems,
  linkWorkItemToHouseholdItem,
  unlinkWorkItemFromHouseholdItem,
} from '../../lib/householdItemWorkItemsApi.js';
import { fetchBudgetCategories } from '../../lib/budgetCategoriesApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate, formatCurrency } from '../../lib/formatters.js';
import { HouseholdItemStatusBadge } from '../../components/HouseholdItemStatusBadge/HouseholdItemStatusBadge.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { LinkedDocumentsSection } from '../../components/documents/LinkedDocumentsSection.js';
import styles from './HouseholdItemDetailPage.module.css';

const CATEGORY_LABELS: Record<HouseholdItemCategory, string> = {
  furniture: 'Furniture',
  appliances: 'Appliances',
  fixtures: 'Fixtures',
  decor: 'Decor',
  electronics: 'Electronics',
  outdoor: 'Outdoor',
  storage: 'Storage',
  other: 'Other',
};

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  own_estimate: 'Own Estimate',
  professional_estimate: 'Professional Estimate',
  quote: 'Quote',
  invoice: 'Invoice',
};

const WORK_ITEM_STATUS_LABELS: Record<string, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

/** Budget line form state used for both create and edit. */
interface BudgetLineFormState {
  description: string;
  plannedAmount: string;
  confidence: ConfidenceLevel;
  budgetCategoryId: string;
  budgetSourceId: string;
  vendorId: string;
}

const EMPTY_BUDGET_FORM: BudgetLineFormState = {
  description: '',
  plannedAmount: '',
  confidence: 'own_estimate',
  budgetCategoryId: '',
  budgetSourceId: '',
  vendorId: '',
};

export function HouseholdItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [item, setItem] = useState<HouseholdItemDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Budget lines state
  const [budgetLines, setBudgetLines] = useState<HouseholdItemBudgetLine[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);

  // Budget line form state
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetLineFormState>(EMPTY_BUDGET_FORM);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [budgetFormError, setBudgetFormError] = useState<string | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);

  // Subsidy linking state
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);
  const [selectedSubsidyId, setSelectedSubsidyId] = useState('');
  const [isLinkingSubsidy, setIsLinkingSubsidy] = useState(false);

  // Subsidy payback state
  const [subsidyPayback, setSubsidyPayback] = useState<HouseholdItemSubsidyPaybackResponse | null>(
    null,
  );

  // Work item linking state
  const [linkedWorkItems, setLinkedWorkItems] = useState<HouseholdItemWorkItemSummary[]>([]);
  const [allWorkItems, setAllWorkItems] = useState<WorkItemSummary[]>([]);
  const [workItemSearchQuery, setWorkItemSearchQuery] = useState('');
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('');
  const [isLinkingWorkItem, setIsLinkingWorkItem] = useState(false);
  const [unlinkingWorkItemId, setUnlinkingWorkItemId] = useState<string | null>(null);

  // Inline error for budget/subsidy/work item operations
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!showDeleteModal) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeDeleteModal();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const focusableArray = Array.from(focusable);
        if (focusableArray.length === 0) return;
        const firstEl = focusableArray[0];
        const lastEl = focusableArray[focusableArray.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleteModal, isDeleting, deleteError]);

  const loadItem = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIs404(false);
    try {
      const data = await getHouseholdItem(id);
      setItem(data);
      // Load budget data after item is loaded
      void loadBudgetData(id);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setIs404(true);
          setError('Item not found');
        } else {
          setError(err.error.message);
        }
      } else {
        setError('Failed to load household item. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadBudgetData = async (itemId: string) => {
    try {
      const [
        budgets,
        subsidies,
        payback,
        categories,
        sources,
        vendors,
        programs,
        workItems,
        linkedWorkItemsData,
      ] = await Promise.all([
        fetchHouseholdItemBudgets(itemId),
        fetchHouseholdItemSubsidies(itemId),
        fetchHouseholdItemSubsidyPayback(itemId),
        fetchBudgetCategories(),
        fetchBudgetSources(),
        fetchVendors({ pageSize: 100 }),
        fetchSubsidyPrograms(),
        listWorkItems({ pageSize: 100 }),
        fetchLinkedWorkItems(itemId),
      ]);
      setBudgetLines(budgets);
      setLinkedSubsidies(subsidies);
      setSubsidyPayback(payback);
      setBudgetCategories(categories.categories);
      setBudgetSources(sources.budgetSources);
      setAllVendors(vendors.vendors);
      setAllSubsidyPrograms(programs.subsidyPrograms);
      setAllWorkItems(workItems.items);
      setLinkedWorkItems(linkedWorkItemsData);
    } catch (err) {
      // Non-critical — budget data failure shouldn't block the page
      console.error('Failed to load budget data:', err);
    }
  };

  const reloadBudgetLines = async () => {
    if (!id) return;
    try {
      const data = await fetchHouseholdItemBudgets(id);
      setBudgetLines(data);
    } catch (err) {
      console.error('Failed to reload budget lines:', err);
    }
  };

  const reloadLinkedSubsidies = async () => {
    if (!id) return;
    try {
      const data = await fetchHouseholdItemSubsidies(id);
      setLinkedSubsidies(data);
    } catch (err) {
      console.error('Failed to reload linked subsidies:', err);
    }
  };

  const reloadSubsidyPayback = async () => {
    if (!id) return;
    try {
      const data = await fetchHouseholdItemSubsidyPayback(id);
      setSubsidyPayback(data);
    } catch (err) {
      console.error('Failed to reload subsidy payback:', err);
    }
  };

  const reloadLinkedWorkItems = async () => {
    if (!id) return;
    try {
      const data = await fetchLinkedWorkItems(id);
      setLinkedWorkItems(data);
    } catch (err) {
      console.error('Failed to reload linked work items:', err);
    }
  };

  // ─── Work item linking handlers ────────────────────────────────────────────

  const handleLinkWorkItem = async () => {
    if (!id || !selectedWorkItemId) return;
    setIsLinkingWorkItem(true);
    setInlineError(null);
    try {
      await linkWorkItemToHouseholdItem(id, selectedWorkItemId);
      setSelectedWorkItemId('');
      setWorkItemSearchQuery('');
      await reloadLinkedWorkItems();
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError('This work item is already linked');
      } else {
        setInlineError('Failed to link work item');
      }
    } finally {
      setIsLinkingWorkItem(false);
    }
  };

  const handleUnlinkWorkItem = async () => {
    if (!id || !unlinkingWorkItemId) return;
    setInlineError(null);
    try {
      await unlinkWorkItemFromHouseholdItem(id, unlinkingWorkItemId);
      setUnlinkingWorkItemId(null);
      await reloadLinkedWorkItems();
    } catch (err) {
      setUnlinkingWorkItemId(null);
      setInlineError('Failed to unlink work item');
    }
  };

  const openDeleteModal = () => {
    setDeleteError('');
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (!isDeleting) {
      setShowDeleteModal(false);
      setDeleteError('');
    }
  };

  // ─── Budget line handlers ──────────────────────────────────────────────────

  const openAddBudgetForm = () => {
    setEditingBudgetId(null);
    setBudgetForm(EMPTY_BUDGET_FORM);
    setBudgetFormError(null);
    setShowBudgetForm(true);
  };

  const openEditBudgetForm = (line: HouseholdItemBudgetLine) => {
    setEditingBudgetId(line.id);
    setBudgetForm({
      description: line.description ?? '',
      plannedAmount: String(line.plannedAmount),
      confidence: line.confidence,
      budgetCategoryId: line.budgetCategory?.id ?? '',
      budgetSourceId: line.budgetSource?.id ?? '',
      vendorId: line.vendor?.id ?? '',
    });
    setBudgetFormError(null);
    setShowBudgetForm(true);
  };

  const closeBudgetForm = () => {
    setShowBudgetForm(false);
    setEditingBudgetId(null);
    setBudgetForm(EMPTY_BUDGET_FORM);
    setBudgetFormError(null);
  };

  const handleSaveBudgetLine = async (event: FormEvent) => {
    event.preventDefault();
    if (!id) return;

    const plannedAmount = parseFloat(budgetForm.plannedAmount);
    if (isNaN(plannedAmount) || plannedAmount < 0) {
      setBudgetFormError('Planned amount must be a valid non-negative number.');
      return;
    }

    setIsSavingBudget(true);
    setBudgetFormError(null);

    const payload: CreateHouseholdItemBudgetRequest | UpdateHouseholdItemBudgetRequest = {
      description: budgetForm.description.trim() || null,
      plannedAmount,
      confidence: budgetForm.confidence,
      budgetCategoryId: budgetForm.budgetCategoryId || null,
      budgetSourceId: budgetForm.budgetSourceId || null,
      vendorId: budgetForm.vendorId || null,
    };

    try {
      if (editingBudgetId) {
        await updateHouseholdItemBudget(
          id,
          editingBudgetId,
          payload as UpdateHouseholdItemBudgetRequest,
        );
      } else {
        await createHouseholdItemBudget(id, payload as CreateHouseholdItemBudgetRequest);
      }
      closeBudgetForm();
      await Promise.all([reloadBudgetLines(), reloadSubsidyPayback()]);
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      setBudgetFormError(apiErr.message ?? 'Failed to save budget line. Please try again.');
      console.error('Failed to save budget line:', err);
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleDeleteBudgetLine = (budgetId: string) => {
    setDeletingBudgetId(budgetId);
  };

  const confirmDeleteBudgetLine = async () => {
    if (!id || !deletingBudgetId) return;
    setInlineError(null);
    try {
      await deleteHouseholdItemBudget(id, deletingBudgetId);
      setDeletingBudgetId(null);
      await Promise.all([reloadBudgetLines(), reloadSubsidyPayback()]);
    } catch (err) {
      setDeletingBudgetId(null);
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError(apiErr.message || 'Budget line cannot be deleted because it is in use');
      } else {
        setInlineError('Failed to delete budget line');
      }
      console.error('Failed to delete budget line:', err);
    }
  };

  // ─── Subsidy linking handlers ──────────────────────────────────────────────

  const handleLinkSubsidy = async () => {
    if (!id || !selectedSubsidyId) return;
    setIsLinkingSubsidy(true);
    setInlineError(null);
    try {
      await linkHouseholdItemSubsidy(id, selectedSubsidyId);
      setSelectedSubsidyId('');
      await Promise.all([reloadLinkedSubsidies(), reloadSubsidyPayback()]);
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError('This subsidy program is already linked');
      } else {
        setInlineError('Failed to link subsidy program');
      }
      console.error('Failed to link subsidy:', err);
    } finally {
      setIsLinkingSubsidy(false);
    }
  };

  const handleUnlinkSubsidy = async (subsidyProgramId: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await unlinkHouseholdItemSubsidy(id, subsidyProgramId);
      await Promise.all([reloadLinkedSubsidies(), reloadSubsidyPayback()]);
    } catch (err) {
      setInlineError('Failed to unlink subsidy program');
      console.error('Failed to unlink subsidy:', err);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteHouseholdItem(item.id);
      showToast('success', 'Household item deleted successfully');
      navigate('/household-items');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteError(err.error.message);
      } else {
        setDeleteError('Failed to delete household item. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading} role="status">
          Loading household item...
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Item Not Found</h2>
          <p>The household item you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/household-items')}
            >
              Back to Household Items
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p>{error ?? 'Household item not found.'}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate('/household-items')}
            >
              Back to Household Items
            </button>
            <button type="button" className={styles.button} onClick={() => void loadItem()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link to="/household-items" className={styles.backLink}>
            Household Items
          </Link>
          <span className={styles.breadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <span className={styles.breadcrumbCurrent}>{item.name}</span>
        </div>

        {/* Page header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{item.name}</h1>
            <div className={styles.headerBadges}>
              <span className={styles.categoryBadge}>{CATEGORY_LABELS[item.category]}</span>
              <HouseholdItemStatusBadge status={item.status} />
            </div>
          </div>
          <div className={styles.pageActions}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => navigate(`/household-items/${item.id}/edit`)}
            >
              Edit
            </button>
            <button type="button" className={styles.deleteButton} onClick={openDeleteModal}>
              Delete
            </button>
          </div>
        </div>

        {/* Details card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Details</h2>
          </div>
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Description</dt>
              <dd className={styles.infoValue}>{item.description ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Vendor</dt>
              <dd className={styles.infoValue}>
                {item.vendor ? (
                  <Link to={`/budget/vendors/${item.vendor.id}`} className={styles.infoLink}>
                    {item.vendor.name}
                  </Link>
                ) : (
                  '\u2014'
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Product URL</dt>
              <dd className={styles.infoValue}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.infoLink}
                  >
                    {item.url}
                  </a>
                ) : (
                  '\u2014'
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Room</dt>
              <dd className={styles.infoValue}>{item.room ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Quantity</dt>
              <dd className={styles.infoValue}>{item.quantity}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Tags</dt>
              <dd className={styles.infoValue}>
                {item.tags.length > 0 ? (
                  <div className={styles.tagList}>
                    {item.tags.map((tag) => (
                      <span key={tag.id} className={styles.tagPill}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.emptyState}>No tags</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Dates & Delivery card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Dates & Delivery</h2>
          </div>
          <div className={styles.deliveryProgressContainer}>
            <ol className={styles.deliveryProgress} aria-label="Delivery progress">
              {(['not_ordered', 'ordered', 'in_transit', 'delivered'] as const).map(
                (stepStatus, index) => {
                  const stepLabels = {
                    not_ordered: 'Not Ordered',
                    ordered: 'Ordered',
                    in_transit: 'In Transit',
                    delivered: 'Delivered',
                  };

                  const statusOrder = {
                    not_ordered: 0,
                    ordered: 1,
                    in_transit: 2,
                    delivered: 3,
                  };

                  const currentStatusIndex = statusOrder[item.status];
                  const isActive = statusOrder[stepStatus] <= currentStatusIndex;
                  const isCurrent = stepStatus === item.status;

                  return (
                    <li
                      key={stepStatus}
                      className={styles.deliveryStepWrapper}
                      {...(isCurrent ? { 'aria-current': 'step' as const } : {})}
                    >
                      <div
                        className={`${styles.deliveryStep} ${isActive ? styles.deliveryStepActive : ''}`}
                      />
                      {index < 3 && (
                        <div
                          className={`${styles.deliveryLine} ${isActive ? styles.deliveryLineActive : ''}`}
                        />
                      )}
                      <div className={styles.deliveryStepLabel}>{stepLabels[stepStatus]}</div>
                    </li>
                  );
                },
              )}
            </ol>
          </div>
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Order Date</dt>
              <dd className={styles.infoValue}>
                {item.orderDate ? formatDate(item.orderDate) : '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Expected Delivery</dt>
              <dd className={styles.infoValue}>
                {item.expectedDeliveryDate ? formatDate(item.expectedDeliveryDate) : '\u2014'}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>Actual Delivery</dt>
              <dd className={styles.infoValue}>
                {item.actualDeliveryDate ? formatDate(item.actualDeliveryDate) : '\u2014'}
              </dd>
            </div>
          </dl>
        </section>

        {/* Linked Work Items card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Linked Work Items</h2>
          </div>

          {linkedWorkItems.length === 0 ? (
            <p className={styles.emptyState}>
              No work items linked. Use the form below to add a link.
            </p>
          ) : (
            <ul className={styles.budgetLinesList}>
              {linkedWorkItems.map((workItem) => (
                <li key={workItem.id} className={styles.subsidyItem}>
                  <div className={styles.workItemInfo}>
                    <Link to={`/work-items/${workItem.id}`} className={styles.workItemLink}>
                      {workItem.title}
                    </Link>
                    <StatusBadge status={workItem.status as WorkItemStatus} />
                    {(workItem.startDate || workItem.endDate) && (
                      <span className={styles.workItemDates}>
                        {workItem.startDate ? formatDate(workItem.startDate) : '—'} —{' '}
                        {workItem.endDate ? formatDate(workItem.endDate) : '—'}
                      </span>
                    )}
                  </div>
                  {unlinkingWorkItemId === workItem.id ? (
                    <span className={styles.subsidyActions}>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => void handleUnlinkWorkItem()}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className={styles.cancelButton}
                        onClick={() => setUnlinkingWorkItemId(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.unlinkButton}
                      onClick={() => setUnlinkingWorkItemId(workItem.id)}
                      aria-label={`Unlink ${workItem.title}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add work item link row */}
          <div className={styles.addWorkItemRow}>
            <input
              type="text"
              value={workItemSearchQuery}
              onChange={(e) => {
                setWorkItemSearchQuery(e.target.value);
                setSelectedWorkItemId('');
              }}
              placeholder="Search work items by title..."
              className={styles.formInput}
              disabled={isLinkingWorkItem}
              aria-label="Search work items"
            />
            <select
              value={selectedWorkItemId}
              onChange={(e) => setSelectedWorkItemId(e.target.value)}
              className={styles.formSelect}
              disabled={isLinkingWorkItem}
              aria-label="Select work item to link"
            >
              <option value="">— Select Work Item —</option>
              {allWorkItems
                .filter(
                  (wi) =>
                    !linkedWorkItems.some((lw) => lw.id === wi.id) &&
                    (workItemSearchQuery === '' ||
                      wi.title.toLowerCase().includes(workItemSearchQuery.toLowerCase())),
                )
                .map((wi) => (
                  <option key={wi.id} value={wi.id}>
                    {wi.title} ({WORK_ITEM_STATUS_LABELS[wi.status] || wi.status})
                  </option>
                ))}
            </select>
            <button
              type="button"
              className={styles.button}
              onClick={() => void handleLinkWorkItem()}
              disabled={!selectedWorkItemId || isLinkingWorkItem}
              aria-label="Link a work item to this household item"
            >
              {isLinkingWorkItem ? 'Linking...' : 'Add Link'}
            </button>
          </div>
        </section>

        {/* Budget card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Budget</h2>
            {!showBudgetForm && (
              <button type="button" className={styles.button} onClick={openAddBudgetForm}>
                Add Budget Line
              </button>
            )}
          </div>

          {inlineError && (
            <div className={styles.errorBanner} role="alert">
              {inlineError}
            </div>
          )}

          {/* Budget form */}
          {showBudgetForm && (
            <form onSubmit={handleSaveBudgetLine} className={styles.budgetLineForm}>
              <div className={styles.budgetFormField}>
                <label htmlFor="budget-description" className={styles.formLabel}>
                  Description
                </label>
                <input
                  id="budget-description"
                  type="text"
                  value={budgetForm.description}
                  onChange={(e) => setBudgetForm({ ...budgetForm, description: e.target.value })}
                  placeholder="e.g., Kitchen appliance"
                  className={styles.formInput}
                  disabled={isSavingBudget}
                />
              </div>

              <div className={styles.budgetFormField}>
                <label htmlFor="budget-amount" className={styles.formLabel}>
                  Planned Amount *
                </label>
                <input
                  id="budget-amount"
                  type="number"
                  value={budgetForm.plannedAmount}
                  onChange={(e) => setBudgetForm({ ...budgetForm, plannedAmount: e.target.value })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className={styles.formInput}
                  disabled={isSavingBudget}
                  required
                />
              </div>

              <div className={styles.budgetFormField}>
                <label htmlFor="budget-confidence" className={styles.formLabel}>
                  Confidence Level
                </label>
                <select
                  id="budget-confidence"
                  value={budgetForm.confidence}
                  onChange={(e) =>
                    setBudgetForm({ ...budgetForm, confidence: e.target.value as ConfidenceLevel })
                  }
                  className={styles.formSelect}
                  disabled={isSavingBudget}
                >
                  {(Object.entries(CONFIDENCE_LABELS) as Array<[ConfidenceLevel, string]>).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className={styles.budgetFormField}>
                <label htmlFor="budget-category" className={styles.formLabel}>
                  Budget Category
                </label>
                <select
                  id="budget-category"
                  value={budgetForm.budgetCategoryId}
                  onChange={(e) =>
                    setBudgetForm({ ...budgetForm, budgetCategoryId: e.target.value })
                  }
                  className={styles.formSelect}
                  disabled={isSavingBudget}
                >
                  <option value="">— Select Category —</option>
                  {budgetCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.budgetFormField}>
                <label htmlFor="budget-source" className={styles.formLabel}>
                  Budget Source
                </label>
                <select
                  id="budget-source"
                  value={budgetForm.budgetSourceId}
                  onChange={(e) => setBudgetForm({ ...budgetForm, budgetSourceId: e.target.value })}
                  className={styles.formSelect}
                  disabled={isSavingBudget}
                >
                  <option value="">— Select Source —</option>
                  {budgetSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.budgetFormField}>
                <label htmlFor="budget-vendor" className={styles.formLabel}>
                  Vendor
                </label>
                <select
                  id="budget-vendor"
                  value={budgetForm.vendorId}
                  onChange={(e) => setBudgetForm({ ...budgetForm, vendorId: e.target.value })}
                  className={styles.formSelect}
                  disabled={isSavingBudget}
                >
                  <option value="">— Select Vendor —</option>
                  {allVendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </div>

              {budgetFormError && (
                <div className={styles.errorBanner} role="alert">
                  {budgetFormError}
                </div>
              )}

              <div className={styles.budgetFormActions}>
                <button type="submit" className={styles.button} disabled={isSavingBudget}>
                  {isSavingBudget ? 'Saving...' : editingBudgetId ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeBudgetForm}
                  disabled={isSavingBudget}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Budget lines list */}
          {budgetLines.length === 0 && !showBudgetForm ? (
            <p className={styles.emptyState}>No budget lines added.</p>
          ) : (
            <div className={styles.budgetLinesList}>
              {budgetLines.map((line) => (
                <div key={line.id} className={styles.budgetLineItem}>
                  <div className={styles.budgetLineMain}>
                    <div className={styles.budgetLineTopRow}>
                      <span className={styles.budgetLineAmount}>
                        {formatCurrency(line.plannedAmount)}
                      </span>
                      <span className={styles.budgetLineConfidence}>
                        {CONFIDENCE_LABELS[line.confidence]} (±
                        {Math.round(CONFIDENCE_MARGINS[line.confidence] * 100)}
                        %)
                      </span>
                    </div>
                    {line.description && (
                      <div className={styles.budgetLineDescription}>{line.description}</div>
                    )}
                    <div className={styles.budgetLineMeta}>
                      {line.budgetCategory && (
                        <span className={styles.budgetLineMetaItem}>
                          {line.budgetCategory.name}
                        </span>
                      )}
                      {line.budgetSource && (
                        <span className={styles.budgetLineMetaItem}>{line.budgetSource.name}</span>
                      )}
                      {line.vendor && (
                        <span className={styles.budgetLineMetaItem}>{line.vendor.name}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.budgetLineActions}>
                    {deletingBudgetId === line.id ? (
                      <>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={confirmDeleteBudgetLine}
                          disabled={false}
                          title="Confirm delete"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={() => setDeletingBudgetId(null)}
                          title="Cancel delete"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => openEditBudgetForm(line)}
                          title="Edit budget line"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => handleDeleteBudgetLine(line.id)}
                          title="Delete budget line"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Budget summary */}
          {budgetLines.length > 0 && (
            <div className={styles.budgetSummary}>
              <div className={styles.budgetSummaryRow}>
                <span className={styles.budgetSummaryLabel}>Total Planned:</span>
                <span className={styles.budgetSummaryValue}>
                  {formatCurrency(budgetLines.reduce((sum, line) => sum + line.plannedAmount, 0))}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Subsidies card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Subsidies</h2>
          </div>

          {/* Linked subsidies list */}
          {linkedSubsidies.length > 0 && (
            <div className={styles.subsidiesList}>
              {linkedSubsidies.map((subsidy) => (
                <div key={subsidy.id} className={styles.subsidyItem}>
                  <div className={styles.subsidyInfo}>
                    <div className={styles.subsidyName}>{subsidy.name}</div>
                    <div className={styles.subsidyMeta}>
                      {subsidy.reductionType === 'percentage' ? (
                        <span className={styles.subsidyReduction}>−{subsidy.reductionValue}%</span>
                      ) : (
                        <span className={styles.subsidyReduction}>
                          −{formatCurrency(subsidy.reductionValue)}
                        </span>
                      )}
                      <span className={styles.subsidyStatus}>{subsidy.applicationStatus}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.unlinkButton}
                    onClick={() => void handleUnlinkSubsidy(subsidy.id)}
                    aria-label={`Unlink ${subsidy.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add subsidy row */}
          <div className={styles.addSubsidyRow}>
            <select
              value={selectedSubsidyId}
              onChange={(e) => setSelectedSubsidyId(e.target.value)}
              className={styles.formSelect}
              disabled={isLinkingSubsidy}
              aria-label="Select subsidy program"
            >
              <option value="">— Link Subsidy Program —</option>
              {allSubsidyPrograms
                .filter((prog) => !linkedSubsidies.some((linked) => linked.id === prog.id))
                .map((prog) => (
                  <option key={prog.id} value={prog.id}>
                    {prog.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className={styles.button}
              onClick={() => void handleLinkSubsidy()}
              disabled={!selectedSubsidyId || isLinkingSubsidy}
            >
              {isLinkingSubsidy ? 'Linking...' : 'Add'}
            </button>
          </div>

          {/* Subsidy payback summary */}
          {subsidyPayback && subsidyPayback.maxTotalPayback > 0 && (
            <div className={styles.subsidyPaybackSummary}>
              <p className={styles.subsidyPaybackText}>
                Estimated Subsidy Reduction: {formatCurrency(subsidyPayback.minTotalPayback)}–
                {formatCurrency(subsidyPayback.maxTotalPayback)}
              </p>
            </div>
          )}
        </section>

        {/* Documents section */}
        <LinkedDocumentsSection entityType="household_item" entityId={id!} />

        {/* Metadata card */}
        <section className={styles.card}>
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>Created by</span>
              <span className={styles.infoValue}>{item.createdBy?.displayName ?? '\u2014'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>Created at</span>
              <span className={styles.infoValue}>{formatDate(item.createdAt)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>Updated at</span>
              <span className={styles.infoValue}>{formatDate(item.updatedAt)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className={styles.modalBackdrop} onClick={closeDeleteModal} />
          <div className={styles.modalContent} ref={modalRef}>
            <h2 id="delete-modal-title" className={styles.modalTitle}>
              Delete Household Item
            </h2>
            <p className={styles.modalText}>
              Are you sure you want to delete <strong>{item.name}</strong>?
            </p>
            {deleteError ? (
              <div className={styles.errorBanner} role="alert">
                {deleteError}
              </div>
            ) : (
              <p className={styles.modalWarning}>This action cannot be undone.</p>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={closeDeleteModal}
                disabled={isDeleting}
              >
                Cancel
              </button>
              {!deleteError && (
                <button
                  type="button"
                  className={styles.confirmDeleteButton}
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Item'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HouseholdItemDetailPage;

import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
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
  WorkItemSummary,
  Invoice,
  HouseholdItemDepDetail,
  HouseholdItemDepPredecessorType,
  CreateHouseholdItemDepRequest,
  MilestoneSummary,
  DependencyType,
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
  fetchHouseholdItemDeps,
  createHouseholdItemDep,
  deleteHouseholdItemDep,
} from '../../lib/householdItemDepsApi.js';
import { fetchBudgetCategories } from '../../lib/budgetCategoriesApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { listMilestones } from '../../lib/milestonesApi.js';
import { fetchInvoices } from '../../lib/invoicesApi.js';
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

  // Add Dependency modal
  const depModalRef = useRef<HTMLDivElement>(null);
  const depSearchInputRef = useRef<HTMLInputElement>(null);

  // Budget lines state
  const [budgetLines, setBudgetLines] = useState<HouseholdItemBudgetLine[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [budgetLineInvoices, setBudgetLineInvoices] = useState<Record<string, Invoice[]>>({});

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

  // Dependency state
  const [dependencies, setDependencies] = useState<HouseholdItemDepDetail[]>([]);
  const [showAddDepModal, setShowAddDepModal] = useState(false);
  const [depPredecessorType, setDepPredecessorType] =
    useState<HouseholdItemDepPredecessorType>('work_item');
  const [depSearchQuery, setDepSearchQuery] = useState('');
  const [depSelectedId, setDepSelectedId] = useState('');
  const [depError, setDepError] = useState<string | null>(null);
  const [isAddingDep, setIsAddingDep] = useState(false);
  const [removingDepKey, setRemovingDepKey] = useState<string | null>(null);
  // For modal search results
  const [allWorkItems, setAllWorkItems] = useState<WorkItemSummary[]>([]);
  const [allMilestones, setAllMilestones] = useState<MilestoneSummary[]>([]);

  // Inline error for budget/subsidy/dependency operations
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

  // Add Dependency modal: focus trap and Escape key handler
  useEffect(() => {
    if (!showAddDepModal) return;
    // Auto-focus the search input when modal opens
    depSearchInputRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowAddDepModal(false);
        setDepError(null);
        return;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showAddDepModal]);

  // Load invoices for budget lines whenever the item or budget lines change
  useEffect(() => {
    if (item?.vendor && budgetLines.length > 0) {
      const budgetLineIds = budgetLines.map((bl) => bl.id);
      void loadBudgetLineInvoices(item.vendor.id, budgetLineIds);
    }
  }, [item?.vendor?.id, budgetLines.map((bl) => bl.id).join(',')]);

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
      const [budgets, subsidies, payback, categories, sources, vendors, programs, depsData] =
        await Promise.all([
          fetchHouseholdItemBudgets(itemId),
          fetchHouseholdItemSubsidies(itemId),
          fetchHouseholdItemSubsidyPayback(itemId),
          fetchBudgetCategories(),
          fetchBudgetSources(),
          fetchVendors({ pageSize: 100 }),
          fetchSubsidyPrograms(),
          fetchHouseholdItemDeps(itemId),
        ]);
      setBudgetLines(budgets);
      setLinkedSubsidies(subsidies);
      setSubsidyPayback(payback);
      setBudgetCategories(categories.categories);
      setBudgetSources(sources.budgetSources);
      setAllVendors(vendors.vendors);
      setAllSubsidyPrograms(programs.subsidyPrograms);
      setDependencies(depsData);
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

  const loadBudgetLineInvoices = async (vendorId: string, budgetLineIds: string[]) => {
    try {
      const allVendorInvoices = await fetchInvoices(vendorId);
      const grouped: Record<string, Invoice[]> = {};
      for (const inv of allVendorInvoices) {
        if (inv.householdItemBudgetId && budgetLineIds.includes(inv.householdItemBudgetId)) {
          if (!grouped[inv.householdItemBudgetId]) grouped[inv.householdItemBudgetId] = [];
          grouped[inv.householdItemBudgetId].push(inv);
        }
      }
      setBudgetLineInvoices(grouped);
    } catch {
      // Silently fail — invoices are supplementary
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

  // ─── Dependency handlers ──────────────────────────────────────────────────

  const handleOpenAddDepModal = async () => {
    setShowAddDepModal(true);
    if (allWorkItems.length === 0) {
      const wis = await listWorkItems({ pageSize: 100 });
      setAllWorkItems(wis.items);
    }
    if (allMilestones.length === 0) {
      const ms = await listMilestones();
      setAllMilestones(ms);
    }
  };

  const handleAddDep = async () => {
    if (!id || !depSelectedId) return;
    setIsAddingDep(true);
    setDepError(null);
    try {
      await createHouseholdItemDep(id, {
        predecessorType: depPredecessorType,
        predecessorId: depSelectedId,
      });
      const updated = await fetchHouseholdItemDeps(id);
      setDependencies(updated);
      const newItem = await getHouseholdItem(id);
      setItem(newItem);
      setShowAddDepModal(false);
      showToast('success', 'Dependency added');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDepError(err.error.message ?? 'Failed to add dependency');
      }
    } finally {
      setIsAddingDep(false);
    }
  };

  const handleRemoveDep = async (dep: HouseholdItemDepDetail) => {
    if (!id) return;
    try {
      await deleteHouseholdItemDep(id, dep.predecessorType, dep.predecessorId);
      const updated = await fetchHouseholdItemDeps(id);
      setDependencies(updated);
      const newItem = await getHouseholdItem(id);
      setItem(newItem);
      setRemovingDepKey(null);
      showToast('success', 'Dependency removed');
    } catch (err) {
      showToast('error', 'Failed to remove dependency');
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

  function MilestoneIconSvg() {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 10 10"
        width="10"
        height="10"
        aria-hidden="true"
      >
        <polygon points="5,0 10,5 5,10 0,5" fill="currentColor" />
      </svg>
    );
  }

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

  // Compute budget line totals
  const totalPlanned = budgetLines.reduce((sum, b) => sum + b.plannedAmount, 0);
  const totalActualCost = budgetLines.reduce((sum, b) => sum + b.actualCost, 0);
  // Confidence-based min/max planned range: each line contributes amount ± margin
  const totalMinPlanned = budgetLines.reduce((sum, b) => {
    const margin = CONFIDENCE_MARGINS[b.confidence] ?? 0;
    return sum + b.plannedAmount * (1 - margin);
  }, 0);
  const totalMaxPlanned = budgetLines.reduce((sum, b) => {
    const margin = CONFIDENCE_MARGINS[b.confidence] ?? 0;
    return sum + b.plannedAmount * (1 + margin);
  }, 0);
  // Show range only when there's meaningful variance (min !== max)
  const hasPlannedRange = Math.abs(totalMaxPlanned - totalMinPlanned) > 0.01;
  // Check if any budget lines have invoiced amounts
  const hasInvoicedLines = budgetLines.some((b) => b.invoiceCount > 0);

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
              {(['planned', 'purchased', 'scheduled', 'arrived'] as const).map(
                (stepStatus, index) => {
                  const stepLabels = {
                    planned: 'Planned',
                    purchased: 'Purchased',
                    scheduled: 'Scheduled',
                    arrived: 'Arrived',
                  };

                  const statusOrder = {
                    planned: 0,
                    purchased: 1,
                    scheduled: 2,
                    arrived: 3,
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
              <dt className={styles.infoLabel}>Target Delivery (computed)</dt>
              <dd className={styles.infoValue}>
                {item.targetDeliveryDate ? formatDate(item.targetDeliveryDate) : '\u2014'}
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

        {/* Dependencies card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Dependencies</h2>
            <button
              type="button"
              className={styles.button}
              onClick={() => void handleOpenAddDepModal()}
            >
              Add Dependency
            </button>
          </div>

          {/* Delivery date summary row */}
          <div className={styles.deliverySummaryRow}>
            <div className={styles.deliveryDateCol}>
              <span className={styles.deliveryLabel}>Earliest delivery</span>
              <span className={styles.deliveryValue}>
                {item.earliestDeliveryDate ? formatDate(item.earliestDeliveryDate) : '—'}
              </span>
              {item.isLate && item.status !== 'arrived' && (
                <span className={styles.lateChip}>Floored to today</span>
              )}
            </div>
            {item.targetDeliveryDate && (
              <div className={styles.deliveryDateColCenter}>
                <span className={styles.deliveryLabelSm}>Target</span>
                <span className={styles.deliveryValueSm}>
                  {formatDate(item.targetDeliveryDate)}
                </span>
              </div>
            )}
            <div className={styles.deliveryDateCol}>
              <span className={styles.deliveryLabel}>Latest delivery</span>
              <span className={styles.deliveryValue}>
                {item.latestDeliveryDate ? formatDate(item.latestDeliveryDate) : '—'}
              </span>
            </div>
          </div>

          {/* Dependency list */}
          {dependencies.length === 0 ? (
            <p className={styles.emptyState}>
              No dependencies yet. Add a dependency to schedule this item.
            </p>
          ) : (
            <ul role="list" className={styles.depList}>
              {dependencies.map((dep) => {
                const depKey = `${dep.predecessorType}:${dep.predecessorId}`;
                return (
                  <li key={depKey} role="listitem" className={styles.depRow}>
                    <span
                      className={
                        dep.predecessorType === 'work_item'
                          ? styles.predTypeWorkItem
                          : styles.predTypeMilestone
                      }
                    >
                      {dep.predecessorType === 'milestone' && <MilestoneIconSvg />}
                      {dep.predecessorType === 'work_item' ? 'Work Item' : 'Milestone'}
                    </span>
                    {dep.predecessorType === 'work_item' ? (
                      <Link to={`/work-items/${dep.predecessorId}`} className={styles.depPredLink}>
                        {dep.predecessor.title}
                      </Link>
                    ) : (
                      <span className={styles.depPredLabel}>{dep.predecessor.title}</span>
                    )}
                    <button
                      type="button"
                      className={styles.unlinkButton}
                      onClick={() => setRemovingDepKey(depKey)}
                      aria-label={`Remove dependency on ${dep.predecessor.title}`}
                    >
                      ×
                    </button>
                    {removingDepKey === depKey && (
                      <>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => void handleRemoveDep(dep)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className={styles.cancelButton}
                          onClick={() => setRemovingDepKey(null)}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Add Dependency modal */}
          {showAddDepModal && (
            <div
              ref={depModalRef}
              className={styles.modalOverlay}
              role="dialog"
              aria-modal="true"
              aria-label="Add Dependency"
            >
              <div className={styles.modalContent} style={{ maxWidth: '36rem' }}>
                <h3 className={styles.modalTitle}>Add Dependency</h3>
                {/* Entity type toggle (radiogroup) */}
                <div
                  role="radiogroup"
                  aria-label="Predecessor type"
                  className={styles.depTypeToggle}
                >
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="predType"
                      value="work_item"
                      checked={depPredecessorType === 'work_item'}
                      onChange={() => {
                        setDepPredecessorType('work_item');
                        setDepSelectedId('');
                      }}
                    />
                    Work Item
                  </label>
                  <label className={styles.radioOption}>
                    <input
                      type="radio"
                      name="predType"
                      value="milestone"
                      checked={depPredecessorType === 'milestone'}
                      onChange={() => {
                        setDepPredecessorType('milestone');
                        setDepSelectedId('');
                      }}
                    />
                    Milestone
                  </label>
                </div>
                {/* Search */}
                <input
                  ref={depSearchInputRef}
                  type="text"
                  className={styles.formInput}
                  placeholder={`Search ${depPredecessorType === 'work_item' ? 'work items' : 'milestones'}...`}
                  value={depSearchQuery}
                  onChange={(e) => setDepSearchQuery(e.target.value)}
                  aria-label="Search predecessors"
                  autoFocus
                />
                {/* Results list */}
                <ul role="list" aria-label="Search results" className={styles.depSearchResults}>
                  {(depPredecessorType === 'work_item' ? allWorkItems : allMilestones)
                    .filter((item) => {
                      const title = depPredecessorType === 'work_item' ? item.title : item.title;
                      const alreadyAdded = dependencies.some(
                        (d) =>
                          d.predecessorType === depPredecessorType &&
                          d.predecessorId === String(item.id),
                      );
                      return (
                        !alreadyAdded && title.toLowerCase().includes(depSearchQuery.toLowerCase())
                      );
                    })
                    .map((item) => (
                      <li
                        key={item.id}
                        role="listitem"
                        className={`${styles.depSearchOption} ${
                          depSelectedId === String(item.id) ? styles.depSearchOptionSelected : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setDepSelectedId(String(item.id))}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          {depPredecessorType === 'work_item' ? item.title : item.title}
                        </button>
                      </li>
                    ))}
                </ul>
                {depError && (
                  <div role="alert" className={styles.errorBanner}>
                    {depError}
                  </div>
                )}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={() => {
                      setShowAddDepModal(false);
                      setDepError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={!depSelectedId || isAddingDep}
                    onClick={() => void handleAddDep()}
                  >
                    {isAddingDep ? 'Adding...' : 'Add Dependency'}
                  </button>
                </div>
              </div>
            </div>
          )}
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
                      {line.invoiceCount > 0 ? (
                        <>
                          <span
                            className={`${styles.budgetLineAmount} ${styles.budgetLineAmountInvoiced}`}
                          >
                            {formatCurrency(line.actualCost)}
                          </span>
                          <span className={styles.budgetLineInvoicedLabel}>Invoiced Amount</span>
                          <span className={styles.budgetLinePlannedSecondary}>
                            (planned: {formatCurrency(line.plannedAmount)})
                          </span>
                        </>
                      ) : (
                        <>
                          <span className={styles.budgetLineAmount}>
                            {formatCurrency(line.plannedAmount)}
                          </span>
                          <span className={styles.budgetLineConfidence}>
                            {CONFIDENCE_LABELS[line.confidence]}
                            {CONFIDENCE_MARGINS[line.confidence] > 0 && (
                              <span className={styles.budgetLineMargin}>
                                {' '}
                                (+{Math.round(CONFIDENCE_MARGINS[line.confidence] * 100)}%)
                              </span>
                            )}
                          </span>
                        </>
                      )}
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
                    {budgetLineInvoices[line.id]?.length > 0 && (
                      <div className={styles.budgetLineInvoices}>
                        <h4 className={styles.budgetLineInvoicesTitle}>Linked Invoices</h4>
                        <ul className={styles.invoiceList}>
                          {budgetLineInvoices[line.id].map((inv) => (
                            <li key={inv.id} className={styles.invoiceListItem}>
                              <Link to={`/invoices/${inv.id}`} className={styles.invoiceLink}>
                                {inv.invoiceNumber ? `#${inv.invoiceNumber}` : 'Invoice'}
                              </Link>
                              <span className={styles.invoiceAmount}>
                                {formatCurrency(inv.amount)}
                              </span>
                              <span
                                className={`${styles.invoiceStatusBadge} ${styles[`invoiceStatus_${inv.status}`]}`}
                              >
                                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                              </span>
                              <span className={styles.invoiceDate}>{formatDate(inv.date)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
              {hasInvoicedLines && (
                <div className={styles.budgetSummaryRow}>
                  <span className={styles.budgetSummaryLabel}>Total Actual Cost:</span>
                  <span className={styles.budgetSummaryValue}>
                    {formatCurrency(totalActualCost)}
                  </span>
                </div>
              )}
              <div className={styles.budgetSummaryRow}>
                <span className={styles.budgetSummaryLabel}>
                  {hasPlannedRange ? 'Planned Range:' : 'Total Planned:'}
                </span>
                <span className={styles.budgetSummaryValue}>
                  {hasPlannedRange
                    ? `${formatCurrency(totalMinPlanned)} – ${formatCurrency(totalMaxPlanned)}`
                    : formatCurrency(totalPlanned)}
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

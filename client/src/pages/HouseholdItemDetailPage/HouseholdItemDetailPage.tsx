import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemBudgetLine,
  SubsidyProgram,
  BudgetSource,
  Vendor,
  HouseholdItemSubsidyPaybackResponse,
  WorkItemSummary,
  Invoice,
  HouseholdItemDepDetail,
  HouseholdItemDepPredecessorType,
  MilestoneSummary,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import {
  getHouseholdItem,
  deleteHouseholdItem,
  updateHouseholdItem,
} from '../../lib/householdItemsApi.js';
import {
  AutosaveIndicator,
  type AutosaveState,
} from '../../components/AutosaveIndicator/AutosaveIndicator.js';
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
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { listMilestones } from '../../lib/milestonesApi.js';
import { fetchInvoices } from '../../lib/invoicesApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import {
  createInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
} from '../../lib/invoiceBudgetLinesApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { formatDate, formatCurrency } from '../../lib/formatters.js';
import { HouseholdItemStatusBadge } from '../../components/HouseholdItemStatusBadge/HouseholdItemStatusBadge.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { LinkedDocumentsSection } from '../../components/documents/LinkedDocumentsSection.js';
import { useBudgetSection, type BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import { BudgetSection } from '../../components/budget/BudgetSection.js';
import { InvoiceLinkModal } from '../../components/budget/InvoiceLinkModal.js';
import styles from './HouseholdItemDetailPage.module.css';

export function HouseholdItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const locationState = location.state as { from?: string; view?: string } | null;
  const fromSchedule = locationState?.from === 'schedule';
  const fromView = locationState?.view;

  const [item, setItem] = useState<HouseholdItemDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  // Add Dependency inline search
  const depDropdownRef = useRef<HTMLDivElement>(null);
  const depSearchRef = useRef<HTMLInputElement>(null);

  // Budget lines state
  const [budgetLines, setBudgetLines] = useState<HouseholdItemBudgetLine[]>([]);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  // Invoice linking state
  const [showInvoiceLinkModal, setShowInvoiceLinkModal] = useState(false);
  const [invoiceLinkingBudgetId, setInvoiceLinkingBudgetId] = useState<string | null>(null);
  const [isUnlinkingInvoice, setIsUnlinkingInvoice] = useState<Record<string, boolean>>({});

  // Subsidy linking state (linked subsidies and programs stay as local state)
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);

  // Subsidy payback state
  const [subsidyPayback, setSubsidyPayback] = useState<HouseholdItemSubsidyPaybackResponse | null>(
    null,
  );

  // Dependency state
  const [dependencies, setDependencies] = useState<HouseholdItemDepDetail[]>([]);
  const [depSearchInput, setDepSearchInput] = useState('');
  const [showDepDropdown, setShowDepDropdown] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);
  const [isAddingDep, setIsAddingDep] = useState(false);
  const [removingDepKey, setRemovingDepKey] = useState<string | null>(null);
  // For inline search results
  const [allWorkItems, setAllWorkItems] = useState<WorkItemSummary[]>([]);
  const [allMilestones, setAllMilestones] = useState<MilestoneSummary[]>([]);

  // Inline error for budget/subsidy/dependency operations
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [dateInlineError, setDateInlineError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Inline date editing state
  const [localOrderDate, setLocalOrderDate] = useState<string>('');
  const [localActualDeliveryDate, setLocalActualDeliveryDate] = useState<string>('');
  const [localEarliestDeliveryDate, setLocalEarliestDeliveryDate] = useState<string>('');
  const [localLatestDeliveryDate, setLocalLatestDeliveryDate] = useState<string>('');
  const [autosaveOrderDate, setAutosaveOrderDate] = useState<AutosaveState>('idle');
  const [autosaveActualDelivery, setAutosaveActualDelivery] = useState<AutosaveState>('idle');
  const [autosaveEarliestDelivery, setAutosaveEarliestDelivery] = useState<AutosaveState>('idle');
  const [autosaveLatestDelivery, setAutosaveLatestDelivery] = useState<AutosaveState>('idle');
  const autosaveResetRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Shared reload functions for budget-related data
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

  // Budget section hook
  const budgetSection = useBudgetSection<HouseholdItemBudgetLine>({
    api: {
      fetchBudgets: fetchHouseholdItemBudgets,
      createBudget: createHouseholdItemBudget,
      updateBudget: updateHouseholdItemBudget,
      deleteBudget: deleteHouseholdItemBudget,
    },
    reloadBudgetLines,
    reloadSubsidyPayback,
    reloadLinkedSubsidies,
    toFormState: (line: HouseholdItemBudgetLine): BudgetLineFormState => ({
      description: line.description ?? '',
      plannedAmount: String(line.plannedAmount),
      confidence: line.confidence,
      budgetCategoryId: '', // Household items don't use budget categories
      budgetSourceId: line.budgetSource?.id ?? '',
      vendorId: line.vendor?.id ?? '',
    }),
    toPayload: (form: BudgetLineFormState) => ({
      description: form.description.trim() || null,
      plannedAmount: parseFloat(form.plannedAmount),
      confidence: form.confidence,
      budgetSourceId: form.budgetSourceId || null,
      vendorId: form.vendorId || null,
    }),
    entityId: id ?? '',
  });

  useEffect(() => {
    if (!id) return;
    void loadItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (item) {
      setLocalOrderDate(item.orderDate || '');
      setLocalActualDeliveryDate(item.actualDeliveryDate || '');
      setLocalEarliestDeliveryDate(item.earliestDeliveryDate || '');
      setLocalLatestDeliveryDate(item.latestDeliveryDate || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

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
  // Load work items and milestones on component mount (not just when opening modal)
  useEffect(() => {
    const loadPredecessors = async () => {
      try {
        if (allWorkItems.length === 0) {
          const wis = await listWorkItems({ pageSize: 100 });
          setAllWorkItems(wis.items);
        }
        if (allMilestones.length === 0) {
          const ms = await listMilestones();
          setAllMilestones(ms);
        }
      } catch (err) {
        console.error('Failed to load predecessors:', err);
      }
    };
    void loadPredecessors();
  }, []);

  // Handle click outside the dependency dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        depDropdownRef.current &&
        depSearchRef.current &&
        !depDropdownRef.current.contains(e.target as Node) &&
        !depSearchRef.current.contains(e.target as Node)
      ) {
        setShowDepDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const [budgets, subsidies, payback, sources, vendors, programs, depsData, categoriesData] =
        await Promise.all([
          fetchHouseholdItemBudgets(itemId),
          fetchHouseholdItemSubsidies(itemId),
          fetchHouseholdItemSubsidyPayback(itemId),
          fetchBudgetSources(),
          fetchVendors({ pageSize: 100 }),
          fetchSubsidyPrograms(),
          fetchHouseholdItemDeps(itemId),
          fetchHouseholdItemCategories(),
        ]);
      setBudgetLines(budgets);
      setLinkedSubsidies(subsidies);
      setSubsidyPayback(payback);
      setBudgetSources(sources.budgetSources);
      setAllVendors(vendors.vendors);
      setAllSubsidyPrograms(programs.subsidyPrograms);
      setDependencies(depsData);
      setCategories(categoriesData.categories);
    } catch (err) {
      // Non-critical — budget data failure shouldn't block the page
      console.error('Failed to load budget data:', err);
    }
  };

  // ─── Dependency handlers ──────────────────────────────────────────────────

  const handleAddDepInline = async (
    predecessorType: 'work_item' | 'milestone',
    predecessorId: string,
  ) => {
    if (!id) return;
    setIsAddingDep(true);
    setDepError(null);
    try {
      await createHouseholdItemDep(id, {
        predecessorType,
        predecessorId,
      });
      const updated = await fetchHouseholdItemDeps(id);
      setDependencies(updated);
      const newItem = await getHouseholdItem(id);
      setItem(newItem);
      setDepSearchInput('');
      setShowDepDropdown(false);
      showToast('success', 'Dependency added successfully');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDepError(err.error.message ?? 'Failed to add dependency');
      } else {
        showToast('error', 'Failed to add dependency');
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
    } catch {
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

  // ─── Budget line handlers (delegated to useBudgetSection hook) ────────────

  const {
    confirmDeleteBudgetLine,
    handleLinkSubsidy: hookHandleLinkSubsidy,
    handleUnlinkSubsidy: hookHandleUnlinkSubsidy,
    selectedSubsidyId,
  } = budgetSection;

  // Handle delete confirmation with inline error management
  const handleConfirmDeleteBudgetLine = async () => {
    try {
      await confirmDeleteBudgetLine();
    } catch (err) {
      const error = err as Error;
      setInlineError(error.message);
    }
  };

  // ─── Subsidy linking handlers (delegates to hook after API calls) ──────────

  const handleLinkSubsidy = async () => {
    if (!id || !selectedSubsidyId) return;
    setInlineError(null);
    try {
      await linkHouseholdItemSubsidy(id, selectedSubsidyId);
      await hookHandleLinkSubsidy();
      await reloadSubsidyPayback();
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError('This subsidy program is already linked');
      } else {
        setInlineError('Failed to link subsidy program');
      }
      console.error('Failed to link subsidy:', err);
    }
  };

  const handleUnlinkSubsidy = async (subsidyProgramId: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await unlinkHouseholdItemSubsidy(id, subsidyProgramId);
      await hookHandleUnlinkSubsidy();
      await reloadSubsidyPayback();
    } catch (err) {
      setInlineError('Failed to unlink subsidy program');
      console.error('Failed to unlink subsidy:', err);
    }
  };

  // ─── Invoice linking handlers ────────────────────────────────────────────

  const handleLinkInvoice = (budgetLineId: string) => {
    setInvoiceLinkingBudgetId(budgetLineId);
    setShowInvoiceLinkModal(true);
  };

  const handleUnlinkInvoice = async (budgetLineId: string, invoiceBudgetLineId: string) => {
    const invoiceLink = budgetLines.find((line) => line.id === budgetLineId)?.invoiceLink;
    if (!invoiceLink) return;

    setIsUnlinkingInvoice((prev) => ({ ...prev, [invoiceBudgetLineId]: true }));
    setInlineError(null);

    try {
      await deleteInvoiceBudgetLine(invoiceLink.invoiceId, invoiceBudgetLineId);
      const fresh = await getHouseholdItem(id!);
      setItem(fresh);
      await reloadBudgetLines();
    } catch (err) {
      setInlineError('Failed to unlink budget line from invoice');
      console.error('Failed to unlink invoice:', err);
    } finally {
      setIsUnlinkingInvoice((prev) => ({ ...prev, [invoiceBudgetLineId]: false }));
    }
  };

  const handleInvoiceLinkSuccess = () => {
    setShowInvoiceLinkModal(false);
    setInvoiceLinkingBudgetId(null);
    reloadBudgetLines();
  };

  function triggerAutosaveReset(setter: (v: AutosaveState) => void, key: string) {
    if (autosaveResetRefs.current[key]) clearTimeout(autosaveResetRefs.current[key]);
    autosaveResetRefs.current[key] = setTimeout(() => setter('idle'), 2000);
  }

  const handleOrderDateBlur = async () => {
    if (!id || !item) return;
    if (localOrderDate === (item.orderDate || '')) return;
    setDateInlineError(null);
    setAutosaveOrderDate('saving');
    try {
      const updated = await updateHouseholdItem(id, { orderDate: localOrderDate || null });
      setItem(updated);
      setAutosaveOrderDate('success');
      triggerAutosaveReset(setAutosaveOrderDate, 'orderDate');
    } catch {
      setAutosaveOrderDate('error');
      triggerAutosaveReset(setAutosaveOrderDate, 'orderDate');
      setDateInlineError('Failed to update order date');
    }
  };

  const handleActualDeliveryDateBlur = async () => {
    if (!id || !item) return;
    if (localActualDeliveryDate === (item.actualDeliveryDate || '')) return;
    setDateInlineError(null);
    setAutosaveActualDelivery('saving');
    try {
      await updateHouseholdItem(id, { actualDeliveryDate: localActualDeliveryDate || null });
      const fresh = await getHouseholdItem(id);
      setItem(fresh);
      setLocalActualDeliveryDate(fresh.actualDeliveryDate || '');
      setLocalOrderDate(fresh.orderDate || '');
      setLocalEarliestDeliveryDate(fresh.earliestDeliveryDate || '');
      setLocalLatestDeliveryDate(fresh.latestDeliveryDate || '');
      setAutosaveActualDelivery('success');
      triggerAutosaveReset(setAutosaveActualDelivery, 'actualDelivery');
    } catch {
      setAutosaveActualDelivery('error');
      triggerAutosaveReset(setAutosaveActualDelivery, 'actualDelivery');
      setDateInlineError('Failed to update actual delivery date');
    }
  };

  const handleEarliestDeliveryDateBlur = async () => {
    if (!id || !item) return;
    if (localEarliestDeliveryDate === (item.earliestDeliveryDate || '')) return;
    setDateInlineError(null);
    setAutosaveEarliestDelivery('saving');
    try {
      await updateHouseholdItem(id, { earliestDeliveryDate: localEarliestDeliveryDate || null });
      const fresh = await getHouseholdItem(id);
      setItem(fresh);
      setLocalActualDeliveryDate(fresh.actualDeliveryDate || '');
      setLocalOrderDate(fresh.orderDate || '');
      setLocalEarliestDeliveryDate(fresh.earliestDeliveryDate || '');
      setLocalLatestDeliveryDate(fresh.latestDeliveryDate || '');
      setAutosaveEarliestDelivery('success');
      triggerAutosaveReset(setAutosaveEarliestDelivery, 'earliestDelivery');
    } catch {
      setAutosaveEarliestDelivery('error');
      triggerAutosaveReset(setAutosaveEarliestDelivery, 'earliestDelivery');
      setDateInlineError('Failed to update earliest delivery date');
    }
  };

  const handleLatestDeliveryDateBlur = async () => {
    if (!id || !item) return;
    if (localLatestDeliveryDate === (item.latestDeliveryDate || '')) return;
    setDateInlineError(null);
    setAutosaveLatestDelivery('saving');
    try {
      const updated = await updateHouseholdItem(id, {
        latestDeliveryDate: localLatestDeliveryDate || null,
      });
      setItem(updated);
      setAutosaveLatestDelivery('success');
      triggerAutosaveReset(setAutosaveLatestDelivery, 'latestDelivery');
    } catch {
      setAutosaveLatestDelivery('error');
      triggerAutosaveReset(setAutosaveLatestDelivery, 'latestDelivery');
      setDateInlineError('Failed to update latest delivery date');
    }
  };

  const handleStatusChange = async (newStatus: HouseholdItemStatus) => {
    if (!id || !item) return;
    setIsChangingStatus(true);
    setInlineError(null);
    try {
      const updated = await updateHouseholdItem(id, { status: newStatus });
      setItem(updated);
      showToast('success', 'Status updated');
    } catch (err) {
      setInlineError('Failed to update status. Please try again.');
      console.error('Failed to update status:', err);
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteHouseholdItem(item.id);
      showToast('success', 'Household item deleted successfully');
      navigate('/project/household-items');
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
              onClick={() => navigate('/project/household-items')}
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
              onClick={() => navigate('/project/household-items')}
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

  const availableSubsidies = allSubsidyPrograms.filter(
    (prog) => !linkedSubsidies.some((linked) => linked.id === prog.id),
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Navigation buttons */}
        <div className={styles.navButtons}>
          {fromSchedule ? (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate(fromView ? `/schedule?view=${fromView}` : '/schedule')}
              >
                ← Back to Schedule
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/project/household-items')}
              >
                To Household Items
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate('/project/household-items')}
              >
                ← Back to Household Items
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/schedule')}
              >
                To Schedule
              </button>
            </>
          )}
        </div>

        {/* Page header */}
        <div className={styles.headerRow}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{item.name}</h1>
            <div className={styles.headerBadges}>
              <span className={styles.categoryBadge}>
                {categories.find((c) => c.id === item.category)?.name ?? item.category}
              </span>
              <HouseholdItemStatusBadge status={item.status} />
            </div>
          </div>
          <div className={styles.pageActions}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() => navigate(`/project/household-items/${item.id}/edit`)}
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
          {dateInlineError && (
            <div
              className={styles.errorMessage}
              role="alert"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{dateInlineError}</span>
              <button
                type="button"
                onClick={() => setDateInlineError(null)}
                aria-label="Close error message"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  padding: '0 0 0 var(--spacing-4)',
                  flexShrink: 0,
                  color: 'inherit',
                }}
              >
                ×
              </button>
            </div>
          )}
          {/* Inline status selector */}
          <div className={styles.statusSection}>
            <label htmlFor="hi-status-select" className={styles.infoLabel}>
              Purchase Status
            </label>
            <select
              id="hi-status-select"
              className={styles.statusSelect}
              value={item.status}
              disabled={isChangingStatus}
              aria-label="Purchase status"
              onChange={(e) => void handleStatusChange(e.target.value as HouseholdItemStatus)}
            >
              <option value="planned">Planned</option>
              <option value="purchased">Purchased</option>
              <option value="scheduled">Scheduled</option>
              <option value="arrived">Arrived</option>
            </select>
          </div>
          <dl className={styles.infoList}>
            {/* Schedule row showing target or actual date */}
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                {item.actualDeliveryDate ? 'Actual Date' : 'Target Date'}
              </dt>
              <dd className={styles.infoValue}>
                {item.actualDeliveryDate ? (
                  <span
                    aria-label={`Actual delivery: ${formatDate(item.actualDeliveryDate)}, target was ${item.targetDeliveryDate ? formatDate(item.targetDeliveryDate) : 'not set'}`}
                  >
                    {formatDate(item.actualDeliveryDate)}{' '}
                    {item.targetDeliveryDate && (
                      <span className={styles.targetStrikethrough}>
                        {formatDate(item.targetDeliveryDate)}
                      </span>
                    )}
                  </span>
                ) : item.targetDeliveryDate ? (
                  formatDate(item.targetDeliveryDate)
                ) : (
                  '\u2014'
                )}
              </dd>
            </div>

            {/* Order Date - inline editable */}
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                <label htmlFor="hi-order-date">Order Date</label>
              </dt>
              <dd className={styles.infoValue}>
                <div className={styles.inlineFieldWrapper}>
                  <input
                    type="date"
                    id="hi-order-date"
                    className={styles.propertyInput}
                    value={localOrderDate}
                    onChange={(e) => setLocalOrderDate(e.target.value)}
                    onBlur={() => void handleOrderDateBlur()}
                    aria-label="Order date"
                  />
                  {localOrderDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label="Clear order date"
                      onClick={() => {
                        setLocalOrderDate('');
                        if (item?.orderDate) {
                          setAutosaveOrderDate('saving');
                          void updateHouseholdItem(id!, { orderDate: null })
                            .then((updated) => {
                              setItem(updated);
                              setAutosaveOrderDate('success');
                              triggerAutosaveReset(setAutosaveOrderDate, 'orderDate');
                            })
                            .catch(() => {
                              setAutosaveOrderDate('error');
                              triggerAutosaveReset(setAutosaveOrderDate, 'orderDate');
                            });
                        }
                      }}
                    >
                      ×
                    </button>
                  )}
                  <AutosaveIndicator state={autosaveOrderDate} />
                </div>
              </dd>
            </div>

            {/* Actual Delivery Date - inline editable */}
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                <label htmlFor="hi-actual-delivery">Actual Delivery</label>
              </dt>
              <dd className={styles.infoValue}>
                <div className={styles.inlineFieldWrapper}>
                  <input
                    type="date"
                    id="hi-actual-delivery"
                    className={styles.propertyInput}
                    value={localActualDeliveryDate}
                    onChange={(e) => setLocalActualDeliveryDate(e.target.value)}
                    onBlur={() => void handleActualDeliveryDateBlur()}
                    aria-label="Actual delivery date"
                  />
                  {localActualDeliveryDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label="Clear actual delivery date"
                      onClick={() => {
                        setLocalActualDeliveryDate('');
                        if (item?.actualDeliveryDate) {
                          setAutosaveActualDelivery('saving');
                          void updateHouseholdItem(id!, { actualDeliveryDate: null })
                            .then(async () => {
                              const fresh = await getHouseholdItem(id!);
                              setItem(fresh);
                              setLocalActualDeliveryDate(fresh.actualDeliveryDate || '');
                              setLocalOrderDate(fresh.orderDate || '');
                              setLocalEarliestDeliveryDate(fresh.earliestDeliveryDate || '');
                              setLocalLatestDeliveryDate(fresh.latestDeliveryDate || '');
                              setAutosaveActualDelivery('success');
                              triggerAutosaveReset(setAutosaveActualDelivery, 'actualDelivery');
                            })
                            .catch(() => {
                              setAutosaveActualDelivery('error');
                              triggerAutosaveReset(setAutosaveActualDelivery, 'actualDelivery');
                            });
                        }
                      }}
                    >
                      ×
                    </button>
                  )}
                  <AutosaveIndicator state={autosaveActualDelivery} />
                </div>
              </dd>
            </div>
          </dl>
        </section>

        {/* Dependencies card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Dependencies</h2>
          </div>

          {/* Earliest & Latest Delivery Date - inline editable constraints */}
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                <label htmlFor="hi-earliest-delivery">Earliest Delivery</label>
                {item.isLate && item.status !== 'arrived' && (
                  <span className={styles.lateChip}>Late</span>
                )}
              </dt>
              <dd className={styles.infoValue}>
                <div className={styles.inlineFieldWrapper}>
                  <input
                    type="date"
                    id="hi-earliest-delivery"
                    className={styles.propertyInput}
                    value={localEarliestDeliveryDate}
                    onChange={(e) => setLocalEarliestDeliveryDate(e.target.value)}
                    onBlur={() => void handleEarliestDeliveryDateBlur()}
                    aria-label="Earliest delivery date"
                  />
                  {localEarliestDeliveryDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label="Clear earliest delivery date"
                      onClick={() => {
                        setLocalEarliestDeliveryDate('');
                        if (item?.earliestDeliveryDate) {
                          setAutosaveEarliestDelivery('saving');
                          void updateHouseholdItem(id!, { earliestDeliveryDate: null })
                            .then(async () => {
                              const fresh = await getHouseholdItem(id!);
                              setItem(fresh);
                              setLocalActualDeliveryDate(fresh.actualDeliveryDate || '');
                              setLocalOrderDate(fresh.orderDate || '');
                              setLocalEarliestDeliveryDate(fresh.earliestDeliveryDate || '');
                              setLocalLatestDeliveryDate(fresh.latestDeliveryDate || '');
                              setAutosaveEarliestDelivery('success');
                              triggerAutosaveReset(setAutosaveEarliestDelivery, 'earliestDelivery');
                            })
                            .catch(() => {
                              setAutosaveEarliestDelivery('error');
                              triggerAutosaveReset(setAutosaveEarliestDelivery, 'earliestDelivery');
                            });
                        }
                      }}
                    >
                      ×
                    </button>
                  )}
                  <AutosaveIndicator state={autosaveEarliestDelivery} />
                </div>
              </dd>
            </div>

            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                <label htmlFor="hi-latest-delivery">Latest Delivery</label>
              </dt>
              <dd className={styles.infoValue}>
                <div className={styles.inlineFieldWrapper}>
                  <input
                    type="date"
                    id="hi-latest-delivery"
                    className={styles.propertyInput}
                    value={localLatestDeliveryDate}
                    onChange={(e) => setLocalLatestDeliveryDate(e.target.value)}
                    onBlur={() => void handleLatestDeliveryDateBlur()}
                    aria-label="Latest delivery date"
                  />
                  {localLatestDeliveryDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label="Clear latest delivery date"
                      onClick={() => {
                        setLocalLatestDeliveryDate('');
                        if (item?.latestDeliveryDate) {
                          setAutosaveLatestDelivery('saving');
                          void updateHouseholdItem(id!, { latestDeliveryDate: null })
                            .then((updated) => {
                              setItem(updated);
                              setAutosaveLatestDelivery('success');
                              triggerAutosaveReset(setAutosaveLatestDelivery, 'latestDelivery');
                            })
                            .catch(() => {
                              setAutosaveLatestDelivery('error');
                              triggerAutosaveReset(setAutosaveLatestDelivery, 'latestDelivery');
                            });
                        }
                      }}
                    >
                      ×
                    </button>
                  )}
                  <AutosaveIndicator state={autosaveLatestDelivery} />
                </div>
              </dd>
            </div>
          </dl>

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
                      <Link
                        to={`/project/work-items/${dep.predecessorId}`}
                        className={styles.depPredLink}
                      >
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

          {/* Inline dependency search */}
          <div className={styles.inlineSearch} ref={depDropdownRef}>
            <input
              ref={depSearchRef}
              type="text"
              placeholder="Search work items or milestones to add..."
              value={depSearchInput}
              onChange={(e) => {
                setDepSearchInput(e.target.value);
                setShowDepDropdown(true);
              }}
              onFocus={() => setShowDepDropdown(true)}
              className={styles.searchInput}
              disabled={isAddingDep}
              data-testid="dep-search-input"
              aria-label="Search work items or milestones to add as dependencies"
            />
            {showDepDropdown && depSearchInput.trim() && (
              <div className={styles.searchDropdown}>
                {/* Work items that match */}
                {allWorkItems
                  .filter((wi) => {
                    const alreadyLinked = dependencies.some(
                      (d) => d.predecessorType === 'work_item' && d.predecessorId === wi.id,
                    );
                    return (
                      !alreadyLinked &&
                      wi.title.toLowerCase().includes(depSearchInput.toLowerCase())
                    );
                  })
                  .map((wi) => (
                    <button
                      key={`wi-${wi.id}`}
                      type="button"
                      className={styles.searchDropdownItem}
                      onClick={() => void handleAddDepInline('work_item', wi.id)}
                      disabled={isAddingDep}
                    >
                      <span className={styles.itemTypeBadge}>Work Item</span>
                      <span>{wi.title}</span>
                    </button>
                  ))}
                {/* Milestones that match */}
                {allMilestones
                  .filter((ms) => {
                    const alreadyLinked = dependencies.some(
                      (d) => d.predecessorType === 'milestone' && d.predecessorId === String(ms.id),
                    );
                    return (
                      !alreadyLinked &&
                      ms.title.toLowerCase().includes(depSearchInput.toLowerCase())
                    );
                  })
                  .map((ms) => (
                    <button
                      key={`ms-${ms.id}`}
                      type="button"
                      className={styles.searchDropdownItem}
                      onClick={() => void handleAddDepInline('milestone', String(ms.id))}
                      disabled={isAddingDep}
                    >
                      <span className={styles.itemTypeBadgeMilestone}>Milestone</span>
                      <span>{ms.title}</span>
                    </button>
                  ))}
                {/* Empty state */}
                {allWorkItems.filter(
                  (wi) =>
                    !dependencies.some(
                      (d) => d.predecessorType === 'work_item' && d.predecessorId === wi.id,
                    ) && wi.title.toLowerCase().includes(depSearchInput.toLowerCase()),
                ).length === 0 &&
                  allMilestones.filter(
                    (ms) =>
                      !dependencies.some(
                        (d) =>
                          d.predecessorType === 'milestone' && d.predecessorId === String(ms.id),
                      ) && ms.title.toLowerCase().includes(depSearchInput.toLowerCase()),
                  ).length === 0 && (
                    <div className={styles.searchDropdownEmpty}>No items match your search</div>
                  )}
              </div>
            )}
            {depError && (
              <div role="alert" className={styles.errorBanner} style={{ marginTop: '0.5rem' }}>
                {depError}
              </div>
            )}
          </div>
        </section>

        {/* Budget Lines */}
        <section className={styles.section}>
          <BudgetSection
            budgetLines={budgetLines}
            subsidyPayback={subsidyPayback}
            linkedSubsidies={linkedSubsidies}
            availableSubsidies={availableSubsidies}
            budgetSectionHook={budgetSection}
            budgetSources={budgetSources}
            vendors={allVendors}
            staticCategoryLabel="Household Items"
            onLinkSubsidy={handleLinkSubsidy}
            onUnlinkSubsidy={handleUnlinkSubsidy}
            onConfirmDeleteBudgetLine={handleConfirmDeleteBudgetLine}
            budgetLineType="household_item"
            onLinkInvoice={handleLinkInvoice}
            onUnlinkInvoice={handleUnlinkInvoice}
            isUnlinking={isUnlinkingInvoice}
            inlineError={inlineError}
          />
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

      {/* Invoice link modal */}
      {showInvoiceLinkModal && invoiceLinkingBudgetId && (
        <InvoiceLinkModal
          budgetLineId={invoiceLinkingBudgetId}
          budgetLineType="household_item"
          defaultAmount={
            budgetLines.find((line) => line.id === invoiceLinkingBudgetId)?.plannedAmount || 0
          }
          onSuccess={handleInvoiceLinkSuccess}
          onClose={() => {
            setShowInvoiceLinkModal(false);
            setInvoiceLinkingBudgetId(null);
          }}
        />
      )}
    </div>
  );
}

export default HouseholdItemDetailPage;

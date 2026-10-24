import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { foldSearchText, routeUrl } from '@cornerstone/shared';
import type {
  HouseholdItemDetail,
  HouseholdItemStatus,
  HouseholdItemBudgetLine,
  SubsidyProgram,
  HouseholdItemSubsidyPaybackResponse,
  WorkItemSummary,
  HouseholdItemDepDetail,
  MilestoneSummary,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import {
  getHouseholdItem,
  deleteHouseholdItem,
  updateHouseholdItem,
} from '../../lib/householdItemsApi.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import {
  AutosaveIndicator,
  type AutosaveState,
} from '../../components/AutosaveIndicator/AutosaveIndicator.js';
import { fetchHouseholdItemBudgets } from '../../lib/householdItemBudgetsApi.js';
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
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { listWorkItems } from '../../lib/workItemsApi.js';
import { listMilestones } from '../../lib/milestonesApi.js';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { useAreas } from '../../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useToast } from '../../components/Toast/ToastContext.js';
import { DocumentsPanelButton } from '../../components/DocumentsPanel/index.js';
import { BudgetCostOverview } from '../../components/budget/BudgetCostOverview.js';
import { SubsidyLinkSection } from '../../components/budget/SubsidyLinkSection.js';
import { CostLinesSection } from '../../components/CostLineTable/index.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { purchaseTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeHouseholdItemStatus, householdItemStatusBody } from '../../lib/statusChangeApi.js';
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { AreaBreadcrumb } from '../../components/AreaBreadcrumb/index.js';
import { SearchPicker } from '../../components/SearchPicker/SearchPicker.js';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import styles from './HouseholdItemDetailPage.module.css';

interface PredecessorOption {
  readonly key: string;
  readonly title: string;
  readonly kind: 'work_item' | 'milestone';
  readonly area: WorkItemSummary['area'] | null;
}

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

/** Reads the route id once; the view below always has a purchase id. */
export function HouseholdItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('householdItems')} replace />;
  return <HouseholdItemDetailView id={id} />;
}

function HouseholdItemDetailView({ id }: { id: string }) {
  const {
    formatCurrency: _formatCurrency,
    formatDate,
    formatTime: _formatTime,
    formatDateTime: _formatDateTime,
  } = useFormatters();
  const { t } = useTranslation('householdItems');
  const { t: tSettings } = useTranslation('settings');
  const { t: tBudget } = useTranslation('budget');
  const { t: tCostLines } = useTranslation('costLines');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const statusVariants = useStatusBadgeVariants();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { areas } = useAreas();

  const [item, setItem] = useState<HouseholdItemDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const deleteConsequences = useDeleteImpact('household_item', showDeleteModal ? id : null);

  // Add Dependency inline search

  // Budget lines state
  const [budgetLines, setBudgetLines] = useState<HouseholdItemBudgetLine[]>([]);
  const [categories, setCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  // Subsidy linking state
  const [selectedSubsidyId, setSelectedSubsidyId] = useState('');
  const [isLinkingSubsidy, setIsLinkingSubsidy] = useState(false);
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);

  // Subsidy payback state
  const [subsidyPayback, setSubsidyPayback] = useState<HouseholdItemSubsidyPaybackResponse | null>(
    null,
  );

  // Dependency state
  const [dependencies, setDependencies] = useState<HouseholdItemDepDetail[]>([]);
  const [depError, setDepError] = useState<string | null>(null);
  const [removingDep, setRemovingDep] = useState<HouseholdItemDepDetail | null>(null);
  const [isRemovingDep, setIsRemovingDep] = useState(false);
  const [removeDepError, setRemoveDepError] = useState<string | null>(null);
  // For inline search results
  const [allMilestones, setAllMilestones] = useState<MilestoneSummary[]>([]);

  // Inline error for budget/subsidy/dependency operations
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [dateInlineError, setDateInlineError] = useState<string | null>(null);

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
  const autosaveResetRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Shared reload functions for budget-related data
  const reloadBudgetLines = async () => {
    try {
      const data = await fetchHouseholdItemBudgets(id);
      setBudgetLines(data);
    } catch (err) {
      console.error('Failed to reload budget lines:', err);
    }
  };

  const reloadLinkedSubsidies = async () => {
    try {
      const data = await fetchHouseholdItemSubsidies(id);
      setLinkedSubsidies(data);
    } catch (err) {
      console.error('Failed to reload linked subsidies:', err);
    }
  };

  const reloadSubsidyPayback = async () => {
    try {
      const data = await fetchHouseholdItemSubsidyPayback(id);
      setSubsidyPayback(data);
    } catch (err) {
      console.error('Failed to reload subsidy payback:', err);
    }
  };

  useEffect(() => {
    void loadItem();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- loadItem is defined in component body; effect re-runs on intended trigger only
  }, [id]);

  useEffect(() => {
    if (item) {
      /* eslint-disable @eslint-react/set-state-in-effect -- resets local date inputs when the item changes from server fetch */
      setLocalOrderDate(item.orderDate || '');
      setLocalActualDeliveryDate(item.actualDeliveryDate || '');
      setLocalEarliestDeliveryDate(item.earliestDeliveryDate || '');
      setLocalLatestDeliveryDate(item.latestDeliveryDate || '');
      /* eslint-enable @eslint-react/set-state-in-effect */
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- item identity changes on fetch; [item?.id] captures when the item object itself changes
  }, [item?.id]);

  // Add Dependency modal: focus trap and Escape key handler
  // Milestones are unpaginated, so the full list is loaded once; tasks are searched on the server
  useEffect(() => {
    const loadPredecessors = async () => {
      try {
        setAllMilestones(await listMilestones());
      } catch (err) {
        console.error('Failed to load predecessors:', err);
      }
    };
    void loadPredecessors();
  }, []);

  const loadItem = async () => {
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
          setError(t('detail.errors.itemNotFound'));
        } else {
          setError(translateApiError(err.error.code, tErrors));
        }
      } else if (err instanceof NetworkError) {
        setError(tCommon('requestErrors.network'));
      } else {
        setError(t('detail.errors.loadFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadBudgetData = async (itemId: string) => {
    try {
      const [budgets, subsidies, payback, programs, depsData, categoriesData] = await Promise.all([
        fetchHouseholdItemBudgets(itemId),
        fetchHouseholdItemSubsidies(itemId),
        fetchHouseholdItemSubsidyPayback(itemId),
        fetchSubsidyPrograms(),
        fetchHouseholdItemDeps(itemId),
        fetchHouseholdItemCategories(),
      ]);
      setBudgetLines(budgets);
      setLinkedSubsidies(subsidies);
      setSubsidyPayback(payback);
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
      showToast('success', t('detail.dependencies.addedSuccess'));
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDepError(translateApiError(err.error.code, tErrors));
      } else {
        showToast('error', t('detail.dependencies.failedAdd'));
      }
    }
  };

  const addingDepRef = useRef(false);
  const addPredecessor = async (key: string) => {
    if (addingDepRef.current) return;
    const sep = key.indexOf(':');
    const type = key.slice(0, sep) as 'work_item' | 'milestone';
    addingDepRef.current = true;
    try {
      await handleAddDepInline(type, key.slice(sep + 1));
    } finally {
      addingDepRef.current = false;
    }
  };

  const linkedKeys = dependencies.map((d) => `${d.predecessorType}:${d.predecessorId}`);

  const searchPredecessors = async (
    query: string,
    excluded: string[],
    signal: AbortSignal,
  ): Promise<PredecessorOption[]> => {
    const wanted = foldSearchText(query);
    const milestones: PredecessorOption[] = allMilestones
      .filter((m) => foldSearchText(m.title).includes(wanted))
      .map((m) => ({
        key: `milestone:${m.id}`,
        title: m.title,
        kind: 'milestone',
        area: null,
      }));
    const { items } = await listWorkItems(
      { q: query.trim() || undefined, pageSize: 50 },
      { signal },
    );
    const tasks: PredecessorOption[] = items.map((w) => ({
      key: `work_item:${w.id}`,
      title: w.title,
      kind: 'work_item',
      area: w.area ?? null,
    }));
    return [...tasks, ...milestones].filter((o) => !excluded.includes(o.key));
  };

  const handleRemoveDep = async () => {
    const dep = removingDep!;
    setIsRemovingDep(true);
    setRemoveDepError(null);
    try {
      await deleteHouseholdItemDep(id, dep.predecessorType, dep.predecessorId);
      const updated = await fetchHouseholdItemDeps(id);
      setDependencies(updated);
      const newItem = await getHouseholdItem(id);
      setItem(newItem);
      focusPageHeading();
      setRemovingDep(null);
      showToast('success', t('detail.dependencies.removedSuccess'));
    } catch {
      setRemoveDepError(t('detail.dependencies.failedRemove'));
    } finally {
      setIsRemovingDep(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteError('');
    setDeleteBlocked(false);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteError('');
  };

  // ─── Subsidy linking handlers ──────────────────────────────────────────────

  const handleLinkSubsidy = async () => {
    if (!selectedSubsidyId) return;
    setInlineError(null);
    setIsLinkingSubsidy(true);
    try {
      await linkHouseholdItemSubsidy(id, selectedSubsidyId);
      await reloadLinkedSubsidies();
      setSelectedSubsidyId('');
      await reloadSubsidyPayback();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setInlineError(t('detail.errors.alreadyLinkedSubsidy'));
        } else {
          setInlineError(translateApiError(err.error.code, tErrors));
        }
      } else if (err instanceof NetworkError) {
        setInlineError(tCommon('requestErrors.network'));
      } else {
        setInlineError(t('detail.errors.linkSubsidy'));
      }
      console.error('Failed to link subsidy:', err);
    } finally {
      setIsLinkingSubsidy(false);
    }
  };

  const handleUnlinkSubsidy = async (subsidyProgramId: string) => {
    setInlineError(null);
    try {
      await unlinkHouseholdItemSubsidy(id, subsidyProgramId);
      await reloadLinkedSubsidies();
      await reloadSubsidyPayback();
    } catch (err) {
      setInlineError(t('detail.errors.unlinkSubsidy'));
      console.error('Failed to unlink subsidy:', err);
    }
  };

  // After any cost-line change the page refreshes its lines, grant payback and linked grants.
  const handleCostLinesChanged = async () => {
    await Promise.all([reloadBudgetLines(), reloadSubsidyPayback(), reloadLinkedSubsidies()]);
    setInlineError(null);
  };

  function triggerAutosaveReset(setter: (v: AutosaveState) => void, key: string) {
    if (autosaveResetRef.current[key]) clearTimeout(autosaveResetRef.current[key]);
    autosaveResetRef.current[key] = setTimeout(() => setter('idle'), 2000);
  }

  const handleOrderDateBlur = async () => {
    const current = item!;
    if (localOrderDate === (current.orderDate || '')) return;
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
      setDateInlineError(t('detail.datesDelivery.failedUpdateOrderDate'));
    }
  };

  const handleActualDeliveryDateBlur = async () => {
    const current = item!;
    if (localActualDeliveryDate === (current.actualDeliveryDate || '')) return;
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
      setDateInlineError(t('detail.datesDelivery.failedUpdateActualDelivery'));
    }
  };

  const handleEarliestDeliveryDateBlur = async () => {
    const current = item!;
    if (localEarliestDeliveryDate === (current.earliestDeliveryDate || '')) return;
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
      setDateInlineError(t('detail.datesDelivery.failedUpdateEarliestDelivery'));
    }
  };

  const handleLatestDeliveryDateBlur = async () => {
    const current = item!;
    if (localLatestDeliveryDate === (current.latestDeliveryDate || '')) return;
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
      setDateInlineError(t('detail.datesDelivery.failedUpdateLatestDelivery'));
    }
  };

  const { run: runStatusChange } = useUndoableStatusChange();
  const handleStatusChange = async (newStatus: HouseholdItemStatus, date: string | null) => {
    const current = item!;
    setInlineError(null);
    await runStatusChange({
      request: () => changeHouseholdItemStatus(id, householdItemStatusBody(newStatus, date)),
      recordName: current.name.trim() || tCommon('navigation.untitledPurchase'),
      statusLabel: statusVariants.purchase[newStatus].label,
      dedupeKey: `purchase:${id}`,
      onChanged: (record) => setItem(record),
      onUndone: async () => setItem(await getHouseholdItem(id)),
    });
  };

  const handleAreaChange = async (areaId: string) => {
    setInlineError(null);
    try {
      const updated = await updateHouseholdItem(id, { areaId: areaId || null });
      setItem(updated);
      showToast('success', t('detail.area.updated'));
    } catch (err) {
      showToast('error', t('detail.area.updateFailed'));
      console.error('Failed to update area:', err);
    }
  };

  const handleDelete = async () => {
    const current = item!;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteHouseholdItem(current.id);
      showToast('success', t('detail.delete.deleted'));
      navigate(routeUrl('householdItems'), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteBlocked(err.statusCode === 409);
        setDeleteError(translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        setDeleteError(tCommon('requestErrors.network'));
      } else {
        setDeleteError(t('detail.errors.deleteFailed'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const displayName = item?.name.trim() || tCommon('navigation.untitledPurchase');
  const h1Text = isLoading
    ? tCommon('navigation.purchase')
    : is404
      ? tCommon('navigation.purchaseNotFound')
      : error || !item
        ? tCommon('navigation.purchase')
        : displayName;
  useDocumentTitle(h1Text);
  const originState = useOriginState(item && !isLoading ? displayName : undefined);
  const backToPurchases = tCommon('navigation.backTo', {
    origin: tCommon('navigation.purchases'),
  });

  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={styles.pageTitle}>{h1Text}</h1>
        <div className={styles.loading} role="status">
          {t('detail.loading')}
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <div className={styles.errorCard} role="alert">
          <h1 className={styles.errorTitle}>{h1Text}</h1>
          <p>{t('detail.notFoundMessage')}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate(routeUrl('householdItems'))}
            >
              {backToPurchases}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={styles.pageTitle}>{h1Text}</h1>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('detail.error')}</h2>
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => navigate(routeUrl('householdItems'))}
            >
              {backToPurchases}
            </button>
            <button type="button" className={styles.button} onClick={() => void loadItem()}>
              {t('detail.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availableSubsidies = allSubsidyPrograms.filter(
    (prog) => !linkedSubsidies.some((linked) => linked.id === prog.id),
  );

  const itemCategory = categories.find((c) => c.id === item.category);
  const categoryDisplayName = itemCategory
    ? getCategoryDisplayName(tSettings, itemCategory.name, itemCategory.translationKey)
    : null;

  return (
    <div className={styles.container}>
      <PageBreadcrumbs />
      <div className={styles.content}>
        {/* Page header */}
        <div className={styles.headerRow}>
          <div className={styles.pageHeading}>
            <h1 className={styles.pageTitle}>{displayName}</h1>
            <div className={styles.headerBadges}>
              {categoryDisplayName && (
                <span className={styles.categoryBadge}>{categoryDisplayName}</span>
              )}
              <StatusMenu
                testId="purchase-status"
                transitions={purchaseTransitions(tCommon, item)}
                badge={{ variants: statusVariants.purchase, value: item.status }}
                currentLabel={statusVariants.purchase[item.status].label}
                onApply={handleStatusChange}
              />
            </div>
          </div>
          <div className={styles.pageActions}>
            <button
              type="button"
              className={styles.editButton}
              onClick={() =>
                navigate(routeUrl('householdItemEdit', { id: item.id }), { state: originState })
              }
            >
              {t('detail.edit')}
            </button>
            <button type="button" className={styles.deleteButton} onClick={openDeleteModal}>
              {t('detail.delete.delete')}
            </button>
          </div>
        </div>

        {/* Details card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('detail.details.title')}</h2>
          </div>
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('detail.details.description')}</dt>
              <dd className={styles.descriptionValue}>{item.description ?? '\u2014'}</dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('detail.details.vendor')}</dt>
              <dd className={styles.infoValue}>
                {item.vendor ? (
                  <Link
                    to={routeUrl('company', { id: item.vendor.id })}
                    state={originState}
                    className={styles.infoLink}
                  >
                    {item.vendor.name}
                  </Link>
                ) : (
                  '\u2014'
                )}
              </dd>
            </div>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>{t('detail.details.productUrl')}</dt>
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
              <dt className={styles.infoLabel}>{t('detail.details.quantity')}</dt>
              <dd className={styles.infoValue}>{item.quantity}</dd>
            </div>
          </dl>
        </section>

        {/* Area card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('detail.area.title')}</h2>
          </div>
          <div>
            <label className={styles.propertyLabel}>{t('detail.area.label')}</label>
            <EntityPicker
              kind="area"
              areas={areas}
              value={item.area?.id || ''}
              onChange={(areaId) => void handleAreaChange(areaId)}
              noneLabel={tCommon('aria.noArea')}
            />
          </div>
        </section>

        {/* Dates & Delivery card */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{t('detail.datesDelivery.title')}</h2>
          </div>
          {dateInlineError && (
            <div className={styles.errorMessage} role="alert">
              <span>{dateInlineError}</span>
              <button
                type="button"
                className={styles.errorMessageClose}
                onClick={() => setDateInlineError(null)}
                aria-label={t('detail.closeErrorMessage')}
              >
                ×
              </button>
            </div>
          )}
          <dl className={styles.infoList}>
            {/* Schedule row showing target or actual date */}
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                {item.actualDeliveryDate
                  ? t('detail.datesDelivery.actualDate')
                  : t('detail.datesDelivery.targetDate')}
              </dt>
              <dd className={styles.infoValue}>
                {item.actualDeliveryDate ? (
                  <span
                    aria-label={t('detail.datesDelivery.actualDeliveryAria', {
                      actual: formatDate(item.actualDeliveryDate),
                      target: item.targetDeliveryDate
                        ? formatDate(item.targetDeliveryDate)
                        : t('detail.datesDelivery.targetNotSet'),
                    })}
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
                <label htmlFor="hi-order-date">{t('detail.datesDelivery.orderDate')}</label>
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
                    aria-label={t('detail.datesDelivery.orderDate')}
                  />
                  {localOrderDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label={t('detail.datesDelivery.clearOrderDate')}
                      onClick={() => {
                        setLocalOrderDate('');
                        if (item.orderDate) {
                          setAutosaveOrderDate('saving');
                          void updateHouseholdItem(id, { orderDate: null })
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
                <label htmlFor="hi-actual-delivery">
                  {t('detail.datesDelivery.actualDelivery')}
                </label>
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
                    aria-label={t('detail.datesDelivery.actualDelivery')}
                  />
                  {localActualDeliveryDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label={t('detail.datesDelivery.clearActualDelivery')}
                      onClick={() => {
                        setLocalActualDeliveryDate('');
                        if (item.actualDeliveryDate) {
                          setAutosaveActualDelivery('saving');
                          void updateHouseholdItem(id, { actualDeliveryDate: null })
                            .then(async () => {
                              const fresh = await getHouseholdItem(id);
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
            <h2 className={styles.cardTitle}>{t('detail.dependencies.title')}</h2>
          </div>

          {/* Earliest & Latest Delivery Date - inline editable constraints */}
          <dl className={styles.infoList}>
            <div className={styles.infoRow}>
              <dt className={styles.infoLabel}>
                <label htmlFor="hi-earliest-delivery">
                  {t('detail.datesDelivery.earliestDelivery')}
                </label>
                {item.isLate && item.status !== 'arrived' && (
                  <span className={styles.lateChip}>{t('detail.status.late')}</span>
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
                    aria-label={t('detail.datesDelivery.earliestDelivery')}
                  />
                  {localEarliestDeliveryDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label={t('detail.datesDelivery.clearEarliestDelivery')}
                      onClick={() => {
                        setLocalEarliestDeliveryDate('');
                        if (item.earliestDeliveryDate) {
                          setAutosaveEarliestDelivery('saving');
                          void updateHouseholdItem(id, { earliestDeliveryDate: null })
                            .then(async () => {
                              const fresh = await getHouseholdItem(id);
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
                <label htmlFor="hi-latest-delivery">
                  {t('detail.datesDelivery.latestDelivery')}
                </label>
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
                    aria-label={t('detail.datesDelivery.latestDelivery')}
                  />
                  {localLatestDeliveryDate && (
                    <button
                      type="button"
                      className={styles.clearDateButton}
                      aria-label={t('detail.datesDelivery.clearLatestDelivery')}
                      onClick={() => {
                        setLocalLatestDeliveryDate('');
                        if (item.latestDeliveryDate) {
                          setAutosaveLatestDelivery('saving');
                          void updateHouseholdItem(id, { latestDeliveryDate: null })
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
            <p className={styles.emptyState}>{t('detail.dependencies.noDependencies')}</p>
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
                      {dep.predecessorType === 'work_item'
                        ? t('detail.dependencies.workItem')
                        : t('detail.dependencies.milestone')}
                    </span>
                    {dep.predecessorType === 'work_item' ? (
                      <>
                        <Link
                          to={routeUrl('workItem', { id: dep.predecessorId })}
                          state={originState}
                          className={styles.depPredLink}
                        >
                          {dep.predecessor.title}
                        </Link>
                        <AreaBreadcrumb area={dep.predecessor.area ?? null} variant="compact" />
                      </>
                    ) : (
                      <span className={styles.depPredLabel}>{dep.predecessor.title}</span>
                    )}
                    <button
                      type="button"
                      className={styles.unlinkButton}
                      onClick={() => {
                        setRemoveDepError(null);
                        setRemovingDep(dep);
                      }}
                      aria-label={`${t('detail.dependencies.removeDependency')} ${dep.predecessor.title}`}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Inline dependency search (server search for tasks; milestones are the full list) */}
          <div className={styles.inlineSearch}>
            <SearchPicker<PredecessorOption>
              id="household-item-dependency-search"
              value=""
              onChange={() => {}}
              onSelectItem={(option) => void addPredecessor(option.id)}
              clearOnSelect
              excludeIds={linkedKeys}
              placeholder={t('detail.dependencies.search')}
              inputAriaProps={{ 'aria-label': t('detail.dependencies.search') }}
              noResultsMessage={t('detail.dependencies.noMatches')}
              searchFn={searchPredecessors}
              renderItem={(o) => ({ id: o.key, label: o.title })}
              renderSecondary={(o) => (
                <>
                  <span
                    className={
                      o.kind === 'milestone' ? styles.itemTypeBadgeMilestone : styles.itemTypeBadge
                    }
                  >
                    {o.kind === 'milestone'
                      ? t('detail.dependencies.milestone')
                      : t('detail.dependencies.workItem')}
                  </span>
                  {o.kind === 'work_item' && <AreaBreadcrumb area={o.area} variant="compact" />}
                </>
              )}
            />
            {depError && (
              <div role="alert" className={`${styles.errorBanner} ${styles.errorBannerSpacingTop}`}>
                {depError}
              </div>
            )}
          </div>
        </section>

        {/* Cost */}
        <section className={styles.section} aria-labelledby="purchase-cost-heading">
          <h2 id="purchase-cost-heading" className={styles.costTitle}>
            {tCostLines('section.costHeading')}
          </h2>

          {inlineError && (
            <div className={styles.costErrorBanner} role="alert">
              {inlineError}
              <button
                type="button"
                className={styles.costErrorClose}
                onClick={() => setInlineError(null)}
                aria-label={tBudget('invoiceDetail.budgetLines.dismissErrorAriaLabel')}
              >
                ×
              </button>
            </div>
          )}

          <BudgetCostOverview budgetLines={budgetLines} subsidyPayback={subsidyPayback} />

          <CostLinesSection
            host={{ kind: 'household_item', id: item.id, label: item.name }}
            lines={budgetLines}
            onChanged={handleCostLinesChanged}
            linkState={originState}
            headingLevel={3}
          />

          <div className={styles.grantsSubsection}>
            <h3 className={styles.subsectionTitle}>{tBudget('budgetSection.subsidies')}</h3>
            <SubsidyLinkSection
              linkedSubsidies={linkedSubsidies}
              availableSubsidies={availableSubsidies}
              selectedSubsidyId={selectedSubsidyId}
              onSelectSubsidy={setSelectedSubsidyId}
              onLinkSubsidy={handleLinkSubsidy}
              onUnlinkSubsidy={handleUnlinkSubsidy}
              isLinking={isLinkingSubsidy}
            />
          </div>
        </section>

        {/* Documents section */}
        <DocumentsPanelButton entityType="household_item" entityId={id} />

        {/* Metadata card */}
        <section className={styles.card}>
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>{t('detail.metadata.createdBy')}</span>
              <span className={styles.infoValue}>{item.createdBy?.displayName ?? '\u2014'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>{t('detail.metadata.createdAt')}</span>
              <span className={styles.infoValue}>{formatDate(item.createdAt)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.infoLabel}>{t('detail.metadata.updatedAt')}</span>
              <span className={styles.infoValue}>{formatDate(item.updatedAt)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Delete confirmation */}
      {showDeleteModal && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: displayName })}
          consequences={deleteConsequences}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeleting}
          error={deleteError || null}
          blocked={deleteBlocked}
          onConfirm={() => void handleDelete()}
          onCancel={closeDeleteModal}
          testIdPrefix="purchase-delete"
        />
      )}

      {/* Dependency removal confirmation */}
      {removingDep && (
        <ConfirmDialog
          title={t('detail.dependencies.removeTitle')}
          lead={removingDep.predecessor.title}
          confirmLabel={t('detail.dependencies.confirm')}
          busyLabel={t('detail.dependencies.removing')}
          busy={isRemovingDep}
          error={removeDepError}
          onConfirm={() => void handleRemoveDep()}
          onCancel={() => setRemovingDep(null)}
          testIdPrefix="purchase-dependency-remove"
        />
      )}
    </div>
  );
}

export default HouseholdItemDetailPage;

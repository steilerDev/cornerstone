import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type {
  WorkItemDetail,
  WorkItemStatus,
  UserResponse,
  NoteResponse,
  SubtaskResponse,
  DependencyResponse,
  BudgetCategory,
  BudgetSource,
  Vendor,
  SubsidyProgram,
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  WorkItemMilestones,
  MilestoneSummary,
  WorkItemSubsidyPaybackResponse,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import {
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
  fetchWorkItemSubsidies,
  linkWorkItemSubsidy,
  unlinkWorkItemSubsidy,
  fetchWorkItemSubsidyPayback,
} from '../../lib/workItemsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import {
  fetchWorkItemBudgets,
  createWorkItemBudget,
  updateWorkItemBudget,
  deleteWorkItemBudget,
} from '../../lib/workItemBudgetsApi.js';
import {
  createInvoiceBudgetLine,
  deleteInvoiceBudgetLine,
} from '../../lib/invoiceBudgetLinesApi.js';
import { listNotes, createNote, updateNote, deleteNote } from '../../lib/notesApi.js';
import {
  listSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
} from '../../lib/subtasksApi.js';
import { getDependencies, createDependency, deleteDependency } from '../../lib/dependenciesApi.js';
import { listUsers } from '../../lib/usersApi.js';
import { useAreas } from '../../hooks/useAreas.js';
import { fetchBudgetCategories } from '../../lib/budgetCategoriesApi.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { fetchVendors } from '../../lib/vendorsApi.js';
import { fetchSubsidyPrograms } from '../../lib/subsidyProgramsApi.js';
import { listMilestones } from '../../lib/milestonesApi.js';
import {
  getWorkItemMilestones,
  addRequiredMilestone,
  removeRequiredMilestone,
  addLinkedMilestone,
  removeLinkedMilestone,
} from '../../lib/workItemMilestonesApi.js';
import { fetchLinkedHouseholdItems } from '../../lib/householdItemWorkItemsApi.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { AreaPicker } from '../../components/AreaPicker/AreaPicker.js';
import {
  AssignmentPicker,
  decodeAssignment,
  encodeAssignment,
} from '../../components/AssignmentPicker/AssignmentPicker.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { BudgetSection } from '../../components/budget/BudgetSection.js';
import { InvoiceLinkModal } from '../../components/budget/InvoiceLinkModal.js';
import {
  DependencySentenceBuilder,
  DependencySentenceDisplay,
} from '../../components/DependencySentenceBuilder/index.js';
import type { DependencyType } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { AutosaveIndicator } from '../../components/AutosaveIndicator/AutosaveIndicator.js';
import type { AutosaveState } from '../../components/AutosaveIndicator/AutosaveIndicator.js';
import { LinkedDocumentsSection } from '../../components/documents/LinkedDocumentsSection.js';
import { useBudgetSection, type BudgetLineFormState } from '../../hooks/useBudgetSection.js';
import styles from './WorkItemDetailPage.module.css';

interface DeletingDependency {
  type: 'predecessor' | 'successor';
  workItemId: string;
  title: string;
}

export default function WorkItemDetailPage() {
  const { formatCurrency, formatDate, formatTime, formatDateTime } = useFormatters();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: string; view?: string } | null;
  const fromTimeline = locationState?.from === 'schedule';
  const fromView = locationState?.view;
  const { user } = useAuth();
  const { t } = useTranslation('workItems');
  const { areas } = useAreas();

  // Household item labels (moved from module level to use i18n)
  const HOUSEHOLD_ITEM_CATEGORY_LABELS: Record<HouseholdItemCategory, string> = useMemo(
    () => ({
      furniture: t('detail.householdItems.categories.furniture')!,
      appliances: t('detail.householdItems.categories.appliances')!,
      fixtures: t('detail.householdItems.categories.fixtures')!,
      decor: t('detail.householdItems.categories.decor')!,
      electronics: t('detail.householdItems.categories.electronics')!,
      outdoor: t('detail.householdItems.categories.outdoor')!,
      storage: t('detail.householdItems.categories.storage')!,
      other: t('detail.householdItems.categories.other')!,
    }),
    [t],
  );

  const HOUSEHOLD_ITEM_STATUS_LABELS: Record<HouseholdItemStatus, string> = useMemo(
    () => ({
      planned: t('detail.householdItems.statuses.planned')!,
      purchased: t('detail.householdItems.statuses.purchased')!,
      scheduled: t('detail.householdItems.statuses.scheduled')!,
      arrived: t('detail.householdItems.statuses.arrived')!,
    }),
    [t],
  );

  const [workItem, setWorkItem] = useState<WorkItemDetail | null>(null);
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskResponse[]>([]);
  const [dependencies, setDependencies] = useState<{
    predecessors: DependencyResponse[];
    successors: DependencyResponse[];
  }>({ predecessors: [], successors: [] });

  const [users, setUsers] = useState<UserResponse[]>([]);

  // Budget lines state
  const [budgetLines, setBudgetLines] = useState<WorkItemBudgetLine[]>([]);
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);

  // Invoice linking state
  const [showInvoiceLinkModal, setShowInvoiceLinkModal] = useState(false);
  const [invoiceLinkingBudgetId, setInvoiceLinkingBudgetId] = useState<string | null>(null);
  const [isUnlinkingInvoice, setIsUnlinkingInvoice] = useState<Record<string, boolean>>({});

  // Subsidy linking state (linked subsidies and programs stay as local state)
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);

  // Subsidy payback state
  const [subsidyPayback, setSubsidyPayback] = useState<WorkItemSubsidyPaybackResponse | null>(null);

  // Linked household items state
  const [linkedHouseholdItems, setLinkedHouseholdItems] = useState<
    WorkItemLinkedHouseholdItemSummary[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');

  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editedNoteContent, setEditedNoteContent] = useState('');

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editedSubtaskTitle, setEditedSubtaskTitle] = useState('');

  const [isAddingDependency, setIsAddingDependency] = useState(false);

  // Milestone relationships state
  const [workItemMilestones, setWorkItemMilestones] = useState<WorkItemMilestones>({
    required: [],
    linked: [],
  });
  const [allMilestones, setAllMilestones] = useState<MilestoneSummary[]>([]);
  const [selectedRequiredMilestoneId, setSelectedRequiredMilestoneId] = useState('');
  const [selectedLinkedMilestoneId, setSelectedLinkedMilestoneId] = useState('');
  const [isAddingRequiredMilestone, setIsAddingRequiredMilestone] = useState(false);
  const [isAddingLinkedMilestone, setIsAddingLinkedMilestone] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const [inlineError, setInlineError] = useState<string | null>(null);

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Shared reload functions for budget-related data
  const reloadBudgetLines = async () => {
    if (!id) return;
    try {
      const data = await fetchWorkItemBudgets(id);
      setBudgetLines(data);
    } catch (err) {
      console.error('Failed to reload budget lines:', err);
    }
  };

  const reloadLinkedSubsidies = async () => {
    if (!id) return;
    try {
      const data = await fetchWorkItemSubsidies(id);
      setLinkedSubsidies(data);
    } catch (err) {
      console.error('Failed to reload linked subsidies:', err);
    }
  };

  const reloadSubsidyPayback = async () => {
    if (!id) return;
    try {
      const data = await fetchWorkItemSubsidyPayback(id);
      setSubsidyPayback(data);
    } catch (err) {
      console.error('Failed to reload subsidy payback:', err);
    }
  };

  // Budget section hook
  const budgetSection = useBudgetSection<WorkItemBudgetLine>({
    api: {
      fetchBudgets: fetchWorkItemBudgets,
      createBudget: createWorkItemBudget,
      updateBudget: updateWorkItemBudget,
      deleteBudget: deleteWorkItemBudget,
    },
    reloadBudgetLines,
    reloadSubsidyPayback,
    reloadLinkedSubsidies,
    toFormState: (line: WorkItemBudgetLine): BudgetLineFormState => ({
      description: line.description ?? '',
      plannedAmount: String(line.plannedAmount),
      confidence: line.confidence,
      budgetCategoryId: line.budgetCategory?.id ?? '',
      budgetSourceId: line.budgetSource?.id ?? '',
      vendorId: line.vendor?.id ?? '',
      pricingMode: line.quantity !== null ? 'unit' : 'direct',
      quantity: line.quantity !== null ? String(line.quantity) : '',
      unit: line.unit ?? '',
      unitPrice: line.unitPrice !== null ? String(line.unitPrice) : '',
      includesVat: line.quantity !== null ? (line.includesVat ?? true) : false,
    }),
    toPayload: (form: BudgetLineFormState): CreateWorkItemBudgetRequest => ({
      description: form.description.trim() || null,
      plannedAmount:
        form.pricingMode === 'direct' && form.includesVat
          ? Math.round((parseFloat(form.plannedAmount) / 1.19) * 100) / 100
          : parseFloat(form.plannedAmount),
      confidence: form.confidence,
      budgetCategoryId: form.budgetCategoryId || null,
      budgetSourceId: form.budgetSourceId,
      vendorId: form.vendorId || null,
      quantity: form.pricingMode === 'unit' && form.quantity ? parseFloat(form.quantity) : null,
      unit: form.pricingMode === 'unit' && form.unit ? form.unit : null,
      unitPrice: form.pricingMode === 'unit' && form.unitPrice ? parseFloat(form.unitPrice) : null,
      includesVat: form.pricingMode === 'unit' ? form.includesVat : null,
    }),
    entityId: id ?? '',
    defaultBudgetSourceId: budgetSources.find((s) => s.isDiscretionary)?.id,
  });

  // Local state for duration/constraint inputs (onBlur save pattern to avoid race conditions)
  const [localDuration, setLocalDuration] = useState<string>('');
  const [localStartAfter, setLocalStartAfter] = useState<string>('');
  const [localStartBefore, setLocalStartBefore] = useState<string>('');
  const [localActualStartDate, setLocalActualStartDate] = useState<string>('');
  const [localActualEndDate, setLocalActualEndDate] = useState<string>('');

  // Autosave indicator state per inline-edited field
  const [autosaveDuration, setAutosaveDuration] = useState<AutosaveState>('idle');
  const [autosaveStartAfter, setAutosaveStartAfter] = useState<AutosaveState>('idle');
  const [autosaveStartBefore, setAutosaveStartBefore] = useState<AutosaveState>('idle');
  const [autosaveActualStart, setAutosaveActualStart] = useState<AutosaveState>('idle');
  const [autosaveActualEnd, setAutosaveActualEnd] = useState<AutosaveState>('idle');
  // Timeouts to auto-reset indicator back to idle after success/error
  const autosaveResetRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function triggerAutosaveReset(setter: (v: AutosaveState) => void, key: string) {
    if (autosaveResetRefs.current[key]) {
      clearTimeout(autosaveResetRefs.current[key]);
    }
    autosaveResetRefs.current[key] = setTimeout(() => {
      setter('idle');
    }, 2000);
  }

  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null);
  const [deletingDependency, setDeletingDependency] = useState<DeletingDependency | null>(null);

  // Load all data on mount
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      setIs404(false);

      try {
        const [
          workItemData,
          notesData,
          subtasksData,
          depsData,
          usersData,
          categoriesData,
          sourcesData,
          vendorsData,
          budgetLinesData,
          subsidiesData,
          linkedSubsidiesData,
          workItemMilestonesData,
          allMilestonesData,
          subsidyPaybackData,
          linkedHouseholdItemsData,
        ] = await Promise.all([
          getWorkItem(id!),
          listNotes(id!),
          listSubtasks(id!),
          getDependencies(id!),
          listUsers(),
          fetchBudgetCategories(),
          fetchBudgetSources(),
          fetchVendors({ pageSize: 100 }),
          fetchWorkItemBudgets(id!),
          fetchSubsidyPrograms(),
          fetchWorkItemSubsidies(id!),
          getWorkItemMilestones(id!),
          listMilestones(),
          fetchWorkItemSubsidyPayback(id!),
          fetchLinkedHouseholdItems(id!),
        ]);

        setWorkItem(workItemData);
        setLocalDuration(
          workItemData.durationDays != null ? String(workItemData.durationDays) : '',
        );
        setLocalStartAfter(workItemData.startAfter || '');
        setLocalStartBefore(workItemData.startBefore || '');
        setLocalActualStartDate(workItemData.actualStartDate || '');
        setLocalActualEndDate(workItemData.actualEndDate || '');
        setNotes(notesData.notes);
        setSubtasks(subtasksData.subtasks);
        setDependencies(depsData);
        setUsers(usersData.users.filter((u) => !u.deactivatedAt));
        setBudgetCategories(categoriesData.categories);
        setBudgetSources(sourcesData.budgetSources);
        setAllVendors(vendorsData.vendors);
        setBudgetLines(budgetLinesData);
        setAllSubsidyPrograms(subsidiesData.subsidyPrograms);
        setLinkedSubsidies(linkedSubsidiesData);
        setWorkItemMilestones(workItemMilestonesData);
        setAllMilestones(allMilestonesData);
        setSubsidyPayback(subsidyPaybackData);
        setLinkedHouseholdItems(linkedHouseholdItemsData);
      } catch (err: unknown) {
        if ((err as { statusCode?: number })?.statusCode === 404) {
          setIs404(true);
        } else {
          setError('Failed to load work item. Please try again.');
        }
        console.error('Failed to load work item:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id]);

  // Reload work item details after changes
  const reloadWorkItem = async () => {
    if (!id) return;
    try {
      const updated = await getWorkItem(id);
      setWorkItem(updated);
      setLocalDuration(updated.durationDays != null ? String(updated.durationDays) : '');
      setLocalStartAfter(updated.startAfter || '');
      setLocalStartBefore(updated.startBefore || '');
      setLocalActualStartDate(updated.actualStartDate || '');
      setLocalActualEndDate(updated.actualEndDate || '');
    } catch (err) {
      console.error('Failed to reload work item:', err);
    }
  };

  const reloadNotes = async () => {
    if (!id) return;
    try {
      const notesData = await listNotes(id);
      setNotes(notesData.notes);
    } catch (err) {
      console.error('Failed to reload notes:', err);
    }
  };

  const reloadSubtasks = async () => {
    if (!id) return;
    try {
      const subtasksData = await listSubtasks(id);
      setSubtasks(subtasksData.subtasks);
    } catch (err) {
      console.error('Failed to reload subtasks:', err);
    }
  };

  const reloadDependencies = async () => {
    if (!id) return;
    try {
      const depsData = await getDependencies(id);
      setDependencies(depsData);
    } catch (err) {
      console.error('Failed to reload dependencies:', err);
    }
  };

  const reloadWorkItemMilestones = async () => {
    if (!id) return;
    try {
      const data = await getWorkItemMilestones(id);
      setWorkItemMilestones(data);
    } catch (err) {
      console.error('Failed to reload work item milestones:', err);
    }
  };

  // ─── Budget line handlers (delegated to useBudgetSection hook) ────────────

  const {
    confirmDeleteBudgetLine,
    handleLinkSubsidy: hookHandleLinkSubsidy,
    handleUnlinkSubsidy: hookHandleUnlinkSubsidy,
    deletingBudgetId,
    selectedSubsidyId,
    setDeletingBudgetId,
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
      await linkWorkItemSubsidy(id, selectedSubsidyId);
      await hookHandleLinkSubsidy();
      await reloadSubsidyPayback();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setInlineError('This subsidy program is already linked');
        } else {
          setInlineError(err.error.message);
        }
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
      await unlinkWorkItemSubsidy(id, subsidyProgramId);
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

  // ─── Milestone relationship handlers ──────────────────────────────────────

  const handleAddRequiredMilestone = async () => {
    if (!id || !selectedRequiredMilestoneId) return;
    setIsAddingRequiredMilestone(true);
    setInlineError(null);
    try {
      await addRequiredMilestone(id, Number(selectedRequiredMilestoneId));
      setSelectedRequiredMilestoneId('');
      await reloadWorkItemMilestones();
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError('This milestone is already a required dependency');
      } else {
        setInlineError('Failed to add required milestone');
      }
      console.error('Failed to add required milestone:', err);
    } finally {
      setIsAddingRequiredMilestone(false);
    }
  };

  const handleRemoveRequiredMilestone = async (milestoneId: number) => {
    if (!id) return;
    setInlineError(null);
    try {
      await removeRequiredMilestone(id, milestoneId);
      await reloadWorkItemMilestones();
    } catch (err) {
      setInlineError('Failed to remove required milestone');
      console.error('Failed to remove required milestone:', err);
    }
  };

  const handleAddLinkedMilestone = async () => {
    if (!id || !selectedLinkedMilestoneId) return;
    setIsAddingLinkedMilestone(true);
    setInlineError(null);
    try {
      await addLinkedMilestone(id, Number(selectedLinkedMilestoneId));
      setSelectedLinkedMilestoneId('');
      await reloadWorkItemMilestones();
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError('This milestone is already linked');
      } else {
        setInlineError('Failed to add linked milestone');
      }
      console.error('Failed to add linked milestone:', err);
    } finally {
      setIsAddingLinkedMilestone(false);
    }
  };

  const handleRemoveLinkedMilestone = async (milestoneId: number) => {
    if (!id) return;
    setInlineError(null);
    try {
      await removeLinkedMilestone(id, milestoneId);
      await reloadWorkItemMilestones();
    } catch (err) {
      setInlineError('Failed to remove linked milestone');
      console.error('Failed to remove linked milestone:', err);
    }
  };

  // Title editing
  const startEditingTitle = () => {
    if (!workItem) return;
    setEditedTitle(workItem.title);
    setIsEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!id || !editedTitle.trim()) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { title: editedTitle.trim() });
      setIsEditingTitle(false);
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update title');
      console.error('Failed to update title:', err);
    }
  };

  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  // Description editing
  const startEditingDescription = () => {
    if (!workItem) return;
    setEditedDescription(workItem.description || '');
    setIsEditingDescription(true);
  };

  const saveDescription = async () => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { description: editedDescription.trim() || null });
      setIsEditingDescription(false);
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update description');
      console.error('Failed to update description:', err);
    }
  };

  const cancelDescriptionEdit = () => {
    setIsEditingDescription(false);
    setEditedDescription('');
  };

  // Status change
  const handleStatusChange = async (newStatus: WorkItemStatus) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { status: newStatus });
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update status');
      console.error('Failed to update status:', err);
    }
  };

  // Assigned user change
  const handleAssignmentChange = async (assignmentValue: string) => {
    if (!id) return;
    setInlineError(null);
    const { userId, vendorId } = decodeAssignment(assignmentValue);
    try {
      await updateWorkItem(id, {
        assignedUserId: userId || null,
        assignedVendorId: vendorId || null,
      });
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update assignment');
      console.error('Failed to update assignment:', err);
    }
  };

  const handleAreaChange = async (areaId: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { areaId: areaId || null });
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update area');
      console.error('Failed to update area:', err);
    }
  };

  // Duration change — saves onBlur to avoid race conditions from rapid keystroke API calls
  const handleDurationBlur = async () => {
    if (!id || !workItem) return;
    const duration = localDuration ? Number(localDuration) : null;
    if (duration !== null && (isNaN(duration) || duration < 0)) return;

    // Only save if the value actually changed
    const currentDuration = workItem.durationDays;
    if (duration === currentDuration) return;

    setInlineError(null);
    setAutosaveDuration('saving');
    try {
      await updateWorkItem(id, { durationDays: duration });
      await reloadWorkItem();
      setAutosaveDuration('success');
      triggerAutosaveReset(setAutosaveDuration, 'duration');
    } catch (err) {
      setAutosaveDuration('error');
      triggerAutosaveReset(setAutosaveDuration, 'duration');
      setInlineError('Failed to update duration');
      console.error('Failed to update duration:', err);
    }
  };

  // Constraint changes — saves onBlur to avoid race conditions
  const handleConstraintBlur = async (field: 'startAfter' | 'startBefore') => {
    if (!id || !workItem) return;
    const localValue = field === 'startAfter' ? localStartAfter : localStartBefore;
    const currentValue = workItem[field] || '';

    // Only save if the value actually changed
    if (localValue === currentValue) return;

    setInlineError(null);
    const setter = field === 'startAfter' ? setAutosaveStartAfter : setAutosaveStartBefore;
    setter('saving');
    try {
      await updateWorkItem(id, { [field]: localValue || null });
      await reloadWorkItem();
      setter('success');
      triggerAutosaveReset(setter, field);
    } catch (err) {
      setter('error');
      triggerAutosaveReset(setter, field);
      setInlineError(`Failed to update ${field}`);
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Actual date changes — saves onBlur, allows manual override or clearing
  const handleActualDateBlur = async (field: 'actualStartDate' | 'actualEndDate') => {
    if (!id || !workItem) return;
    const localValue = field === 'actualStartDate' ? localActualStartDate : localActualEndDate;
    const currentValue = workItem[field] || '';

    // Only save if the value actually changed
    if (localValue === currentValue) return;

    setInlineError(null);
    const setter = field === 'actualStartDate' ? setAutosaveActualStart : setAutosaveActualEnd;
    setter('saving');
    try {
      await updateWorkItem(id, { [field]: localValue || null });
      await reloadWorkItem();
      setter('success');
      triggerAutosaveReset(setter, field);
    } catch (err) {
      setter('error');
      triggerAutosaveReset(setter, field);
      setInlineError(
        `Failed to update ${field === 'actualStartDate' ? 'actual start date' : 'actual end date'}`,
      );
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Notes
  const handleAddNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newNoteContent.trim()) return;

    setIsAddingNote(true);
    setInlineError(null);
    try {
      await createNote(id, { content: newNoteContent.trim() });
      setNewNoteContent('');
      await reloadNotes();
    } catch (err) {
      setInlineError('Failed to add note');
      console.error('Failed to add note:', err);
    } finally {
      setIsAddingNote(false);
    }
  };

  const startEditingNote = (note: NoteResponse) => {
    setEditingNoteId(note.id);
    setEditedNoteContent(note.content);
  };

  const saveNoteEdit = async (noteId: string) => {
    if (!id || !editedNoteContent.trim()) return;
    setInlineError(null);
    try {
      await updateNote(id, noteId, { content: editedNoteContent.trim() });
      setEditingNoteId(null);
      setEditedNoteContent('');
      await reloadNotes();
    } catch (err) {
      setInlineError('Failed to update note');
      console.error('Failed to update note:', err);
    }
  };

  const cancelNoteEdit = () => {
    setEditingNoteId(null);
    setEditedNoteContent('');
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!id) return;
    setDeletingNoteId(noteId);
  };

  const confirmDeleteNote = async () => {
    if (!id || !deletingNoteId) return;
    setInlineError(null);
    try {
      await deleteNote(id, deletingNoteId);
      setDeletingNoteId(null);
      await reloadNotes();
    } catch (err) {
      setInlineError('Failed to delete note');
      console.error('Failed to delete note:', err);
    }
  };

  // Subtasks
  const handleAddSubtask = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newSubtaskTitle.trim()) return;

    setIsAddingSubtask(true);
    setInlineError(null);
    try {
      await createSubtask(id, { title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      await reloadSubtasks();
    } catch (err) {
      setInlineError('Failed to add subtask');
      console.error('Failed to add subtask:', err);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, isCompleted: boolean) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateSubtask(id, subtaskId, { isCompleted });
      await reloadSubtasks();
    } catch (err) {
      setInlineError('Failed to update subtask');
      console.error('Failed to update subtask:', err);
    }
  };

  const startEditingSubtask = (subtask: SubtaskResponse) => {
    setEditingSubtaskId(subtask.id);
    setEditedSubtaskTitle(subtask.title);
  };

  const saveSubtaskEdit = async (subtaskId: string) => {
    if (!id || !editedSubtaskTitle.trim()) return;
    setInlineError(null);
    try {
      await updateSubtask(id, subtaskId, { title: editedSubtaskTitle.trim() });
      setEditingSubtaskId(null);
      setEditedSubtaskTitle('');
      await reloadSubtasks();
    } catch (err) {
      setInlineError('Failed to update subtask');
      console.error('Failed to update subtask:', err);
    }
  };

  const cancelSubtaskEdit = () => {
    setEditingSubtaskId(null);
    setEditedSubtaskTitle('');
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!id) return;
    setDeletingSubtaskId(subtaskId);
  };

  const confirmDeleteSubtask = async () => {
    if (!id || !deletingSubtaskId) return;
    setInlineError(null);
    try {
      await deleteSubtask(id, deletingSubtaskId);
      setDeletingSubtaskId(null);
      await reloadSubtasks();
    } catch (err) {
      setInlineError('Failed to delete subtask');
      console.error('Failed to delete subtask:', err);
    }
  };

  const handleMoveSubtask = async (index: number, direction: 'up' | 'down') => {
    if (!id) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= subtasks.length) return;

    const reordered = [...subtasks];
    const [moved] = reordered.splice(index, 1);
    // moved is guaranteed to exist because index is valid (guarded by bounds check above)
    reordered.splice(newIndex, 0, moved!);

    setInlineError(null);
    try {
      await reorderSubtasks(id, { subtaskIds: reordered.map((s) => s.id) });
      await reloadSubtasks();
    } catch (err) {
      setInlineError('Failed to reorder subtasks');
      console.error('Failed to reorder subtasks:', err);
    }
  };

  // Dependencies — sentence builder callback
  const handleAddDependency = async (data: {
    predecessorId: string;
    successorId: string;
    dependencyType: DependencyType;
    otherItemTitle: string;
  }) => {
    if (!id) return;

    setIsAddingDependency(true);
    setInlineError(null);
    try {
      if (data.successorId === id) {
        // This item is the successor → create from this item's perspective
        await createDependency(id, {
          predecessorId: data.predecessorId,
          dependencyType: data.dependencyType,
        });
      } else {
        // This item is the predecessor → create from the other item's perspective
        await createDependency(data.successorId, {
          predecessorId: id,
          dependencyType: data.dependencyType,
        });
      }
      await reloadDependencies();
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError(
          apiErr.message || 'This dependency already exists or would create a circular reference',
        );
      } else {
        setInlineError('Failed to add dependency');
      }
      console.error('Failed to add dependency:', err);
    } finally {
      setIsAddingDependency(false);
    }
  };

  const handleDeleteDependency = (
    type: 'predecessor' | 'successor',
    workItemId: string,
    title: string,
  ) => {
    if (!id) return;
    setDeletingDependency({ type, workItemId, title });
  };

  const confirmDeleteDependency = async () => {
    if (!id || !deletingDependency) return;
    setInlineError(null);
    try {
      if (deletingDependency.type === 'predecessor') {
        await deleteDependency(id, deletingDependency.workItemId);
      } else {
        // For successors, swap: delete from the successor's perspective
        await deleteDependency(deletingDependency.workItemId, id);
      }
      setDeletingDependency(null);
      await reloadDependencies();
    } catch (err) {
      setInlineError('Failed to remove dependency');
      console.error('Failed to remove dependency:', err);
    }
  };

  // Delete work item
  const handleDeleteWorkItem = async () => {
    if (!id) return;
    setIsDeleting(true);
    setInlineError(null);
    try {
      await deleteWorkItem(id);
      navigate('/project/work-items');
    } catch (err) {
      setInlineError('Failed to delete work item');
      console.error('Failed to delete work item:', err);
      setIsDeleting(false);
    }
  };

  const excludedWorkItemIds = useMemo(() => {
    const ids = new Set<string>();
    if (id) ids.add(id);
    for (const dep of dependencies.predecessors) {
      ids.add(dep.workItem.id);
    }
    for (const dep of dependencies.successors) {
      ids.add(dep.workItem.id);
    }
    return Array.from(ids);
  }, [id, dependencies.predecessors, dependencies.successors]);

  // Keyboard shortcuts
  const shortcuts = useMemo(
    () => [
      {
        key: 'e',
        handler: () => {
          if (!isEditingTitle && !isEditingDescription && !editingNoteId && !editingSubtaskId) {
            startEditingTitle();
          }
        },
        description: 'Edit title',
      },
      {
        key: 'Delete',
        handler: () => {
          if (!showDeleteConfirm) {
            setShowDeleteConfirm(true);
          }
        },
        description: 'Delete work item (Delete / Backspace)',
      },
      {
        key: 'Backspace',
        handler: () => {
          if (!showDeleteConfirm) {
            setShowDeleteConfirm(true);
          }
        },
        description: '', // Empty description to hide in help overlay
      },
      {
        key: 'Escape',
        handler: () => {
          if (showShortcutsHelp) {
            setShowShortcutsHelp(false);
          } else if (showDeleteConfirm) {
            setShowDeleteConfirm(false);
          } else if (isEditingTitle) {
            cancelTitleEdit();
          } else if (isEditingDescription) {
            cancelDescriptionEdit();
          } else if (editingNoteId) {
            cancelNoteEdit();
          } else if (editingSubtaskId) {
            cancelSubtaskEdit();
          }
        },
        description: 'Cancel edit or close dialog',
      },
      {
        key: '?',
        handler: () => setShowShortcutsHelp(true),
        description: 'Show keyboard shortcuts',
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isEditingTitle,
      isEditingDescription,
      editingNoteId,
      editingSubtaskId,
      showDeleteConfirm,
      showShortcutsHelp,
    ],
  );

  useKeyboardShortcuts(shortcuts);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading} role="status">
          {t('detail.loading')}
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('detail.notFound.title')}</h2>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate('/project/work-items')}
            >
              {t('detail.notFound.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('detail.error.title')}</h2>
          <p>{error || t('detail.error.fallback')}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate('/project/work-items')}
            >
              {t('detail.error.back')}
            </button>
            <button type="button" className={styles.backButton} onClick={() => navigate(0)}>
              {t('detail.error.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';

  // Subsidies not yet linked
  const linkedSubsidyIds = new Set(linkedSubsidies.map((s) => s.id));
  const availableSubsidies = allSubsidyPrograms.filter((s) => !linkedSubsidyIds.has(s.id));

  return (
    <div className={styles.container}>
      {/* Inline error banner */}
      {inlineError && (
        <div className={styles.errorBanner} role="alert">
          {inlineError}
          <button
            type="button"
            className={styles.closeError}
            onClick={() => setInlineError(null)}
            aria-label={t('detail.dismissError')}
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.navButtons}>
          {fromTimeline ? (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate(fromView ? `/schedule?view=${fromView}` : '/schedule')}
              >
                {t('detail.nav.backToSchedule')}
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/project/work-items')}
              >
                {t('detail.nav.toWorkItems')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate('/project/work-items')}
              >
                {t('detail.nav.backToWorkItems')}
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/schedule')}
              >
                {t('detail.nav.toSchedule')}
              </button>
            </>
          )}
        </div>

        <div className={styles.headerRow}>
          <div className={styles.titleSection}>
            {isEditingTitle ? (
              <div className={styles.titleEdit}>
                <input
                  type="text"
                  className={styles.titleInput}
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') cancelTitleEdit();
                  }}
                  autoFocus
                />
                <div className={styles.titleEditActions}>
                  <button type="button" onClick={saveTitle} className={styles.saveButton}>
                    Save
                  </button>
                  <button type="button" onClick={cancelTitleEdit} className={styles.cancelButton}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <h1 className={styles.title} onClick={startEditingTitle}>
                {workItem.title}
              </h1>
            )}
          </div>

          <div className={styles.statusSection}>
            <select
              className={styles.statusSelect}
              value={workItem.status}
              onChange={(e) => handleStatusChange(e.target.value as WorkItemStatus)}
            >
              <option value="not_started">{t('detail.statusOptions.notStarted')}</option>
              <option value="in_progress">{t('detail.statusOptions.inProgress')}</option>
              <option value="completed">{t('detail.statusOptions.completed')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className={styles.contentGrid}>
        {/* Left column: Properties */}
        <div className={styles.leftColumn}>
          {/* Description */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.description')}</h2>
            {isEditingDescription ? (
              <div className={styles.descriptionEdit}>
                <textarea
                  className={styles.descriptionTextarea}
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  rows={6}
                />
                <div className={styles.descriptionEditActions}>
                  <button type="button" onClick={saveDescription} className={styles.saveButton}>
                    {t('detail.description.save')}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDescriptionEdit}
                    className={styles.cancelButton}
                  >
                    {t('detail.description.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={styles.description}
                onClick={startEditingDescription}
                title={t('detail.description.clickToEdit')}
              >
                {workItem.description || (
                  <em className={styles.placeholder}>{t('detail.description.noDescription')}</em>
                )}
              </div>
            )}
          </section>

          {/* Dates (computed by scheduling engine) */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.schedule')}</h2>
            <p className={styles.sectionDescription}>{t('detail.sections.scheduleDescription')}</p>
            <div className={styles.propertyGrid}>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>{t('detail.schedule.startDate')}</span>
                <span className={styles.propertyValue}>
                  {workItem.startDate
                    ? formatDate(workItem.startDate)
                    : t('detail.schedule.notScheduled')}
                </span>
              </div>

              <div className={styles.property}>
                <span className={styles.propertyLabel}>{t('detail.schedule.endDate')}</span>
                <span className={styles.propertyValue}>
                  {workItem.endDate
                    ? formatDate(workItem.endDate)
                    : t('detail.schedule.notScheduled')}
                </span>
              </div>
            </div>
            {/* Delay indicator: shown when not_started and scheduled start is in the past */}
            {(() => {
              if (workItem.status !== 'not_started' || !workItem.startDate) return null;
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              if (workItem.startDate >= todayStr) return null;
              const startMs = new Date(workItem.startDate).getTime();
              const todayMs = new Date(todayStr).getTime();
              const delayDays = Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24));
              return (
                <div className={styles.delayIndicator} role="status" aria-live="polite">
                  <span aria-hidden="true">⚠</span>
                  {t('detail.schedule.delayed', {
                    count: delayDays,
                    unit: delayDays === 1 ? t('detail.schedule.day') : t('detail.schedule.days')!,
                  })}
                </div>
              );
            })()}
          </section>

          {/* Area */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.area')}</h2>
            <div className={styles.property}>
              <label className={styles.propertyLabel}>{t('detail.area.label')}</label>
              <AreaPicker
                areas={areas}
                value={workItem.area?.id || ''}
                onChange={handleAreaChange}
                nullable
              />
            </div>
          </section>

          {/* Assigned User/Vendor */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.assignment')}</h2>
            <div className={styles.property}>
              <label className={styles.propertyLabel}>{t('detail.assignment.assignedTo')}</label>
              <AssignmentPicker
                users={users}
                vendors={allVendors}
                value={encodeAssignment(workItem.assignedUser?.id, workItem.assignedVendor?.id)}
                onChange={handleAssignmentChange}
              />
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
              budgetCategories={budgetCategories}
              onLinkSubsidy={handleLinkSubsidy}
              onUnlinkSubsidy={handleUnlinkSubsidy}
              onConfirmDeleteBudgetLine={handleConfirmDeleteBudgetLine}
              budgetLineType="work_item"
              onLinkInvoice={handleLinkInvoice}
              onUnlinkInvoice={handleUnlinkInvoice}
              isUnlinking={isUnlinkingInvoice}
              inlineError={inlineError}
            />
          </section>
        </div>

        {/* Right column: Notes, Subtasks, Constraints */}
        <div className={styles.rightColumn}>
          {/* Notes */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.notes')}</h2>

            <form className={styles.addNoteForm} onSubmit={handleAddNote}>
              <textarea
                className={styles.noteTextarea}
                placeholder={t('detail.notes.placeholder')}
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                rows={3}
                disabled={isAddingNote}
              />
              <button
                type="submit"
                className={styles.addButton}
                disabled={!newNoteContent.trim() || isAddingNote}
              >
                {isAddingNote ? t('detail.notes.adding') : t('detail.notes.addNote')}
              </button>
            </form>

            <div className={styles.notesList}>
              {notes.length === 0 && (
                <div className={styles.emptyState}>{t('detail.notes.noNotes')}</div>
              )}
              {notes.map((note) => (
                <div key={note.id} className={styles.noteItem}>
                  <div className={styles.noteHeader}>
                    <span className={styles.noteAuthor}>
                      {note.createdBy?.displayName || 'Unknown'}
                    </span>
                    <span className={styles.noteDate}>{formatDate(note.createdAt)}</span>
                  </div>

                  {editingNoteId === note.id ? (
                    <div className={styles.noteEdit}>
                      <textarea
                        className={styles.noteTextarea}
                        value={editedNoteContent}
                        onChange={(e) => setEditedNoteContent(e.target.value)}
                        rows={3}
                      />
                      <div className={styles.noteEditActions}>
                        <button
                          type="button"
                          onClick={() => saveNoteEdit(note.id)}
                          className={styles.saveButton}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelNoteEdit}
                          className={styles.cancelButton}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.noteContent}>{note.content}</div>
                      {(isAdmin || note.createdBy?.id === user?.id) && (
                        <div className={styles.noteActions}>
                          <button
                            type="button"
                            onClick={() => startEditingNote(note)}
                            className={styles.editButton}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className={styles.deleteButton}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Subtasks */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.subtasks')}</h2>

            <form className={styles.addSubtaskForm} onSubmit={handleAddSubtask}>
              <input
                type="text"
                className={styles.subtaskInput}
                placeholder={t('detail.subtasks.placeholder')}
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                disabled={isAddingSubtask}
              />
              <button
                type="submit"
                className={styles.addButton}
                disabled={!newSubtaskTitle.trim() || isAddingSubtask}
              >
                {isAddingSubtask ? t('detail.subtasks.adding') : t('detail.subtasks.add')}
              </button>
            </form>

            <div className={styles.subtasksList}>
              {subtasks.length === 0 && (
                <div className={styles.emptyState}>No subtasks yet. Add one above.</div>
              )}
              {subtasks.map((subtask, index) => (
                <div key={subtask.id} className={styles.subtaskItem}>
                  <input
                    type="checkbox"
                    className={styles.subtaskCheckbox}
                    checked={subtask.isCompleted}
                    onChange={(e) => handleToggleSubtask(subtask.id, e.target.checked)}
                  />

                  {editingSubtaskId === subtask.id ? (
                    <div className={styles.subtaskEdit}>
                      <input
                        type="text"
                        className={styles.subtaskInput}
                        value={editedSubtaskTitle}
                        onChange={(e) => setEditedSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSubtaskEdit(subtask.id);
                          if (e.key === 'Escape') cancelSubtaskEdit();
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => saveSubtaskEdit(subtask.id)}
                        className={styles.saveButton}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelSubtaskEdit}
                        className={styles.cancelButton}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className={`${styles.subtaskTitle} ${
                          subtask.isCompleted ? styles.subtaskCompleted : ''
                        }`}
                        onClick={() => startEditingSubtask(subtask)}
                      >
                        {subtask.title}
                      </span>

                      <div className={styles.subtaskActions}>
                        <button
                          type="button"
                          onClick={() => handleMoveSubtask(index, 'up')}
                          className={styles.moveButton}
                          disabled={index === 0}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSubtask(index, 'down')}
                          className={styles.moveButton}
                          disabled={index === subtasks.length - 1}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubtask(subtask.id)}
                          className={styles.deleteButton}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Constraints */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.constraints')}</h2>

            {/* Duration subsection — first, no top border */}
            <div className={`${styles.constraintSubsection} ${styles.constraintSubsectionFirst}`}>
              <h3 className={styles.subsectionTitle}>{t('detail.constraints.duration')}</h3>
              <div className={styles.property}>
                <label className={styles.propertyLabel}>
                  {t('detail.constraints.durationDays')}
                </label>
                <div className={styles.inlineFieldWrapper}>
                  <input
                    type="number"
                    className={styles.propertyInput}
                    value={localDuration}
                    onChange={(e) => setLocalDuration(e.target.value)}
                    onBlur={() => void handleDurationBlur()}
                    min="0"
                    placeholder="0"
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                  <AutosaveIndicator state={autosaveDuration} />
                </div>
              </div>
            </div>

            {/* Date Constraints subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>{t('detail.constraints.dateConstraints')}</h3>
              <div className={styles.propertyGrid}>
                <div className={styles.property}>
                  <label className={styles.propertyLabel}>
                    {t('detail.constraints.startAfter')}
                  </label>
                  <div className={styles.inlineFieldWrapper}>
                    <input
                      type="date"
                      className={styles.propertyInput}
                      value={localStartAfter}
                      onChange={(e) => setLocalStartAfter(e.target.value)}
                      onBlur={() => void handleConstraintBlur('startAfter')}
                    />
                    {localStartAfter && (
                      <button
                        type="button"
                        className={styles.clearDateButton}
                        aria-label="Clear start after date"
                        onClick={() => {
                          setLocalStartAfter('');
                          if (id && workItem && workItem.startAfter) {
                            setAutosaveStartAfter('saving');
                            void updateWorkItem(id, { startAfter: null })
                              .then(() => reloadWorkItem())
                              .then(() => {
                                setAutosaveStartAfter('success');
                                triggerAutosaveReset(setAutosaveStartAfter, 'startAfter');
                              })
                              .catch(() => {
                                setAutosaveStartAfter('error');
                                triggerAutosaveReset(setAutosaveStartAfter, 'startAfter');
                              });
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                    <AutosaveIndicator state={autosaveStartAfter} />
                  </div>
                </div>

                <div className={styles.property}>
                  <label className={styles.propertyLabel}>
                    {t('detail.constraints.startBefore')}
                  </label>
                  <div className={styles.inlineFieldWrapper}>
                    <input
                      type="date"
                      className={styles.propertyInput}
                      value={localStartBefore}
                      onChange={(e) => setLocalStartBefore(e.target.value)}
                      onBlur={() => void handleConstraintBlur('startBefore')}
                    />
                    {localStartBefore && (
                      <button
                        type="button"
                        className={styles.clearDateButton}
                        aria-label="Clear start before date"
                        onClick={() => {
                          setLocalStartBefore('');
                          if (id && workItem && workItem.startBefore) {
                            setAutosaveStartBefore('saving');
                            void updateWorkItem(id, { startBefore: null })
                              .then(() => reloadWorkItem())
                              .then(() => {
                                setAutosaveStartBefore('success');
                                triggerAutosaveReset(setAutosaveStartBefore, 'startBefore');
                              })
                              .catch(() => {
                                setAutosaveStartBefore('error');
                                triggerAutosaveReset(setAutosaveStartBefore, 'startBefore');
                              });
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                    <AutosaveIndicator state={autosaveStartBefore} />
                  </div>
                </div>

                <div className={styles.property}>
                  <label className={styles.propertyLabel}>
                    {t('detail.constraints.actualStart')}
                  </label>
                  <div className={styles.inlineFieldWrapper}>
                    <input
                      type="date"
                      className={styles.propertyInput}
                      value={localActualStartDate}
                      onChange={(e) => setLocalActualStartDate(e.target.value)}
                      onBlur={() => void handleActualDateBlur('actualStartDate')}
                    />
                    {localActualStartDate && (
                      <button
                        type="button"
                        className={styles.clearDateButton}
                        aria-label="Clear actual start date"
                        onClick={() => {
                          setLocalActualStartDate('');
                          if (id && workItem && workItem.actualStartDate) {
                            setAutosaveActualStart('saving');
                            void updateWorkItem(id, { actualStartDate: null })
                              .then(() => reloadWorkItem())
                              .then(() => {
                                setAutosaveActualStart('success');
                                triggerAutosaveReset(setAutosaveActualStart, 'actualStartDate');
                              })
                              .catch(() => {
                                setAutosaveActualStart('error');
                                triggerAutosaveReset(setAutosaveActualStart, 'actualStartDate');
                              });
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                    <AutosaveIndicator state={autosaveActualStart} />
                  </div>
                </div>

                <div className={styles.property}>
                  <label className={styles.propertyLabel}>
                    {t('detail.constraints.actualEnd')}
                  </label>
                  <div className={styles.inlineFieldWrapper}>
                    <input
                      type="date"
                      className={styles.propertyInput}
                      value={localActualEndDate}
                      onChange={(e) => setLocalActualEndDate(e.target.value)}
                      onBlur={() => void handleActualDateBlur('actualEndDate')}
                    />
                    {localActualEndDate && (
                      <button
                        type="button"
                        className={styles.clearDateButton}
                        aria-label="Clear actual end date"
                        onClick={() => {
                          setLocalActualEndDate('');
                          if (id && workItem && workItem.actualEndDate) {
                            setAutosaveActualEnd('saving');
                            void updateWorkItem(id, { actualEndDate: null })
                              .then(() => reloadWorkItem())
                              .then(() => {
                                setAutosaveActualEnd('success');
                                triggerAutosaveReset(setAutosaveActualEnd, 'actualEndDate');
                              })
                              .catch(() => {
                                setAutosaveActualEnd('error');
                                triggerAutosaveReset(setAutosaveActualEnd, 'actualEndDate');
                              });
                          }
                        }}
                      >
                        ×
                      </button>
                    )}
                    <AutosaveIndicator state={autosaveActualEnd} />
                  </div>
                </div>
              </div>
            </div>

            {/* Dependencies subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>{t('detail.constraints.dependencies')}</h3>

              <DependencySentenceDisplay
                predecessors={dependencies.predecessors}
                successors={dependencies.successors}
                onDelete={handleDeleteDependency}
              />

              <div className={styles.addDependencySection}>
                <DependencySentenceBuilder
                  thisItemId={id!}
                  thisItemLabel={workItem.title}
                  excludeIds={excludedWorkItemIds}
                  disabled={isAddingDependency}
                  onAdd={handleAddDependency}
                />
              </div>
            </div>

            {/* Required Milestones subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>
                {t('detail.constraints.requiredMilestones')}
              </h3>
              <p className={styles.constraintSubsectionDesc}>
                {t('detail.constraints.requiredMilestonesDesc')}
              </p>

              <div className={styles.milestoneChips}>
                {workItemMilestones.required.length === 0 && (
                  <div className={styles.emptyState}>
                    {t('detail.constraints.noRequiredMilestones')}
                  </div>
                )}
                {workItemMilestones.required.map((ms) => (
                  <div key={ms.id} className={styles.milestoneChip}>
                    <span className={styles.milestoneChipName}>{ms.name}</span>
                    {ms.targetDate && (
                      <span className={styles.milestoneChipDate}>{formatDate(ms.targetDate)}</span>
                    )}
                    <button
                      type="button"
                      className={styles.milestoneChipRemove}
                      onClick={() => handleRemoveRequiredMilestone(ms.id)}
                      aria-label={`Remove required milestone: ${ms.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {(() => {
                const requiredIds = new Set(workItemMilestones.required.map((m) => m.id));
                const available = allMilestones.filter((m) => !requiredIds.has(m.id));
                return available.length > 0 ? (
                  <div className={styles.linkPickerRow}>
                    <select
                      className={styles.linkPickerSelect}
                      value={selectedRequiredMilestoneId}
                      onChange={(e) => setSelectedRequiredMilestoneId(e.target.value)}
                      aria-label="Select required milestone to add"
                    >
                      <option value="">{t('detail.constraints.selectMilestonePlaceholder')}</option>
                      {available.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {m.title} — {formatDate(m.targetDate)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={handleAddRequiredMilestone}
                      disabled={!selectedRequiredMilestoneId || isAddingRequiredMilestone}
                    >
                      {isAddingRequiredMilestone
                        ? t('detail.constraints.adding')
                        : t('detail.constraints.addMilestone')}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Linked Milestones subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>{t('detail.constraints.linkedMilestones')}</h3>
              <p className={styles.constraintSubsectionDesc}>
                {t('detail.constraints.linkedMilestonesDesc')}
              </p>

              <div className={styles.milestoneChips}>
                {workItemMilestones.linked.length === 0 && (
                  <div className={styles.emptyState}>
                    {t('detail.constraints.noLinkedMilestones')}
                  </div>
                )}
                {workItemMilestones.linked.map((ms) => (
                  <div
                    key={ms.id}
                    className={`${styles.milestoneChip} ${styles.milestoneChipLinked}`}
                  >
                    <span className={styles.milestoneChipName}>{ms.name}</span>
                    {ms.targetDate && (
                      <span className={styles.milestoneChipDate}>{formatDate(ms.targetDate)}</span>
                    )}
                    <button
                      type="button"
                      className={styles.milestoneChipRemove}
                      onClick={() => handleRemoveLinkedMilestone(ms.id)}
                      aria-label={`Remove linked milestone: ${ms.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {(() => {
                const linkedIds = new Set(workItemMilestones.linked.map((m) => m.id));
                const available = allMilestones.filter((m) => !linkedIds.has(m.id));
                return available.length > 0 ? (
                  <div className={styles.linkPickerRow}>
                    <select
                      className={styles.linkPickerSelect}
                      value={selectedLinkedMilestoneId}
                      onChange={(e) => setSelectedLinkedMilestoneId(e.target.value)}
                      aria-label="Select milestone to link"
                    >
                      <option value="">{t('detail.constraints.selectMilestonePlaceholder')}</option>
                      {available.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {m.title} — {formatDate(m.targetDate)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.addButton}
                      onClick={handleAddLinkedMilestone}
                      disabled={!selectedLinkedMilestoneId || isAddingLinkedMilestone}
                    >
                      {isAddingLinkedMilestone
                        ? t('detail.constraints.linking')
                        : t('detail.constraints.linkMilestone')}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          </section>
        </div>
      </div>

      {/* Linked Household Items section */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          {t('detail.sections.dependentHouseholdItems')}
          {linkedHouseholdItems.length > 0 && (
            <span className={styles.countBadge}>{linkedHouseholdItems.length}</span>
          )}
        </h2>
        {linkedHouseholdItems.length === 0 ? (
          <p className={styles.emptyText}>{t('detail.householdItems.noItems')}</p>
        ) : (
          <ul className={styles.householdItemLinkList}>
            {linkedHouseholdItems.map((hi) => (
              <li key={hi.id} className={styles.householdItemLinkRow}>
                <Link
                  to={`/project/household-items/${hi.id}`}
                  className={styles.householdItemLinkName}
                >
                  {hi.name}
                </Link>
                <span className={styles.householdItemCategoryBadge}>
                  {HOUSEHOLD_ITEM_CATEGORY_LABELS[hi.category]}
                </span>
                <span className={styles.householdItemStatusBadge} data-status={hi.status}>
                  {HOUSEHOLD_ITEM_STATUS_LABELS[hi.status]}
                </span>
                {hi.earliestDeliveryDate && hi.latestDeliveryDate ? (
                  <span className={styles.householdItemDeliveryDate}>
                    {formatDate(hi.earliestDeliveryDate)} – {formatDate(hi.latestDeliveryDate)}
                  </span>
                ) : hi.targetDeliveryDate ? (
                  <span className={styles.householdItemDeliveryDate}>
                    {formatDate(hi.targetDeliveryDate)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Documents — full-width section, loads independently */}
      <div className={styles.section}>
        <LinkedDocumentsSection entityType="work_item" entityId={id!} />
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.timestamps}>
          <div>
            {t('detail.footer.createdBy', {
              name: workItem.createdBy?.displayName || 'Unknown',
              date: formatDate(workItem.createdAt),
            })}
          </div>
          <div>{t('detail.footer.lastUpdated', { date: formatDate(workItem.updatedAt) })}</div>
        </div>

        <button
          type="button"
          className={styles.deleteWorkItemButton}
          onClick={() => setShowDeleteConfirm(true)}
        >
          {t('detail.footer.deleteWorkItem')}
        </button>
      </footer>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className={styles.modal}>
          <div
            className={styles.modalBackdrop}
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('detail.modals.deleteWorkItem.title')}</h2>
            <p className={styles.modalText}>
              {t('detail.modals.deleteWorkItem.text', { title: workItem.title })}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                {t('detail.modals.deleteWorkItem.cancel')}
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={handleDeleteWorkItem}
                disabled={isDeleting}
              >
                {isDeleting
                  ? t('detail.modals.deleteWorkItem.deleting')
                  : t('detail.modals.deleteWorkItem.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcutsHelp(false)} />
      )}

      {/* Note deletion confirmation modal */}
      {deletingNoteId && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={() => setDeletingNoteId(null)} />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>{t('detail.modals.deleteNote.title')}</h2>
            <p className={styles.modalText}>{t('detail.modals.deleteNote.text')}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setDeletingNoteId(null)}
              >
                {t('detail.modals.deleteNote.cancel')}
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={confirmDeleteNote}
              >
                {t('detail.modals.deleteNote.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subtask deletion confirmation modal */}
      {deletingSubtaskId && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={() => setDeletingSubtaskId(null)} />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Delete Subtask?</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete this subtask? This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setDeletingSubtaskId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={confirmDeleteSubtask}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dependency deletion confirmation modal */}
      {deletingDependency && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={() => setDeletingDependency(null)} />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Remove Dependency?</h2>
            <p className={styles.modalText}>
              {deletingDependency.type === 'predecessor'
                ? `This item will no longer depend on "${deletingDependency.title}".`
                : `This item will no longer block "${deletingDependency.title}".`}{' '}
              This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setDeletingDependency(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={confirmDeleteDependency}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget line deletion confirmation modal */}
      {deletingBudgetId && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={() => setDeletingBudgetId(null)} />
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Delete Budget Line?</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete this budget line? This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setDeletingBudgetId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={handleConfirmDeleteBudgetLine}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice link modal */}
      {showInvoiceLinkModal && invoiceLinkingBudgetId && (
        <InvoiceLinkModal
          budgetLineId={invoiceLinkingBudgetId}
          budgetLineType="work_item"
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

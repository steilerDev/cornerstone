import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import type {
  WorkItemDetail,
  WorkItemStatus,
  TagResponse,
  UserResponse,
  NoteResponse,
  SubtaskResponse,
  DependencyResponse,
  BudgetCategory,
  BudgetSource,
  Vendor,
  SubsidyProgram,
  WorkItemBudgetLine,
  ConfidenceLevel,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
  WorkItemMilestones,
  MilestoneSummary,
  WorkItemSubsidyPaybackResponse,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import {
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
  fetchWorkItemSubsidies,
  linkWorkItemSubsidy,
  unlinkWorkItemSubsidy,
  fetchWorkItemSubsidyPayback,
} from '../../lib/workItemsApi.js';
import {
  fetchWorkItemBudgets,
  createWorkItemBudget,
  updateWorkItemBudget,
  deleteWorkItemBudget,
} from '../../lib/workItemBudgetsApi.js';
import { listNotes, createNote, updateNote, deleteNote } from '../../lib/notesApi.js';
import {
  listSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
} from '../../lib/subtasksApi.js';
import { getDependencies, createDependency, deleteDependency } from '../../lib/dependenciesApi.js';
import { fetchTags, createTag } from '../../lib/tagsApi.js';
import { listUsers } from '../../lib/usersApi.js';
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
import { TagPicker } from '../../components/TagPicker/TagPicker.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import {
  DependencySentenceBuilder,
  DependencySentenceDisplay,
} from '../../components/DependencySentenceBuilder/index.js';
import type { DependencyType } from '@cornerstone/shared';
import { formatDate } from '../../lib/formatters.js';
import styles from './WorkItemDetailPage.module.css';

interface DeletingDependency {
  type: 'predecessor' | 'successor';
  workItemId: string;
  title: string;
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  own_estimate: 'Own Estimate',
  professional_estimate: 'Professional Estimate',
  quote: 'Quote',
  invoice: 'Invoice',
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

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: string; view?: string } | null;
  const fromTimeline = locationState?.from === 'timeline';
  const fromView = locationState?.view;
  const { user } = useAuth();

  const [workItem, setWorkItem] = useState<WorkItemDetail | null>(null);
  const [notes, setNotes] = useState<NoteResponse[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskResponse[]>([]);
  const [dependencies, setDependencies] = useState<{
    predecessors: DependencyResponse[];
    successors: DependencyResponse[];
  }>({ predecessors: [], successors: [] });

  const [availableTags, setAvailableTags] = useState<TagResponse[]>([]);
  const [users, setUsers] = useState<UserResponse[]>([]);

  // Budget lines state
  const [budgetLines, setBudgetLines] = useState<WorkItemBudgetLine[]>([]);
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
  // Invoice popover state: holds the budget line id whose popover is open
  const [invoicePopoverBudgetId, setInvoicePopoverBudgetId] = useState<string | null>(null);
  const invoicePopoverRef = useRef<HTMLDivElement>(null);

  // Subsidy linking state
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);
  const [selectedSubsidyId, setSelectedSubsidyId] = useState('');
  const [isLinkingSubsidy, setIsLinkingSubsidy] = useState(false);

  // Subsidy payback state
  const [subsidyPayback, setSubsidyPayback] = useState<WorkItemSubsidyPaybackResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Local state for duration/constraint inputs (onBlur save pattern to avoid race conditions)
  const [localDuration, setLocalDuration] = useState<string>('');
  const [localStartAfter, setLocalStartAfter] = useState<string>('');
  const [localStartBefore, setLocalStartBefore] = useState<string>('');
  const [localActualStartDate, setLocalActualStartDate] = useState<string>('');
  const [localActualEndDate, setLocalActualEndDate] = useState<string>('');

  // Autosave indicator state per inline-edited field
  type AutosaveState = 'idle' | 'saving' | 'success' | 'error';
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

      try {
        const [
          workItemData,
          notesData,
          subtasksData,
          depsData,
          tagsData,
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
        ] = await Promise.all([
          getWorkItem(id!),
          listNotes(id!),
          listSubtasks(id!),
          getDependencies(id!),
          fetchTags(),
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
        setAvailableTags(tagsData.tags);
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
      } catch (err: unknown) {
        if ((err as { statusCode?: number })?.statusCode === 404) {
          setError('Work item not found');
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

  // Close invoice popover on click-outside
  useEffect(() => {
    if (!invoicePopoverBudgetId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (invoicePopoverRef.current && !invoicePopoverRef.current.contains(e.target as Node)) {
        setInvoicePopoverBudgetId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [invoicePopoverBudgetId]);

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

  const reloadWorkItemMilestones = async () => {
    if (!id) return;
    try {
      const data = await getWorkItemMilestones(id);
      setWorkItemMilestones(data);
    } catch (err) {
      console.error('Failed to reload work item milestones:', err);
    }
  };

  // ─── Budget line handlers ──────────────────────────────────────────────────

  const openAddBudgetForm = () => {
    setEditingBudgetId(null);
    setBudgetForm(EMPTY_BUDGET_FORM);
    setBudgetFormError(null);
    setShowBudgetForm(true);
  };

  const openEditBudgetForm = (line: WorkItemBudgetLine) => {
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

    const payload: CreateWorkItemBudgetRequest | UpdateWorkItemBudgetRequest = {
      description: budgetForm.description.trim() || null,
      plannedAmount,
      confidence: budgetForm.confidence,
      budgetCategoryId: budgetForm.budgetCategoryId || null,
      budgetSourceId: budgetForm.budgetSourceId || null,
      vendorId: budgetForm.vendorId || null,
    };

    try {
      if (editingBudgetId) {
        await updateWorkItemBudget(id, editingBudgetId, payload as UpdateWorkItemBudgetRequest);
      } else {
        await createWorkItemBudget(id, payload as CreateWorkItemBudgetRequest);
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
      await deleteWorkItemBudget(id, deletingBudgetId);
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
      await linkWorkItemSubsidy(id, selectedSubsidyId);
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
      await unlinkWorkItemSubsidy(id, subsidyProgramId);
      await Promise.all([reloadLinkedSubsidies(), reloadSubsidyPayback()]);
    } catch (err) {
      setInlineError('Failed to unlink subsidy program');
      console.error('Failed to unlink subsidy:', err);
    }
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

  const handleCreateTag = async (name: string, color: string | null): Promise<TagResponse> => {
    const newTag = await createTag({ name, color });
    setAvailableTags((prev) => [...prev, newTag]);
    return newTag;
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
  const handleAssignedUserChange = async (userId: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { assignedUserId: userId || null });
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update assigned user');
      console.error('Failed to update assigned user:', err);
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

  // Tags change
  const handleTagsChange = async (tagIds: string[]) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { tagIds });
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update tags');
      console.error('Failed to update tags:', err);
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
    reordered.splice(newIndex, 0, moved);

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
      navigate('/work-items');
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
        <div className={styles.loading}>Loading work item...</div>
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          {error || 'Work item not found'}
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate('/work-items')}
          >
            Back to Work Items
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';

  // Currency formatting helper
  const formatCurrency = (value: number): string =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

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
            aria-label="Dismiss error"
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
                onClick={() => navigate(fromView ? `/timeline?view=${fromView}` : '/timeline')}
              >
                ← Back to Timeline
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/work-items')}
              >
                To Work Items
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => navigate('/work-items')}
              >
                ← Back to Work Items
              </button>
              <button
                type="button"
                className={styles.secondaryNavButton}
                onClick={() => navigate('/timeline')}
              >
                To Timeline
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
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
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
            <h2 className={styles.sectionTitle}>Description</h2>
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
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelDescriptionEdit}
                    className={styles.cancelButton}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={styles.description}
                onClick={startEditingDescription}
                title="Click to edit"
              >
                {workItem.description || <em className={styles.placeholder}>No description</em>}
              </div>
            )}
          </section>

          {/* Dates (computed by scheduling engine) */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Schedule</h2>
            <p className={styles.sectionDescription}>
              Start and end dates are computed by the scheduling engine based on constraints and
              dependencies.
            </p>
            <div className={styles.propertyGrid}>
              <div className={styles.property}>
                <span className={styles.propertyLabel}>Start Date</span>
                <span className={styles.propertyValue}>
                  {workItem.startDate ? formatDate(workItem.startDate) : 'Not scheduled'}
                </span>
              </div>

              <div className={styles.property}>
                <span className={styles.propertyLabel}>End Date</span>
                <span className={styles.propertyValue}>
                  {workItem.endDate ? formatDate(workItem.endDate) : 'Not scheduled'}
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
                  Delayed by {delayDays} {delayDays === 1 ? 'day' : 'days'}
                </div>
              );
            })()}
          </section>

          {/* Assigned User */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Assignment</h2>
            <div className={styles.property}>
              <label className={styles.propertyLabel}>Assigned To</label>
              <select
                className={styles.propertySelect}
                value={workItem.assignedUser?.id || ''}
                onChange={(e) => handleAssignedUserChange(e.target.value)}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Tags */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tags</h2>
            <TagPicker
              availableTags={availableTags}
              selectedTagIds={workItem.tags.map((t) => t.id)}
              onSelectionChange={handleTagsChange}
              onCreateTag={handleCreateTag}
              onError={(message) => setInlineError(message)}
            />
          </section>

          {/* Budget Lines */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Budget</h2>
              <button
                type="button"
                className={styles.addButton}
                onClick={openAddBudgetForm}
                aria-label="Add budget line"
              >
                + Add Line
              </button>
            </div>

            {/* Budget totals summary */}
            {budgetLines.length > 0 && (
              <div className={styles.budgetSummary}>
                <div className={styles.propertyGrid}>
                  {totalActualCost > 0 ? (
                    <>
                      <div className={styles.property}>
                        <span className={styles.propertyLabel}>Total Actual Cost</span>
                        <span className={styles.budgetValueHighlighted}>
                          {formatCurrency(totalActualCost)}
                        </span>
                      </div>
                      <div className={styles.property}>
                        <span className={styles.propertyLabel}>Planned Range</span>
                        <span className={styles.budgetValueMuted}>
                          {hasPlannedRange
                            ? `${formatCurrency(totalMinPlanned)} – ${formatCurrency(totalMaxPlanned)}`
                            : formatCurrency(totalPlanned)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className={styles.property}>
                      <span className={styles.propertyLabel}>Planned Range</span>
                      <span className={styles.budgetValue}>
                        {hasPlannedRange
                          ? `${formatCurrency(totalMinPlanned)} – ${formatCurrency(totalMaxPlanned)}`
                          : formatCurrency(totalPlanned)}
                      </span>
                    </div>
                  )}
                  <div className={styles.property}>
                    <span className={styles.propertyLabel}>Lines</span>
                    <span className={styles.budgetValue}>{budgetLines.length}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Expected Subsidy Payback — shown when non-rejected subsidies are linked */}
            {subsidyPayback !== null && subsidyPayback.subsidies.length > 0 && (
              <div
                className={`${styles.subsidyPaybackRow} ${subsidyPayback.totalPayback > 0 ? styles.subsidyPaybackRowActive : styles.subsidyPaybackRowZero}`}
              >
                <span className={styles.subsidyPaybackLabel}>Expected Subsidy Payback</span>
                <span className={styles.subsidyPaybackAmount} aria-live="polite" aria-atomic="true">
                  {formatCurrency(subsidyPayback.totalPayback)}
                </span>
                {subsidyPayback.subsidies.length > 1 && (
                  <div className={styles.subsidyPaybackChips} aria-label="Per-subsidy breakdown">
                    {subsidyPayback.subsidies.map((entry) => (
                      <span key={entry.subsidyProgramId} className={styles.subsidyPaybackChip}>
                        {entry.name}: {formatCurrency(entry.paybackAmount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Budget lines list */}
            <div className={styles.budgetLinesList}>
              {budgetLines.length === 0 && !showBudgetForm && (
                <div className={styles.emptyState}>
                  No budget lines yet. Add the first line to start tracking costs.
                </div>
              )}
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
                      {line.vendor && line.invoiceCount === 0 ? (
                        <span className={styles.budgetLineMetaItem}>{line.vendor.name}</span>
                      ) : line.invoiceCount > 0 ? (
                        <div
                          className={styles.invoicePopoverWrapper}
                          ref={invoicePopoverBudgetId === line.id ? invoicePopoverRef : null}
                        >
                          <button
                            type="button"
                            className={styles.budgetLineMetaLink}
                            onClick={() =>
                              setInvoicePopoverBudgetId((prev) =>
                                prev === line.id ? null : line.id,
                              )
                            }
                            aria-expanded={invoicePopoverBudgetId === line.id}
                            aria-haspopup="true"
                          >
                            {line.invoiceCount} invoice{line.invoiceCount !== 1 ? 's' : ''} ·{' '}
                            {formatCurrency(line.actualCost)}
                          </button>
                          {invoicePopoverBudgetId === line.id && (
                            <div className={styles.invoicePopover} role="listbox">
                              <div className={styles.invoicePopoverHeader}>Invoices</div>
                              {line.invoices.map((inv) => (
                                <Link
                                  key={inv.id}
                                  to={`/budget/invoices/${inv.id}`}
                                  className={styles.invoicePopoverItem}
                                  onClick={() => setInvoicePopoverBudgetId(null)}
                                >
                                  <div className={styles.invoicePopoverItemRow}>
                                    <span className={styles.invoicePopoverItemNumber}>
                                      {inv.invoiceNumber ? `#${inv.invoiceNumber}` : 'No #'}
                                    </span>
                                    <span className={styles.invoicePopoverItemAmount}>
                                      {formatCurrency(inv.amount)}
                                    </span>
                                  </div>
                                  <div className={styles.invoicePopoverItemMeta}>
                                    {inv.vendorName && <span>{inv.vendorName}</span>}
                                    {inv.vendorName && <span>·</span>}
                                    <span>{inv.date.slice(0, 10)}</span>
                                    <span>·</span>
                                    <span
                                      className={`${styles.invoicePopoverStatusBadge} ${styles[`invoicePopoverStatus_${inv.status}`]}`}
                                    >
                                      {inv.status}
                                    </span>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className={styles.budgetLineActions}>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => openEditBudgetForm(line)}
                      aria-label={`Edit budget line${line.description ? ': ' + line.description : ''}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDeleteBudgetLine(line.id)}
                      aria-label={`Delete budget line${line.description ? ': ' + line.description : ''}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Budget line form (inline) */}
            {showBudgetForm && (
              <div className={styles.budgetLineForm}>
                <h3 className={styles.subsectionTitle}>
                  {editingBudgetId ? 'Edit Budget Line' : 'New Budget Line'}
                </h3>
                <form onSubmit={handleSaveBudgetLine}>
                  {budgetFormError && (
                    <div className={styles.budgetFormError} role="alert">
                      {budgetFormError}
                    </div>
                  )}
                  <div className={styles.propertyGrid}>
                    <div className={styles.property}>
                      <label className={styles.propertyLabel} htmlFor="budget-planned-amount">
                        Planned Amount (€) *
                      </label>
                      <input
                        type="number"
                        id="budget-planned-amount"
                        className={styles.propertyInput}
                        value={budgetForm.plannedAmount}
                        onChange={(e) =>
                          setBudgetForm({ ...budgetForm, plannedAmount: e.target.value })
                        }
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        required
                        disabled={isSavingBudget}
                      />
                    </div>
                    <div className={styles.property}>
                      <label className={styles.propertyLabel} htmlFor="budget-confidence">
                        Confidence
                      </label>
                      <select
                        id="budget-confidence"
                        className={styles.propertySelect}
                        value={budgetForm.confidence}
                        onChange={(e) =>
                          setBudgetForm({
                            ...budgetForm,
                            confidence: e.target.value as ConfidenceLevel,
                          })
                        }
                        disabled={isSavingBudget}
                      >
                        <option value="own_estimate">Own Estimate (+20%)</option>
                        <option value="professional_estimate">Professional Estimate (+10%)</option>
                        <option value="quote">Quote (+5%)</option>
                        <option value="invoice">Invoice (±0%)</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.property}>
                    <label className={styles.propertyLabel} htmlFor="budget-description">
                      Description
                    </label>
                    <input
                      type="text"
                      id="budget-description"
                      className={styles.propertyInput}
                      value={budgetForm.description}
                      onChange={(e) =>
                        setBudgetForm({ ...budgetForm, description: e.target.value })
                      }
                      placeholder="Optional description"
                      disabled={isSavingBudget}
                    />
                  </div>
                  <div className={styles.propertyGrid}>
                    <div className={styles.property}>
                      <label className={styles.propertyLabel} htmlFor="budget-category">
                        Category
                      </label>
                      <select
                        id="budget-category"
                        className={styles.propertySelect}
                        value={budgetForm.budgetCategoryId}
                        onChange={(e) =>
                          setBudgetForm({ ...budgetForm, budgetCategoryId: e.target.value })
                        }
                        disabled={isSavingBudget}
                      >
                        <option value="">None</option>
                        {budgetCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.property}>
                      <label className={styles.propertyLabel} htmlFor="budget-source">
                        Funding Source
                      </label>
                      <select
                        id="budget-source"
                        className={styles.propertySelect}
                        value={budgetForm.budgetSourceId}
                        onChange={(e) =>
                          setBudgetForm({ ...budgetForm, budgetSourceId: e.target.value })
                        }
                        disabled={isSavingBudget}
                      >
                        <option value="">None</option>
                        {budgetSources.map((src) => (
                          <option key={src.id} value={src.id}>
                            {src.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.property}>
                      <label className={styles.propertyLabel} htmlFor="budget-vendor">
                        Vendor
                      </label>
                      <select
                        id="budget-vendor"
                        className={styles.propertySelect}
                        value={budgetForm.vendorId}
                        onChange={(e) => setBudgetForm({ ...budgetForm, vendorId: e.target.value })}
                        disabled={isSavingBudget}
                      >
                        <option value="">None</option>
                        {allVendors.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.specialty ? ` — ${v.specialty}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className={styles.budgetEditActions}>
                    <button
                      type="submit"
                      className={styles.saveButton}
                      disabled={isSavingBudget || !budgetForm.plannedAmount}
                    >
                      {isSavingBudget ? 'Saving...' : editingBudgetId ? 'Save Changes' : 'Add Line'}
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
              </div>
            )}

            {/* Linked Subsidies */}
            <div className={styles.budgetSubsection}>
              <h3 className={styles.subsectionTitle}>Subsidies</h3>

              <div className={styles.linkedList}>
                {linkedSubsidies.length === 0 && (
                  <div className={styles.emptyState}>No subsidies linked</div>
                )}
                {linkedSubsidies.map((subsidy) => (
                  <div key={subsidy.id} className={styles.linkedItem}>
                    <div className={styles.linkedItemInfo}>
                      <span className={styles.linkedItemName}>{subsidy.name}</span>
                      <span className={styles.linkedItemMeta}>
                        {subsidy.reductionType === 'percentage'
                          ? `${subsidy.reductionValue}% reduction`
                          : `${formatCurrency(subsidy.reductionValue)} reduction`}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.unlinkButton}
                      onClick={() => handleUnlinkSubsidy(subsidy.id)}
                      aria-label={`Unlink subsidy ${subsidy.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {availableSubsidies.length > 0 && (
                <div className={styles.linkPickerRow}>
                  <select
                    className={styles.linkPickerSelect}
                    value={selectedSubsidyId}
                    onChange={(e) => setSelectedSubsidyId(e.target.value)}
                    aria-label="Select subsidy program to link"
                  >
                    <option value="">Select subsidy program...</option>
                    {availableSubsidies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.reductionType === 'percentage'
                          ? ` (${s.reductionValue}%)`
                          : ` (${formatCurrency(s.reductionValue)})`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={handleLinkSubsidy}
                    disabled={!selectedSubsidyId || isLinkingSubsidy}
                  >
                    {isLinkingSubsidy ? 'Linking...' : 'Add Subsidy'}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right column: Notes, Subtasks, Constraints */}
        <div className={styles.rightColumn}>
          {/* Notes */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Notes</h2>

            <form className={styles.addNoteForm} onSubmit={handleAddNote}>
              <textarea
                className={styles.noteTextarea}
                placeholder="Add a note..."
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
                {isAddingNote ? 'Adding...' : 'Add Note'}
              </button>
            </form>

            <div className={styles.notesList}>
              {notes.length === 0 && <div className={styles.emptyState}>No notes yet</div>}
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
            <h2 className={styles.sectionTitle}>Subtasks</h2>

            <form className={styles.addSubtaskForm} onSubmit={handleAddSubtask}>
              <input
                type="text"
                className={styles.subtaskInput}
                placeholder="Add a subtask..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                disabled={isAddingSubtask}
              />
              <button
                type="submit"
                className={styles.addButton}
                disabled={!newSubtaskTitle.trim() || isAddingSubtask}
              >
                {isAddingSubtask ? 'Adding...' : 'Add'}
              </button>
            </form>

            <div className={styles.subtasksList}>
              {subtasks.length === 0 && <div className={styles.emptyState}>No subtasks yet</div>}
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
            <h2 className={styles.sectionTitle}>Constraints</h2>

            {/* Duration subsection — first, no top border */}
            <div className={`${styles.constraintSubsection} ${styles.constraintSubsectionFirst}`}>
              <h3 className={styles.subsectionTitle}>Duration</h3>
              <div className={styles.property}>
                <label className={styles.propertyLabel}>Duration (days)</label>
                <div className={styles.inlineFieldWrapper}>
                  <input
                    type="number"
                    className={styles.propertyInput}
                    value={localDuration}
                    onChange={(e) => setLocalDuration(e.target.value)}
                    onBlur={() => void handleDurationBlur()}
                    min="0"
                    placeholder="0"
                  />
                  {autosaveDuration !== 'idle' && (
                    <span
                      className={`${styles.autosaveIndicator} ${autosaveDuration === 'saving' ? styles.autosaveSaving : autosaveDuration === 'success' ? styles.autosaveSuccess : styles.autosaveError}`}
                      aria-live="polite"
                    >
                      {autosaveDuration === 'saving'
                        ? '…'
                        : autosaveDuration === 'success'
                          ? '✓'
                          : '✗'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Date Constraints subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>Date Constraints</h3>
              <div className={styles.propertyGrid}>
                <div className={styles.property}>
                  <label className={styles.propertyLabel}>Start After</label>
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
                    {autosaveStartAfter !== 'idle' && (
                      <span
                        className={`${styles.autosaveIndicator} ${autosaveStartAfter === 'saving' ? styles.autosaveSaving : autosaveStartAfter === 'success' ? styles.autosaveSuccess : styles.autosaveError}`}
                        aria-live="polite"
                      >
                        {autosaveStartAfter === 'saving'
                          ? '…'
                          : autosaveStartAfter === 'success'
                            ? '✓'
                            : '✗'}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.property}>
                  <label className={styles.propertyLabel}>Start Before</label>
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
                    {autosaveStartBefore !== 'idle' && (
                      <span
                        className={`${styles.autosaveIndicator} ${autosaveStartBefore === 'saving' ? styles.autosaveSaving : autosaveStartBefore === 'success' ? styles.autosaveSuccess : styles.autosaveError}`}
                        aria-live="polite"
                      >
                        {autosaveStartBefore === 'saving'
                          ? '…'
                          : autosaveStartBefore === 'success'
                            ? '✓'
                            : '✗'}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.property}>
                  <label className={styles.propertyLabel}>Actual Start</label>
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
                    {autosaveActualStart !== 'idle' && (
                      <span
                        className={`${styles.autosaveIndicator} ${autosaveActualStart === 'saving' ? styles.autosaveSaving : autosaveActualStart === 'success' ? styles.autosaveSuccess : styles.autosaveError}`}
                        aria-live="polite"
                      >
                        {autosaveActualStart === 'saving'
                          ? '…'
                          : autosaveActualStart === 'success'
                            ? '✓'
                            : '✗'}
                      </span>
                    )}
                  </div>
                </div>

                <div className={styles.property}>
                  <label className={styles.propertyLabel}>Actual End</label>
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
                    {autosaveActualEnd !== 'idle' && (
                      <span
                        className={`${styles.autosaveIndicator} ${autosaveActualEnd === 'saving' ? styles.autosaveSaving : autosaveActualEnd === 'success' ? styles.autosaveSuccess : styles.autosaveError}`}
                        aria-live="polite"
                      >
                        {autosaveActualEnd === 'saving'
                          ? '…'
                          : autosaveActualEnd === 'success'
                            ? '✓'
                            : '✗'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dependencies subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>Dependencies</h3>

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
              <h3 className={styles.subsectionTitle}>Required Milestones</h3>
              <p className={styles.constraintSubsectionDesc}>
                Milestones that must be completed before this work item can start.
              </p>

              <div className={styles.milestoneChips}>
                {workItemMilestones.required.length === 0 && (
                  <div className={styles.emptyState}>No required milestones</div>
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
                      <option value="">Select milestone...</option>
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
                      {isAddingRequiredMilestone ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Linked Milestones subsection */}
            <div className={styles.constraintSubsection}>
              <h3 className={styles.subsectionTitle}>Linked Milestones</h3>
              <p className={styles.constraintSubsectionDesc}>
                Milestones this work item contributes to.
              </p>

              <div className={styles.milestoneChips}>
                {workItemMilestones.linked.length === 0 && (
                  <div className={styles.emptyState}>No linked milestones</div>
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
                      <option value="">Select milestone...</option>
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
                      {isAddingLinkedMilestone ? 'Adding...' : 'Link'}
                    </button>
                  </div>
                ) : null;
              })()}
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.timestamps}>
          <div>
            Created by {workItem.createdBy?.displayName || 'Unknown'} on{' '}
            {formatDate(workItem.createdAt)}
          </div>
          <div>Last updated {formatDate(workItem.updatedAt)}</div>
        </div>

        <button
          type="button"
          className={styles.deleteWorkItemButton}
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete Work Item
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
            <h2 className={styles.modalTitle}>Delete Work Item?</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete &ldquo;{workItem.title}&rdquo;? This action cannot be
              undone.
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
                onClick={handleDeleteWorkItem}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
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
            <h2 className={styles.modalTitle}>Delete Note?</h2>
            <p className={styles.modalText}>
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelButton}
                onClick={() => setDeletingNoteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalDeleteButton}
                onClick={confirmDeleteNote}
              >
                Delete
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
                onClick={confirmDeleteBudgetLine}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

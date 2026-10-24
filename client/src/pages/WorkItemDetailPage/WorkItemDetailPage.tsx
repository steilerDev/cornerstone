import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  WorkItemDetail,
  WorkItemStatus,
  UserResponse,
  NoteResponse,
  SubtaskResponse,
  DependencyResponse,
  SubsidyProgram,
  WorkItemBudgetLine,
  WorkItemMilestones,
  MilestoneSummary,
  WorkItemSubsidyPaybackResponse,
  WorkItemLinkedHouseholdItemSummary,
  HouseholdItemCategoryEntity,
} from '@cornerstone/shared';
import { fetchHouseholdItemCategories } from '../../lib/householdItemCategoriesApi.js';
import { getCategoryDisplayName } from '../../lib/categoryUtils.js';
import {
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
  fetchWorkItemSubsidies,
  linkWorkItemSubsidy,
  unlinkWorkItemSubsidy,
  fetchWorkItemSubsidyPayback,
} from '../../lib/workItemsApi.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchWorkItemBudgets } from '../../lib/workItemBudgetsApi.js';
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
import { EntityPicker } from '../../components/EntityPicker/EntityPicker.js';
import { decodeWho, encodeWho } from '../../components/EntityPicker/entityPickerKinds.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { BudgetCostOverview } from '../../components/budget/BudgetCostOverview.js';
import { SubsidyLinkSection } from '../../components/budget/SubsidyLinkSection.js';
import { CostLinesSection } from '../../components/CostLineTable/index.js';
import {
  DependencySentenceBuilder,
  DependencySentenceDisplay,
} from '../../components/DependencySentenceBuilder/index.js';
import type { DependencyType } from '@cornerstone/shared';
import { useFormatters, toBcp47Locale } from '../../lib/formatters.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { AutosaveIndicator } from '../../components/AutosaveIndicator/AutosaveIndicator.js';
import type { AutosaveState } from '../../components/AutosaveIndicator/AutosaveIndicator.js';
import { DocumentsPanelButton } from '../../components/DocumentsPanel/index.js';
import { Badge } from '../../components/Badge/Badge.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { StatusMenu } from '../../components/StatusMenu/StatusMenu.js';
import { taskTransitions } from '../../components/StatusMenu/statusVocabularies.js';
import { focusPageHeading } from '../../lib/focusPageHeading.js';
import { useDeleteImpact } from '../../hooks/useDeleteImpact.js';
import { useUndoableStatusChange } from '../../hooks/useUndoableStatusChange.js';
import { changeWorkItemStatus, workItemStatusBody } from '../../lib/statusChangeApi.js';
import { scheduleSignalBadgeProps } from '../../components/Badge/statusBadgeVariants.js';
import {
  barDates,
  plannedRangeText,
  scheduleSignalOf,
  showsPlannedRow,
} from '../../lib/scheduleDates.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import sharedStyles from '../../styles/shared.module.css';
import { PageBreadcrumbs } from '../../navigation/PageBreadcrumbs.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useSectionHashFocus } from '../../hooks/useSectionHashFocus.js';
import { TASK_SECTION_ANCHORS } from './taskAnchors.js';
import styles from './WorkItemDetailPage.module.css';

const CONSTRAINT_ERROR_KEYS = {
  startAfter: 'detail.inlineErrors.updateStartAfter',
  startBefore: 'detail.inlineErrors.updateStartBefore',
} as const;

interface DeletingDependency {
  type: 'predecessor' | 'successor';
  workItemId: string;
  title: string;
}

/** Reads the route id once; the view below always has a task id. */
export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={routeUrl('workItems')} replace />;
  return <WorkItemDetailView id={id} />;
}

function WorkItemDetailView({ id }: { id: string }) {
  const { resolvedLocale } = useLocale();
  const {
    formatCurrency: _formatCurrency,
    formatDate,
    formatTime: _formatTime,
    formatDateTime: _formatDateTime,
  } = useFormatters();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation('workItems');
  const { t: tBudget } = useTranslation('budget');
  const { t: tCostLines } = useTranslation('costLines');
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { t: tSettings } = useTranslation('settings');
  const { areas } = useAreas();

  const statusVariants = useStatusBadgeVariants();

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

  // Subsidy linking state
  const [selectedSubsidyId, setSelectedSubsidyId] = useState('');
  const [isLinkingSubsidy, setIsLinkingSubsidy] = useState(false);
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);

  // Subsidy payback state
  const [subsidyPayback, setSubsidyPayback] = useState<WorkItemSubsidyPaybackResponse | null>(null);

  // Linked household items state
  const [linkedHouseholdItems, setLinkedHouseholdItems] = useState<
    WorkItemLinkedHouseholdItemSummary[]
  >([]);
  const [hiCategories, setHiCategories] = useState<HouseholdItemCategoryEntity[]>([]);

  // Resolve linked-purchase category names (category is an id, not an enum)
  const hasLinkedHouseholdItems = linkedHouseholdItems.length > 0;
  useEffect(() => {
    if (!hasLinkedHouseholdItems || hiCategories.length > 0) return;
    let cancelled = false;
    fetchHouseholdItemCategories()
      .then((res) => {
        if (!cancelled) setHiCategories(res.categories);
      })
      .catch((err: unknown) => {
        console.error('Failed to load household item categories:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [hasLinkedHouseholdItems, hiCategories.length]);

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
  const [deleteWorkItemError, setDeleteWorkItemError] = useState<string | null>(null);
  const [deleteWorkItemBlocked, setDeleteWorkItemBlocked] = useState(false);
  // Shared by the note / subtask / dependency confirmations (only one is open at a time)
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const [inlineError, setInlineError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  // Auto-scroll to top when error appears
  useEffect(() => {
    if (error) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  // Shared reload functions for budget-related data
  const reloadBudgetLines = async () => {
    try {
      const data = await fetchWorkItemBudgets(id);
      setBudgetLines(data);
    } catch (err) {
      console.error('Failed to reload budget lines:', err);
    }
  };

  const reloadLinkedSubsidies = async () => {
    try {
      const data = await fetchWorkItemSubsidies(id);
      setLinkedSubsidies(data);
    } catch (err) {
      console.error('Failed to reload linked subsidies:', err);
    }
  };

  const reloadSubsidyPayback = async () => {
    try {
      const data = await fetchWorkItemSubsidyPayback(id);
      setSubsidyPayback(data);
    } catch (err) {
      console.error('Failed to reload subsidy payback:', err);
    }
  };

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
  const autosaveResetRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function triggerAutosaveReset(setter: (v: AutosaveState) => void, key: string) {
    if (autosaveResetRef.current[key]) {
      clearTimeout(autosaveResetRef.current[key]);
    }
    autosaveResetRef.current[key] = setTimeout(() => {
      setter('idle');
    }, 2000);
  }

  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingSubtaskId, setDeletingSubtaskId] = useState<string | null>(null);
  const [deletingDependency, setDeletingDependency] = useState<DeletingDependency | null>(null);
  const deleteWorkItemConsequences = useDeleteImpact('work_item', showDeleteConfirm ? id : null);

  // Load all data on mount
  useEffect(() => {
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
          budgetLinesData,
          subsidiesData,
          linkedSubsidiesData,
          workItemMilestonesData,
          allMilestonesData,
          subsidyPaybackData,
          linkedHouseholdItemsData,
        ] = await Promise.all([
          getWorkItem(id),
          listNotes(id),
          listSubtasks(id),
          getDependencies(id),
          listUsers(),
          fetchWorkItemBudgets(id),
          fetchSubsidyPrograms(),
          fetchWorkItemSubsidies(id),
          getWorkItemMilestones(id),
          listMilestones(),
          fetchWorkItemSubsidyPayback(id),
          fetchLinkedHouseholdItems(id),
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
        setBudgetLines(budgetLinesData);
        setAllSubsidyPrograms(subsidiesData.subsidyPrograms);
        setLinkedSubsidies(linkedSubsidiesData);
        setWorkItemMilestones(workItemMilestonesData);
        setAllMilestones(allMilestonesData);
        setSubsidyPayback(subsidyPaybackData);
        setLinkedHouseholdItems(linkedHouseholdItemsData);
      } catch (err: unknown) {
        if (err instanceof ApiClientError && err.statusCode === 404) {
          setIs404(true);
        } else {
          setError(t('detail.inlineErrors.loadFailed'));
        }
        console.error('Failed to load work item:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [id, t]);

  // Reload work item details after changes
  const reloadWorkItem = async () => {
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
    try {
      const notesData = await listNotes(id);
      setNotes(notesData.notes);
    } catch (err) {
      console.error('Failed to reload notes:', err);
    }
  };

  const reloadSubtasks = async () => {
    try {
      const subtasksData = await listSubtasks(id);
      setSubtasks(subtasksData.subtasks);
    } catch (err) {
      console.error('Failed to reload subtasks:', err);
    }
  };

  const reloadDependencies = async () => {
    try {
      const depsData = await getDependencies(id);
      setDependencies(depsData);
    } catch (err) {
      console.error('Failed to reload dependencies:', err);
    }
  };

  const reloadWorkItemMilestones = async () => {
    try {
      const data = await getWorkItemMilestones(id);
      setWorkItemMilestones(data);
    } catch (err) {
      console.error('Failed to reload work item milestones:', err);
    }
  };

  // ─── Subsidy linking handlers ──────────────────────────────────────────────

  const handleLinkSubsidy = async () => {
    if (!selectedSubsidyId) return;
    setBudgetError(null);
    setIsLinkingSubsidy(true);
    try {
      await linkWorkItemSubsidy(id, selectedSubsidyId);
      await reloadLinkedSubsidies();
      setSelectedSubsidyId('');
      await reloadSubsidyPayback();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setBudgetError(t('detail.inlineErrors.alreadyLinkedSubsidy'));
        } else {
          setBudgetError(translateApiError(err.error.code, tErrors));
        }
      } else if (err instanceof NetworkError) {
        setBudgetError(tCommon('requestErrors.network'));
      } else {
        setBudgetError(t('detail.inlineErrors.linkSubsidy'));
      }
      console.error('Failed to link subsidy:', err);
    } finally {
      setIsLinkingSubsidy(false);
    }
  };

  const handleUnlinkSubsidy = async (subsidyProgramId: string) => {
    setBudgetError(null);
    try {
      await unlinkWorkItemSubsidy(id, subsidyProgramId);
      await reloadLinkedSubsidies();
      await reloadSubsidyPayback();
    } catch (err) {
      setBudgetError(t('detail.inlineErrors.unlinkSubsidy'));
      console.error('Failed to unlink subsidy:', err);
    }
  };

  // After any cost-line change the page refreshes its lines, grant payback and linked grants.
  const handleCostLinesChanged = async () => {
    await Promise.all([reloadBudgetLines(), reloadSubsidyPayback(), reloadLinkedSubsidies()]);
    setBudgetError(null);
  };

  // ─── Milestone relationship handlers ──────────────────────────────────────

  const handleAddRequiredMilestone = async () => {
    setIsAddingRequiredMilestone(true);
    setInlineError(null);
    try {
      await addRequiredMilestone(id, Number(selectedRequiredMilestoneId));
      setSelectedRequiredMilestoneId('');
      await reloadWorkItemMilestones();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setInlineError(
          err.error.code === 'DUPLICATE_DEPENDENCY'
            ? t('detail.inlineErrors.requiredMilestoneAlreadyLinked')
            : translateApiError(err.error.code, tErrors),
        );
      } else if (err instanceof NetworkError) {
        setInlineError(tCommon('requestErrors.network'));
      } else {
        setInlineError(t('detail.inlineErrors.addRequiredMilestone'));
      }
      console.error('Failed to add required milestone:', err);
    } finally {
      setIsAddingRequiredMilestone(false);
    }
  };

  const handleRemoveRequiredMilestone = async (milestoneId: number) => {
    setInlineError(null);
    try {
      await removeRequiredMilestone(id, milestoneId);
      await reloadWorkItemMilestones();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.removeRequiredMilestone'));
      console.error('Failed to remove required milestone:', err);
    }
  };

  const handleAddLinkedMilestone = async () => {
    setIsAddingLinkedMilestone(true);
    setInlineError(null);
    try {
      await addLinkedMilestone(id, Number(selectedLinkedMilestoneId));
      setSelectedLinkedMilestoneId('');
      await reloadWorkItemMilestones();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setInlineError(
          err.error.code === 'DUPLICATE_DEPENDENCY'
            ? t('detail.inlineErrors.linkedMilestoneAlreadyLinked')
            : translateApiError(err.error.code, tErrors),
        );
      } else if (err instanceof NetworkError) {
        setInlineError(tCommon('requestErrors.network'));
      } else {
        setInlineError(t('detail.inlineErrors.addLinkedMilestone'));
      }
      console.error('Failed to add linked milestone:', err);
    } finally {
      setIsAddingLinkedMilestone(false);
    }
  };

  const handleRemoveLinkedMilestone = async (milestoneId: number) => {
    setInlineError(null);
    try {
      await removeLinkedMilestone(id, milestoneId);
      await reloadWorkItemMilestones();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.removeLinkedMilestone'));
      console.error('Failed to remove linked milestone:', err);
    }
  };

  // Title editing
  const startEditingTitle = () => {
    const current = workItem!;
    setEditedTitle(current.title);
    setIsEditingTitle(true);
  };

  const saveTitle = async () => {
    if (!editedTitle.trim()) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { title: editedTitle.trim() });
      setIsEditingTitle(false);
      await reloadWorkItem();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateTitle'));
      console.error('Failed to update title:', err);
    }
  };

  const cancelTitleEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  // Description editing
  const startEditingDescription = () => {
    const current = workItem!;
    setEditedDescription(current.description || '');
    setIsEditingDescription(true);
  };

  const saveDescription = async () => {
    setInlineError(null);
    try {
      await updateWorkItem(id, { description: editedDescription.trim() || null });
      setIsEditingDescription(false);
      await reloadWorkItem();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateDescription'));
      console.error('Failed to update description:', err);
    }
  };

  const cancelDescriptionEdit = () => {
    setIsEditingDescription(false);
    setEditedDescription('');
  };

  // Status change (StatusMenu): the PATCH may return an undo token for the toast
  const { run: runStatusChange } = useUndoableStatusChange();
  const handleStatusChange = async (newStatus: WorkItemStatus, date: string | null) => {
    const current = workItem!;
    setInlineError(null);
    await runStatusChange({
      request: () => changeWorkItemStatus(id, workItemStatusBody(newStatus, date)),
      recordName: current.title,
      statusLabel: statusVariants.task[newStatus].label,
      dedupeKey: `task:${id}`,
      onChanged: () => void reloadWorkItem(),
      onUndone: reloadWorkItem,
    });
  };

  // Assigned user change
  const handleAssignmentChange = async (assignmentValue: string) => {
    setInlineError(null);
    const { userId, vendorId } = decodeWho(assignmentValue);
    try {
      await updateWorkItem(id, {
        assignedUserId: userId || null,
        assignedVendorId: vendorId || null,
      });
      await reloadWorkItem();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateAssignment'));
      console.error('Failed to update assignment:', err);
    }
  };

  const handleAreaChange = async (areaId: string) => {
    setInlineError(null);
    try {
      await updateWorkItem(id, { areaId: areaId || null });
      await reloadWorkItem();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateArea'));
      console.error('Failed to update area:', err);
    }
  };

  // Duration change — saves onBlur to avoid race conditions from rapid keystroke API calls
  const handleDurationBlur = async () => {
    const current = workItem!;
    const duration = localDuration ? Number(localDuration) : null;
    if (duration !== null && (isNaN(duration) || duration < 0)) return;

    // Only save if the value actually changed
    const currentDuration = current.durationDays;
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
      setInlineError(t('detail.inlineErrors.updateDuration'));
      console.error('Failed to update duration:', err);
    }
  };

  // Constraint changes — saves onBlur to avoid race conditions
  const handleConstraintBlur = async (field: 'startAfter' | 'startBefore') => {
    const current = workItem!;
    const localValue = field === 'startAfter' ? localStartAfter : localStartBefore;
    const currentValue = current[field] || '';

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
      setInlineError(t(CONSTRAINT_ERROR_KEYS[field]));
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Actual date changes — saves onBlur, allows manual override or clearing
  const handleActualDateBlur = async (field: 'actualStartDate' | 'actualEndDate') => {
    const current = workItem!;
    const localValue = field === 'actualStartDate' ? localActualStartDate : localActualEndDate;
    const currentValue = current[field] || '';

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
        field === 'actualStartDate'
          ? t('detail.inlineErrors.updateActualStartDate')
          : t('detail.inlineErrors.updateActualEndDate'),
      );
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Notes
  const handleAddNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!newNoteContent.trim()) return;

    setIsAddingNote(true);
    setInlineError(null);
    try {
      await createNote(id, { content: newNoteContent.trim() });
      setNewNoteContent('');
      await reloadNotes();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.addNote'));
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
    if (!editedNoteContent.trim()) return;
    setInlineError(null);
    try {
      await updateNote(id, noteId, { content: editedNoteContent.trim() });
      setEditingNoteId(null);
      setEditedNoteContent('');
      await reloadNotes();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateNote'));
      console.error('Failed to update note:', err);
    }
  };

  const cancelNoteEdit = () => {
    setEditingNoteId(null);
    setEditedNoteContent('');
  };

  const handleDeleteNote = async (noteId: string) => {
    setConfirmError(null);
    setDeletingNoteId(noteId);
  };

  const confirmDeleteNote = async () => {
    const noteId = deletingNoteId!;
    setInlineError(null);
    setConfirmError(null);
    setConfirmBusy(true);
    try {
      await deleteNote(id, noteId);
      focusPageHeading();
      setDeletingNoteId(null);
      await reloadNotes();
    } catch (err) {
      setConfirmError(t('detail.inlineErrors.deleteNote'));
      console.error('Failed to delete note:', err);
    } finally {
      setConfirmBusy(false);
    }
  };

  // Subtasks
  const handleAddSubtask = async (event: FormEvent) => {
    event.preventDefault();
    if (!newSubtaskTitle.trim()) return;

    setIsAddingSubtask(true);
    setInlineError(null);
    try {
      await createSubtask(id, { title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      await reloadSubtasks();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.addSubtask'));
      console.error('Failed to add subtask:', err);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, isCompleted: boolean) => {
    setInlineError(null);
    try {
      await updateSubtask(id, subtaskId, { isCompleted });
      await reloadSubtasks();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateSubtask'));
      console.error('Failed to update subtask:', err);
    }
  };

  const startEditingSubtask = (subtask: SubtaskResponse) => {
    setEditingSubtaskId(subtask.id);
    setEditedSubtaskTitle(subtask.title);
  };

  const saveSubtaskEdit = async (subtaskId: string) => {
    if (!editedSubtaskTitle.trim()) return;
    setInlineError(null);
    try {
      await updateSubtask(id, subtaskId, { title: editedSubtaskTitle.trim() });
      setEditingSubtaskId(null);
      setEditedSubtaskTitle('');
      await reloadSubtasks();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.updateSubtask'));
      console.error('Failed to update subtask:', err);
    }
  };

  const cancelSubtaskEdit = () => {
    setEditingSubtaskId(null);
    setEditedSubtaskTitle('');
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    setConfirmError(null);
    setDeletingSubtaskId(subtaskId);
  };

  const confirmDeleteSubtask = async () => {
    const subtaskId = deletingSubtaskId!;
    setInlineError(null);
    setConfirmError(null);
    setConfirmBusy(true);
    try {
      await deleteSubtask(id, subtaskId);
      focusPageHeading();
      setDeletingSubtaskId(null);
      await reloadSubtasks();
    } catch (err) {
      setConfirmError(t('detail.inlineErrors.deleteSubtask'));
      console.error('Failed to delete subtask:', err);
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleMoveSubtask = async (index: number, direction: 'up' | 'down') => {
    // The move buttons are disabled at both ends, so newIndex is always a valid position.
    const newIndex = direction === 'up' ? index - 1 : index + 1;

    const reordered = [...subtasks];
    const [moved] = reordered.splice(index, 1);
    // moved is guaranteed to exist because index is valid (guarded by bounds check above)
    reordered.splice(newIndex, 0, moved!);

    setInlineError(null);
    try {
      await reorderSubtasks(id, { subtaskIds: reordered.map((s) => s.id) });
      await reloadSubtasks();
    } catch (err) {
      setInlineError(t('detail.inlineErrors.reorderSubtasks'));
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
      if (err instanceof ApiClientError) {
        setInlineError(translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        setInlineError(tCommon('requestErrors.network'));
      } else {
        setInlineError(t('detail.inlineErrors.addDependency'));
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
    setConfirmError(null);
    setDeletingDependency({ type, workItemId, title });
  };

  const confirmDeleteDependency = async () => {
    const target = deletingDependency!;
    setInlineError(null);
    setConfirmError(null);
    setConfirmBusy(true);
    try {
      if (target.type === 'predecessor') {
        await deleteDependency(id, target.workItemId);
      } else {
        // For successors, swap: delete from the successor's perspective
        await deleteDependency(target.workItemId, id);
      }
      focusPageHeading();
      setDeletingDependency(null);
      await reloadDependencies();
    } catch (err) {
      setConfirmError(t('detail.inlineErrors.removeDependency'));
      console.error('Failed to remove dependency:', err);
    } finally {
      setConfirmBusy(false);
    }
  };

  // Delete work item
  const handleDeleteWorkItem = async () => {
    setIsDeleting(true);
    setInlineError(null);
    setDeleteWorkItemError(null);
    try {
      await deleteWorkItem(id);
      navigate(routeUrl('workItems'), { replace: true });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setDeleteWorkItemBlocked(err.statusCode === 409);
        setDeleteWorkItemError(translateApiError(err.error.code, tErrors));
      } else if (err instanceof NetworkError) {
        setDeleteWorkItemError(tCommon('requestErrors.network'));
      } else {
        setDeleteWorkItemError(t('detail.inlineErrors.deleteWorkItem'));
      }
      console.error('Failed to delete work item:', err);
      setIsDeleting(false);
    }
  };

  const excludedWorkItemIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(id);
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
          if (
            workItem !== null &&
            !isEditingTitle &&
            !isEditingDescription &&
            !editingNoteId &&
            !editingSubtaskId
          ) {
            startEditingTitle();
          }
        },
        description: 'Edit title',
      },
      {
        key: 'Delete',
        handler: () => setShowDeleteConfirm(true),
        description: 'Delete work item (Delete / Backspace)',
      },
      {
        key: 'Backspace',
        handler: () => setShowDeleteConfirm(true),
        description: '', // Empty description to hide in help overlay
      },
      {
        key: 'Escape',
        handler: () => {
          // Page shortcuts are off while a modal is open, so the help and delete dialogs close
          // themselves; only the inline edits are cancelled here.
          if (isEditingTitle) {
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
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- startEditingTitle is defined in the component body; the shortcuts array is recomputed whenever the loaded item or an editing flag changes, so `e` never runs a stale handler
    [workItem, isEditingTitle, isEditingDescription, editingNoteId, editingSubtaskId],
  );

  useKeyboardShortcuts(shortcuts);

  const displayTitle = workItem?.title.trim() || tCommon('navigation.untitledTask');
  const h1Text = isLoading
    ? tCommon('navigation.task')
    : is404
      ? tCommon('navigation.taskNotFound')
      : error || !workItem
        ? tCommon('navigation.task')
        : displayTitle;
  useDocumentTitle(h1Text);
  useSectionHashFocus(TASK_SECTION_ANCHORS, !isLoading);
  const originState = useOriginState(workItem && !isLoading ? displayTitle : undefined);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={styles.stateTitle}>{h1Text}</h1>
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
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate(routeUrl('workItems'))}
            >
              {tCommon('navigation.backTo', { origin: tCommon('navigation.tasks') })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className={styles.container}>
        <PageBreadcrumbs />
        <h1 className={styles.stateTitle}>{h1Text}</h1>
        <div className={styles.errorCard} role="alert">
          <h2 className={styles.errorTitle}>{t('detail.error.title')}</h2>
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.backButton}
              onClick={() => navigate(routeUrl('workItems'))}
            >
              {tCommon('navigation.backTo', { origin: tCommon('navigation.tasks') })}
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

  const scheduleSignal = scheduleSignalOf(workItem);
  const shownDates = barDates(workItem);

  // Available milestones for 'required' and 'linked' milestone pickers
  const requiredMilestoneIds = new Set(workItemMilestones.required.map((m) => m.id));
  const availableRequiredMilestones = allMilestones.filter((m) => !requiredMilestoneIds.has(m.id));
  const requiredMilestonePicker =
    availableRequiredMilestones.length > 0 ? (
      <div className={styles.linkPickerRow}>
        <select
          className={styles.linkPickerSelect}
          value={selectedRequiredMilestoneId}
          onChange={(e) => setSelectedRequiredMilestoneId(e.target.value)}
          aria-label={t('detail.constraints.selectRequiredMilestoneAriaLabel')}
        >
          <option value="">{t('detail.constraints.selectMilestonePlaceholder')}</option>
          {availableRequiredMilestones.map((m) => (
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

  const linkedMilestoneIds = new Set(workItemMilestones.linked.map((m) => m.id));
  const availableLinkedMilestones = allMilestones.filter((m) => !linkedMilestoneIds.has(m.id));
  const linkedMilestonePicker =
    availableLinkedMilestones.length > 0 ? (
      <div className={styles.linkPickerRow}>
        <select
          className={styles.linkPickerSelect}
          value={selectedLinkedMilestoneId}
          onChange={(e) => setSelectedLinkedMilestoneId(e.target.value)}
          aria-label={t('detail.constraints.selectLinkedMilestoneAriaLabel')}
        >
          <option value="">{t('detail.constraints.selectMilestonePlaceholder')}</option>
          {availableLinkedMilestones.map((m) => (
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

  return (
    <div className={styles.container}>
      <PageBreadcrumbs />

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
        <div className={styles.headerRow}>
          <div className={styles.titleSection}>
            {isEditingTitle ? (
              <div className={styles.titleEdit}>
                <h1 className={sharedStyles.srOnly}>{displayTitle}</h1>
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
                    {tCommon('button.save')}
                  </button>
                  <button type="button" onClick={cancelTitleEdit} className={styles.cancelButton}>
                    {tCommon('button.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <h1 className={styles.title} onClick={startEditingTitle}>
                {displayTitle}
              </h1>
            )}
          </div>

          <div className={styles.statusSection}>
            {scheduleSignal && (
              <Badge
                {...scheduleSignalBadgeProps(scheduleSignal, statusVariants.scheduleSignal)}
                testId="work-item-schedule-signal"
              />
            )}
            <StatusMenu
              testId="work-item-status"
              transitions={taskTransitions(tCommon, workItem)}
              badge={{ variants: statusVariants.task, value: workItem.status }}
              currentLabel={statusVariants.task[workItem.status].label}
              onApply={handleStatusChange}
            />
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
                  {shownDates.start
                    ? formatDate(shownDates.start)
                    : t('detail.schedule.notScheduled')}
                </span>
              </div>

              <div className={styles.property}>
                <span className={styles.propertyLabel}>{t('detail.schedule.endDate')}</span>
                <span className={styles.propertyValue}>
                  {shownDates.end ? formatDate(shownDates.end) : t('detail.schedule.notScheduled')}
                </span>
              </div>
            </div>
            {showsPlannedRow({
              startDate: shownDates.start,
              endDate: shownDates.end,
              plannedStartDate: workItem.startDate,
              plannedEndDate: workItem.endDate,
            }) && (
              <p className={styles.plannedDates} data-testid="work-item-planned-dates">
                {t('detail.schedule.plannedRange', {
                  range: plannedRangeText(
                    workItem.startDate,
                    workItem.endDate,
                    toBcp47Locale(resolvedLocale),
                    formatDate,
                  ),
                })}
              </p>
            )}
          </section>

          {/* Area */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.area')}</h2>
            <div className={styles.property}>
              <label className={styles.propertyLabel}>{t('detail.area.label')}</label>
              <EntityPicker
                kind="area"
                areas={areas}
                value={workItem.area?.id || ''}
                onChange={(areaId) => void handleAreaChange(areaId)}
                noneLabel={tCommon('aria.noArea')}
              />
            </div>
          </section>

          {/* Assigned User/Vendor */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('detail.sections.assignment')}</h2>
            <div className={styles.property}>
              <label className={styles.propertyLabel} htmlFor="work-item-assignment">
                {t('detail.assignment.assignedTo')}
              </label>
              <EntityPicker
                kind="who"
                id="work-item-assignment"
                users={users}
                knownCompany={workItem.assignedVendor ?? null}
                value={encodeWho({
                  userId: workItem.assignedUser?.id,
                  vendorId: workItem.assignedVendor?.id,
                })}
                onChange={(next) => void handleAssignmentChange(next)}
              />
            </div>
          </section>

          {/* Cost */}
          <section className={styles.section} aria-labelledby="work-item-cost-heading">
            <h2 id="work-item-cost-heading" className={styles.sectionTitle}>
              {tCostLines('section.costHeading')}
            </h2>

            {budgetError && (
              <div className={styles.errorBanner} role="alert">
                {budgetError}
                <button
                  type="button"
                  className={styles.closeError}
                  onClick={() => setBudgetError(null)}
                  aria-label={tBudget('invoiceDetail.budgetLines.dismissErrorAriaLabel')}
                >
                  ×
                </button>
              </div>
            )}

            <BudgetCostOverview budgetLines={budgetLines} subsidyPayback={subsidyPayback} />

            <CostLinesSection
              host={{ kind: 'work_item', id: workItem.id, label: workItem.title }}
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
                <div className={styles.emptyState}>{t('detail.subtasks.noSubtasks')}</div>
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
                          title={t('detail.subtasks.moveUp')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSubtask(index, 'down')}
                          className={styles.moveButton}
                          disabled={index === subtasks.length - 1}
                          title={t('detail.subtasks.moveDown')}
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
          <section
            className={styles.section}
            id="constraints"
            aria-labelledby="constraints-heading"
          >
            <h2 id="constraints-heading" tabIndex={-1} className={styles.sectionTitle}>
              {t('detail.sections.constraints')}
            </h2>

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
                        aria-label={t('detail.constraints.clearStartAfter')}
                        onClick={() => {
                          setLocalStartAfter('');
                          if (workItem.startAfter) {
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
                        aria-label={t('detail.constraints.clearStartBefore')}
                        onClick={() => {
                          setLocalStartBefore('');
                          if (workItem.startBefore) {
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
                        aria-label={t('detail.constraints.clearActualStart')}
                        onClick={() => {
                          setLocalActualStartDate('');
                          if (workItem.actualStartDate) {
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
                        aria-label={t('detail.constraints.clearActualEnd')}
                        onClick={() => {
                          setLocalActualEndDate('');
                          if (workItem.actualEndDate) {
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
                linkState={originState}
              />

              <div className={styles.addDependencySection}>
                <DependencySentenceBuilder
                  thisItemId={id}
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
                      aria-label={t('detail.constraints.removeRequiredMilestoneAria', {
                        name: ms.name,
                      })}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {requiredMilestonePicker}
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
                      aria-label={t('detail.constraints.removeLinkedMilestoneAria', {
                        name: ms.name,
                      })}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {linkedMilestonePicker}
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
                  to={routeUrl('householdItem', { id: hi.id })}
                  state={originState}
                  className={styles.householdItemLinkName}
                >
                  {hi.name}
                </Link>
                {(() => {
                  const category = hiCategories.find((c) => c.id === hi.category);
                  return category ? (
                    <span className={styles.householdItemCategoryBadge}>
                      {getCategoryDisplayName(tSettings, category.name, category.translationKey)}
                    </span>
                  ) : null;
                })()}
                <Badge
                  variants={statusVariants.purchase}
                  value={hi.status}
                  testId={`linked-household-item-status-${hi.id}`}
                />
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
      <DocumentsPanelButton
        entityType="work_item"
        entityId={id}
        wrapperClassName={styles.section}
      />

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

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', { name: workItem.title })}
          consequences={deleteWorkItemConsequences}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={isDeleting}
          error={deleteWorkItemError}
          blocked={deleteWorkItemBlocked}
          onConfirm={() => void handleDeleteWorkItem()}
          onCancel={() => setShowDeleteConfirm(false)}
          testIdPrefix="work-item-delete"
        />
      )}

      {/* Keyboard shortcuts help */}
      {showShortcutsHelp && (
        <KeyboardShortcutsHelp shortcuts={shortcuts} onClose={() => setShowShortcutsHelp(false)} />
      )}

      {/* Note deletion confirmation */}
      {deletingNoteId && (
        <ConfirmDialog
          title={t('detail.modals.deleteNote.title')}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => void confirmDeleteNote()}
          onCancel={() => setDeletingNoteId(null)}
          testIdPrefix="note-delete"
        />
      )}

      {/* Subtask deletion confirmation */}
      {deletingSubtaskId && (
        <ConfirmDialog
          title={tCommon('confirmDialog.deleteTitle', {
            name: subtasks.find((subtask) => subtask.id === deletingSubtaskId)?.title ?? '',
          })}
          irreversible
          confirmLabel={tCommon('button.delete')}
          busyLabel={tCommon('confirmDialog.deleting')}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => void confirmDeleteSubtask()}
          onCancel={() => setDeletingSubtaskId(null)}
          testIdPrefix="subtask-delete"
        />
      )}

      {/* Dependency removal confirmation */}
      {deletingDependency && (
        <ConfirmDialog
          title={t('detail.modals.removeDependency.title')}
          lead={
            deletingDependency.type === 'predecessor'
              ? t('detail.modals.removeDependency.textPredecessor', {
                  title: deletingDependency.title,
                })
              : t('detail.modals.removeDependency.textSuccessor', {
                  title: deletingDependency.title,
                })
          }
          confirmLabel={t('detail.modals.removeDependency.remove')}
          busyLabel={t('detail.modals.removeDependency.removing')}
          busy={confirmBusy}
          error={confirmError}
          onConfirm={() => void confirmDeleteDependency()}
          onCancel={() => setDeletingDependency(null)}
          testIdPrefix="dependency-remove"
        />
      )}
    </div>
  );
}

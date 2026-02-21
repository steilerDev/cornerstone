import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from '@cornerstone/shared';
import {
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
  fetchWorkItemVendors,
  linkWorkItemVendor,
  unlinkWorkItemVendor,
  fetchWorkItemSubsidies,
  linkWorkItemSubsidy,
  unlinkWorkItemSubsidy,
} from '../../lib/workItemsApi.js';
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
import { TagPicker } from '../../components/TagPicker/TagPicker.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../../components/KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import {
  DependencySentenceBuilder,
  DependencySentenceDisplay,
} from '../../components/DependencySentenceBuilder/index.js';
import type { DependencyType } from '@cornerstone/shared';
import styles from './WorkItemDetailPage.module.css';

interface DeletingDependency {
  type: 'predecessor' | 'successor';
  workItemId: string;
  title: string;
}

export default function WorkItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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

  // Budget-related state
  const [budgetCategories, setBudgetCategories] = useState<BudgetCategory[]>([]);
  const [budgetSources, setBudgetSources] = useState<BudgetSource[]>([]);
  const [linkedVendors, setLinkedVendors] = useState<Vendor[]>([]);
  const [linkedSubsidies, setLinkedSubsidies] = useState<SubsidyProgram[]>([]);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [allSubsidyPrograms, setAllSubsidyPrograms] = useState<SubsidyProgram[]>([]);

  // Budget edit state
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editedPlannedBudget, setEditedPlannedBudget] = useState('');
  const [editedActualCost, setEditedActualCost] = useState('');
  const [editedConfidencePercent, setEditedConfidencePercent] = useState('');
  const [editedBudgetCategoryId, setEditedBudgetCategoryId] = useState('');
  const [editedBudgetSourceId, setEditedBudgetSourceId] = useState('');

  // Vendor/Subsidy picker state
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedSubsidyId, setSelectedSubsidyId] = useState('');
  const [isLinkingVendor, setIsLinkingVendor] = useState(false);
  const [isLinkingSubsidy, setIsLinkingSubsidy] = useState(false);

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

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const [inlineError, setInlineError] = useState<string | null>(null);
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
          linkedVendorsData,
          subsidiesData,
          linkedSubsidiesData,
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
          fetchWorkItemVendors(id!),
          fetchSubsidyPrograms(),
          fetchWorkItemSubsidies(id!),
        ]);

        setWorkItem(workItemData);
        setNotes(notesData.notes);
        setSubtasks(subtasksData.subtasks);
        setDependencies(depsData);
        setAvailableTags(tagsData.tags);
        setUsers(usersData.users.filter((u) => !u.deactivatedAt));
        setBudgetCategories(categoriesData.categories);
        setBudgetSources(sourcesData.budgetSources);
        setAllVendors(vendorsData.vendors);
        setLinkedVendors(linkedVendorsData);
        setAllSubsidyPrograms(subsidiesData.subsidyPrograms);
        setLinkedSubsidies(linkedSubsidiesData);
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

  // Reload work item details after changes
  const reloadWorkItem = async () => {
    if (!id) return;
    try {
      const updated = await getWorkItem(id);
      setWorkItem(updated);
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

  const reloadLinkedVendors = async () => {
    if (!id) return;
    try {
      const data = await fetchWorkItemVendors(id);
      setLinkedVendors(data);
    } catch (err) {
      console.error('Failed to reload linked vendors:', err);
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

  // Budget field editing
  // NOTE: Story 5.9 rework — budget data is now in workItem.budgets (budget lines).
  // The inline budget editor below is a legacy UI that will be replaced by dedicated
  // budget line management in a future story. For now, initialize from first budget line.
  const startEditingBudget = () => {
    if (!workItem) return;
    const firstBudget = workItem.budgets[0] ?? null;
    setEditedPlannedBudget(
      firstBudget?.plannedAmount != null ? String(firstBudget.plannedAmount) : '',
    );
    setEditedActualCost(firstBudget?.actualCost != null ? String(firstBudget.actualCost) : '');
    setEditedConfidencePercent('');
    setEditedBudgetCategoryId(firstBudget?.budgetCategory?.id || '');
    setEditedBudgetSourceId(firstBudget?.budgetSource?.id || '');
    setIsEditingBudget(true);
  };

  const saveBudget = async () => {
    if (!id) return;
    setInlineError(null);
    try {
      const plannedBudget = editedPlannedBudget !== '' ? parseFloat(editedPlannedBudget) : null;
      const actualCost = editedActualCost !== '' ? parseFloat(editedActualCost) : null;
      const confidencePercent =
        editedConfidencePercent !== '' ? parseInt(editedConfidencePercent, 10) : null;

      if (plannedBudget !== null && isNaN(plannedBudget)) {
        setInlineError('Planned budget must be a valid number');
        return;
      }
      if (actualCost !== null && isNaN(actualCost)) {
        setInlineError('Actual cost must be a valid number');
        return;
      }
      if (
        confidencePercent !== null &&
        (isNaN(confidencePercent) || confidencePercent < 0 || confidencePercent > 100)
      ) {
        setInlineError('Confidence must be between 0 and 100');
        return;
      }

      // NOTE: Story 5.9 rework — budget fields removed from UpdateWorkItemRequest.
      // Budget data is now managed via the /api/work-items/:id/budgets endpoint.
      // This inline editor is a legacy UI stub; it no longer sends budget data.
      await updateWorkItem(id, {});
      setIsEditingBudget(false);
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update budget fields');
      console.error('Failed to update budget fields:', err);
    }
  };

  const cancelBudgetEdit = () => {
    setIsEditingBudget(false);
  };

  // Vendor linking
  const handleLinkVendor = async () => {
    if (!id || !selectedVendorId) return;
    setIsLinkingVendor(true);
    setInlineError(null);
    try {
      await linkWorkItemVendor(id, selectedVendorId);
      setSelectedVendorId('');
      await reloadLinkedVendors();
    } catch (err) {
      const apiErr = err as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 409) {
        setInlineError('This vendor is already linked');
      } else {
        setInlineError('Failed to link vendor');
      }
      console.error('Failed to link vendor:', err);
    } finally {
      setIsLinkingVendor(false);
    }
  };

  const handleUnlinkVendor = async (vendorId: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await unlinkWorkItemVendor(id, vendorId);
      await reloadLinkedVendors();
    } catch (err) {
      setInlineError('Failed to unlink vendor');
      console.error('Failed to unlink vendor:', err);
    }
  };

  // Subsidy linking
  const handleLinkSubsidy = async () => {
    if (!id || !selectedSubsidyId) return;
    setIsLinkingSubsidy(true);
    setInlineError(null);
    try {
      await linkWorkItemSubsidy(id, selectedSubsidyId);
      setSelectedSubsidyId('');
      await reloadLinkedSubsidies();
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
      await reloadLinkedSubsidies();
    } catch (err) {
      setInlineError('Failed to unlink subsidy program');
      console.error('Failed to unlink subsidy:', err);
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

  // Date changes
  const handleDateChange = async (field: 'startDate' | 'endDate', value: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { [field]: value || null });
      await reloadWorkItem();
    } catch (err) {
      setInlineError(`Failed to update ${field}`);
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Duration change
  const handleDurationChange = async (value: string) => {
    if (!id) return;
    const duration = value ? Number(value) : null;
    if (duration !== null && (isNaN(duration) || duration < 0)) return;

    setInlineError(null);
    try {
      await updateWorkItem(id, { durationDays: duration });
      await reloadWorkItem();
    } catch (err) {
      setInlineError('Failed to update duration');
      console.error('Failed to update duration:', err);
    }
  };

  // Constraint changes
  const handleConstraintChange = async (field: 'startAfter' | 'startBefore', value: string) => {
    if (!id) return;
    setInlineError(null);
    try {
      await updateWorkItem(id, { [field]: value || null });
      await reloadWorkItem();
    } catch (err) {
      setInlineError(`Failed to update ${field}`);
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
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  // Compute net cost: total planned budget across all budget lines minus subsidy reductions
  // NOTE: Story 5.9 rework — plannedBudget is now aggregated from budget lines.
  const computeNetCost = (): number | null => {
    const totalPlanned = workItem.budgets.reduce((sum, b) => sum + (b.plannedAmount ?? 0), 0);
    if (workItem.budgets.length === 0) return null;
    let net = totalPlanned;
    for (const subsidy of linkedSubsidies) {
      if (subsidy.reductionType === 'percentage') {
        net -= totalPlanned * (subsidy.reductionValue / 100);
      } else {
        net -= subsidy.reductionValue;
      }
    }
    return net;
  };

  const netCost = computeNetCost();

  // Vendors not yet linked
  const unlinkableVendorIds = new Set(linkedVendors.map((v) => v.id));
  const availableVendors = allVendors.filter((v) => !unlinkableVendorIds.has(v.id));

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
        <button type="button" className={styles.backButton} onClick={() => navigate('/work-items')}>
          ← Back to Work Items
        </button>

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
              <option value="blocked">Blocked</option>
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

          {/* Dates and Duration */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Schedule</h2>
            <div className={styles.propertyGrid}>
              <div className={styles.property}>
                <label className={styles.propertyLabel}>Start Date</label>
                <input
                  type="date"
                  className={styles.propertyInput}
                  value={workItem.startDate || ''}
                  onChange={(e) => handleDateChange('startDate', e.target.value)}
                />
              </div>

              <div className={styles.property}>
                <label className={styles.propertyLabel}>End Date</label>
                <input
                  type="date"
                  className={styles.propertyInput}
                  value={workItem.endDate || ''}
                  onChange={(e) => handleDateChange('endDate', e.target.value)}
                />
              </div>

              <div className={styles.property}>
                <label className={styles.propertyLabel}>Duration (days)</label>
                <input
                  type="number"
                  className={styles.propertyInput}
                  value={workItem.durationDays ?? ''}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  min="0"
                  placeholder="0"
                />
              </div>
            </div>
          </section>

          {/* Constraints */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Constraints</h2>
            <div className={styles.propertyGrid}>
              <div className={styles.property}>
                <label className={styles.propertyLabel}>Start After</label>
                <input
                  type="date"
                  className={styles.propertyInput}
                  value={workItem.startAfter || ''}
                  onChange={(e) => handleConstraintChange('startAfter', e.target.value)}
                />
              </div>

              <div className={styles.property}>
                <label className={styles.propertyLabel}>Start Before</label>
                <input
                  type="date"
                  className={styles.propertyInput}
                  value={workItem.startBefore || ''}
                  onChange={(e) => handleConstraintChange('startBefore', e.target.value)}
                />
              </div>
            </div>
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

          {/* Budget */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Budget</h2>
              {!isEditingBudget && (
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={startEditingBudget}
                  aria-label="Edit budget fields"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditingBudget ? (
              <div className={styles.budgetEditForm}>
                <div className={styles.propertyGrid}>
                  <div className={styles.property}>
                    <label className={styles.propertyLabel} htmlFor="editPlannedBudget">
                      Planned Budget ($)
                    </label>
                    <input
                      type="number"
                      id="editPlannedBudget"
                      className={styles.propertyInput}
                      value={editedPlannedBudget}
                      onChange={(e) => setEditedPlannedBudget(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>

                  <div className={styles.property}>
                    <label className={styles.propertyLabel} htmlFor="editActualCost">
                      Actual Cost ($)
                    </label>
                    <input
                      type="number"
                      id="editActualCost"
                      className={styles.propertyInput}
                      value={editedActualCost}
                      onChange={(e) => setEditedActualCost(e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>

                  <div className={styles.property}>
                    <label className={styles.propertyLabel} htmlFor="editConfidence">
                      Confidence (0-100%)
                    </label>
                    <input
                      type="number"
                      id="editConfidence"
                      className={styles.propertyInput}
                      value={editedConfidencePercent}
                      onChange={(e) => setEditedConfidencePercent(e.target.value)}
                      min="0"
                      max="100"
                      placeholder="—"
                    />
                  </div>
                </div>

                <div className={styles.propertyGrid}>
                  <div className={styles.property}>
                    <label className={styles.propertyLabel} htmlFor="editBudgetCategory">
                      Budget Category
                    </label>
                    <select
                      id="editBudgetCategory"
                      className={styles.propertySelect}
                      value={editedBudgetCategoryId}
                      onChange={(e) => setEditedBudgetCategoryId(e.target.value)}
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
                    <label className={styles.propertyLabel} htmlFor="editBudgetSource">
                      Budget Source
                    </label>
                    <select
                      id="editBudgetSource"
                      className={styles.propertySelect}
                      value={editedBudgetSourceId}
                      onChange={(e) => setEditedBudgetSourceId(e.target.value)}
                    >
                      <option value="">None</option>
                      {budgetSources.map((src) => (
                        <option key={src.id} value={src.id}>
                          {src.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.budgetEditActions}>
                  <button type="button" onClick={saveBudget} className={styles.saveButton}>
                    Save
                  </button>
                  <button type="button" onClick={cancelBudgetEdit} className={styles.cancelButton}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.budgetDisplay}>
                {/* NOTE: Story 5.9 rework — budget data now lives in budget lines (workItem.budgets).
                    The display below aggregates totals across all budget lines for this work item. */}
                <div className={styles.propertyGrid}>
                  <div className={styles.property}>
                    <span className={styles.propertyLabel}>Planned Budget</span>
                    <span className={styles.budgetValue}>
                      {workItem.budgets.length > 0 ? (
                        formatCurrency(
                          workItem.budgets.reduce((sum, b) => sum + (b.plannedAmount ?? 0), 0),
                        )
                      ) : (
                        <em className={styles.placeholder}>Not set</em>
                      )}
                    </span>
                  </div>

                  <div className={styles.property}>
                    <span className={styles.propertyLabel}>Actual Cost</span>
                    <span className={styles.budgetValue}>
                      {workItem.budgets.length > 0 ? (
                        formatCurrency(
                          workItem.budgets.reduce((sum, b) => sum + (b.actualCost ?? 0), 0),
                        )
                      ) : (
                        <em className={styles.placeholder}>Not set</em>
                      )}
                    </span>
                  </div>

                  <div className={styles.property}>
                    <span className={styles.propertyLabel}>Budget Lines</span>
                    <span className={styles.budgetValue}>
                      {workItem.budgets.length > 0 ? (
                        `${workItem.budgets.length} line${workItem.budgets.length !== 1 ? 's' : ''}`
                      ) : (
                        <em className={styles.placeholder}>None</em>
                      )}
                    </span>
                  </div>
                </div>

                <div className={styles.propertyGrid}>
                  <div className={styles.property}>
                    <span className={styles.propertyLabel}>Budget Category</span>
                    <span className={styles.budgetValue}>
                      {workItem.budgets[0]?.budgetCategory?.name ? (
                        (budgetCategories.find(
                          (c) => c.id === workItem.budgets[0]?.budgetCategory?.id,
                        )?.name ?? <em className={styles.placeholder}>Unknown</em>)
                      ) : (
                        <em className={styles.placeholder}>None</em>
                      )}
                    </span>
                  </div>

                  <div className={styles.property}>
                    <span className={styles.propertyLabel}>Budget Source</span>
                    <span className={styles.budgetValue}>
                      {workItem.budgets[0]?.budgetSource?.name ? (
                        (budgetSources.find((s) => s.id === workItem.budgets[0]?.budgetSource?.id)
                          ?.name ?? <em className={styles.placeholder}>Unknown</em>)
                      ) : (
                        <em className={styles.placeholder}>None</em>
                      )}
                    </span>
                  </div>
                </div>

                {netCost !== null && linkedSubsidies.length > 0 && (
                  <div className={styles.netCostRow}>
                    <span className={styles.netCostLabel}>Net Cost (after subsidies)</span>
                    <span className={styles.netCostValue}>{formatCurrency(netCost)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Linked Vendors */}
            <div className={styles.budgetSubsection}>
              <h3 className={styles.subsectionTitle}>Vendors</h3>

              <div className={styles.linkedList}>
                {linkedVendors.length === 0 && (
                  <div className={styles.emptyState}>No vendors linked</div>
                )}
                {linkedVendors.map((vendor) => (
                  <div key={vendor.id} className={styles.linkedItem}>
                    <div className={styles.linkedItemInfo}>
                      <span className={styles.linkedItemName}>{vendor.name}</span>
                      {vendor.specialty && (
                        <span className={styles.linkedItemMeta}>{vendor.specialty}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className={styles.unlinkButton}
                      onClick={() => handleUnlinkVendor(vendor.id)}
                      aria-label={`Unlink vendor ${vendor.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              {availableVendors.length > 0 && (
                <div className={styles.linkPickerRow}>
                  <select
                    className={styles.linkPickerSelect}
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    aria-label="Select vendor to link"
                  >
                    <option value="">Select vendor...</option>
                    {availableVendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.specialty ? ` — ${v.specialty}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={handleLinkVendor}
                    disabled={!selectedVendorId || isLinkingVendor}
                  >
                    {isLinkingVendor ? 'Linking...' : 'Add Vendor'}
                  </button>
                </div>
              )}
            </div>

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

        {/* Right column: Notes, Subtasks, Dependencies */}
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
                    <span className={styles.noteDate}>
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
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

          {/* Dependencies */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Dependencies</h2>

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
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.timestamps}>
          <div>
            Created by {workItem.createdBy?.displayName || 'Unknown'} on{' '}
            {new Date(workItem.createdAt).toLocaleDateString()}
          </div>
          <div>Last updated {new Date(workItem.updatedAt).toLocaleDateString()}</div>
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
    </div>
  );
}

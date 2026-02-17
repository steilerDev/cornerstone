import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type {
  WorkItemDetail,
  WorkItemStatus,
  TagResponse,
  UserResponse,
  NoteResponse,
  SubtaskResponse,
  DependencyType,
  DependencyResponse,
} from '@cornerstone/shared';
import { getWorkItem, updateWorkItem, deleteWorkItem } from '../../lib/workItemsApi.js';
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
import { TagPicker } from '../../components/TagPicker/TagPicker.js';
import { useAuth } from '../../contexts/AuthContext.js';
import styles from './WorkItemDetailPage.module.css';

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

  const [newDependencyPredecessorId, setNewDependencyPredecessorId] = useState('');
  const [newDependencyType, setNewDependencyType] = useState<DependencyType>('finish_to_start');
  const [isAddingDependency, setIsAddingDependency] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load all data on mount
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [workItemData, notesData, subtasksData, depsData, tagsData, usersData] =
          await Promise.all([
            getWorkItem(id!),
            listNotes(id!),
            listSubtasks(id!),
            getDependencies(id!),
            fetchTags(),
            listUsers(),
          ]);

        setWorkItem(workItemData);
        setNotes(notesData.notes);
        setSubtasks(subtasksData.subtasks);
        setDependencies(depsData);
        setAvailableTags(tagsData.tags);
        setUsers(usersData.users.filter((u) => !u.deactivatedAt));
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
    try {
      await updateWorkItem(id, { title: editedTitle.trim() });
      setIsEditingTitle(false);
      await reloadWorkItem();
    } catch (err) {
      alert('Failed to update title');
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
    try {
      await updateWorkItem(id, { description: editedDescription.trim() || null });
      setIsEditingDescription(false);
      await reloadWorkItem();
    } catch (err) {
      alert('Failed to update description');
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
    try {
      await updateWorkItem(id, { status: newStatus });
      await reloadWorkItem();
    } catch (err) {
      alert('Failed to update status');
      console.error('Failed to update status:', err);
    }
  };

  // Assigned user change
  const handleAssignedUserChange = async (userId: string) => {
    if (!id) return;
    try {
      await updateWorkItem(id, { assignedUserId: userId || null });
      await reloadWorkItem();
    } catch (err) {
      alert('Failed to update assigned user');
      console.error('Failed to update assigned user:', err);
    }
  };

  // Date changes
  const handleDateChange = async (field: 'startDate' | 'endDate', value: string) => {
    if (!id) return;
    try {
      await updateWorkItem(id, { [field]: value || null });
      await reloadWorkItem();
    } catch (err) {
      alert(`Failed to update ${field}`);
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Duration change
  const handleDurationChange = async (value: string) => {
    if (!id) return;
    const duration = value ? Number(value) : null;
    if (duration !== null && (isNaN(duration) || duration < 0)) return;

    try {
      await updateWorkItem(id, { durationDays: duration });
      await reloadWorkItem();
    } catch (err) {
      alert('Failed to update duration');
      console.error('Failed to update duration:', err);
    }
  };

  // Constraint changes
  const handleConstraintChange = async (field: 'startAfter' | 'startBefore', value: string) => {
    if (!id) return;
    try {
      await updateWorkItem(id, { [field]: value || null });
      await reloadWorkItem();
    } catch (err) {
      alert(`Failed to update ${field}`);
      console.error(`Failed to update ${field}:`, err);
    }
  };

  // Tags change
  const handleTagsChange = async (tagIds: string[]) => {
    if (!id) return;
    try {
      await updateWorkItem(id, { tagIds });
      await reloadWorkItem();
    } catch (err) {
      alert('Failed to update tags');
      console.error('Failed to update tags:', err);
    }
  };

  // Notes
  const handleAddNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newNoteContent.trim()) return;

    setIsAddingNote(true);
    try {
      await createNote(id, { content: newNoteContent.trim() });
      setNewNoteContent('');
      await reloadNotes();
    } catch (err) {
      alert('Failed to add note');
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
    try {
      await updateNote(id, noteId, { content: editedNoteContent.trim() });
      setEditingNoteId(null);
      setEditedNoteContent('');
      await reloadNotes();
    } catch (err) {
      alert('Failed to update note');
      console.error('Failed to update note:', err);
    }
  };

  const cancelNoteEdit = () => {
    setEditingNoteId(null);
    setEditedNoteContent('');
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!id || !confirm('Delete this note?')) return;
    try {
      await deleteNote(id, noteId);
      await reloadNotes();
    } catch (err) {
      alert('Failed to delete note');
      console.error('Failed to delete note:', err);
    }
  };

  // Subtasks
  const handleAddSubtask = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newSubtaskTitle.trim()) return;

    setIsAddingSubtask(true);
    try {
      await createSubtask(id, { title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      await reloadSubtasks();
    } catch (err) {
      alert('Failed to add subtask');
      console.error('Failed to add subtask:', err);
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, isCompleted: boolean) => {
    if (!id) return;
    try {
      await updateSubtask(id, subtaskId, { isCompleted });
      await reloadSubtasks();
    } catch (err) {
      alert('Failed to update subtask');
      console.error('Failed to update subtask:', err);
    }
  };

  const startEditingSubtask = (subtask: SubtaskResponse) => {
    setEditingSubtaskId(subtask.id);
    setEditedSubtaskTitle(subtask.title);
  };

  const saveSubtaskEdit = async (subtaskId: string) => {
    if (!id || !editedSubtaskTitle.trim()) return;
    try {
      await updateSubtask(id, subtaskId, { title: editedSubtaskTitle.trim() });
      setEditingSubtaskId(null);
      setEditedSubtaskTitle('');
      await reloadSubtasks();
    } catch (err) {
      alert('Failed to update subtask');
      console.error('Failed to update subtask:', err);
    }
  };

  const cancelSubtaskEdit = () => {
    setEditingSubtaskId(null);
    setEditedSubtaskTitle('');
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!id || !confirm('Delete this subtask?')) return;
    try {
      await deleteSubtask(id, subtaskId);
      await reloadSubtasks();
    } catch (err) {
      alert('Failed to delete subtask');
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

    try {
      await reorderSubtasks(id, { subtaskIds: reordered.map((s) => s.id) });
      await reloadSubtasks();
    } catch (err) {
      alert('Failed to reorder subtasks');
      console.error('Failed to reorder subtasks:', err);
    }
  };

  // Dependencies
  const handleAddDependency = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !newDependencyPredecessorId) return;

    setIsAddingDependency(true);
    try {
      await createDependency(id, {
        predecessorId: newDependencyPredecessorId,
        dependencyType: newDependencyType,
      });
      setNewDependencyPredecessorId('');
      setNewDependencyType('finish_to_start');
      await reloadDependencies();
    } catch (err) {
      alert('Failed to add dependency');
      console.error('Failed to add dependency:', err);
    } finally {
      setIsAddingDependency(false);
    }
  };

  const handleDeleteDependency = async (predecessorId: string) => {
    if (!id || !confirm('Remove this dependency?')) return;
    try {
      await deleteDependency(id, predecessorId);
      await reloadDependencies();
    } catch (err) {
      alert('Failed to remove dependency');
      console.error('Failed to remove dependency:', err);
    }
  };

  // Delete work item
  const handleDeleteWorkItem = async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteWorkItem(id);
      navigate('/work-items');
    } catch (err) {
      alert('Failed to delete work item');
      console.error('Failed to delete work item:', err);
      setIsDeleting(false);
    }
  };

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

  const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
    finish_to_start: 'Finish-to-Start',
    start_to_start: 'Start-to-Start',
    finish_to_finish: 'Finish-to-Finish',
    start_to_finish: 'Start-to-Finish',
  };

  return (
    <div className={styles.container}>
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
            />
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

            <div className={styles.dependenciesSection}>
              <h3 className={styles.dependencySubtitle}>Predecessors (Blocking This)</h3>
              <div className={styles.dependenciesList}>
                {dependencies.predecessors.length === 0 && (
                  <div className={styles.emptyState}>No predecessors</div>
                )}
                {dependencies.predecessors.map((dep) => (
                  <div key={dep.workItem.id} className={styles.dependencyItem}>
                    <Link to={`/work-items/${dep.workItem.id}`} className={styles.dependencyLink}>
                      {dep.workItem.title}
                    </Link>
                    <span className={styles.dependencyType}>
                      {DEPENDENCY_TYPE_LABELS[dep.dependencyType]}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDependency(dep.workItem.id)}
                      className={styles.deleteButton}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <h3 className={styles.dependencySubtitle}>Successors (Blocked By This)</h3>
              <div className={styles.dependenciesList}>
                {dependencies.successors.length === 0 && (
                  <div className={styles.emptyState}>No successors</div>
                )}
                {dependencies.successors.map((dep) => (
                  <div key={dep.workItem.id} className={styles.dependencyItem}>
                    <Link to={`/work-items/${dep.workItem.id}`} className={styles.dependencyLink}>
                      {dep.workItem.title}
                    </Link>
                    <span className={styles.dependencyType}>
                      {DEPENDENCY_TYPE_LABELS[dep.dependencyType]}
                    </span>
                  </div>
                ))}
              </div>

              <form className={styles.addDependencyForm} onSubmit={handleAddDependency}>
                <h3 className={styles.dependencySubtitle}>Add Predecessor</h3>
                <select
                  className={styles.dependencySelect}
                  value={newDependencyPredecessorId}
                  onChange={(e) => setNewDependencyPredecessorId(e.target.value)}
                  disabled={isAddingDependency}
                >
                  <option value="">Select work item...</option>
                  {/* TODO: Load all work items and filter out self */}
                </select>
                <select
                  className={styles.dependencySelect}
                  value={newDependencyType}
                  onChange={(e) => setNewDependencyType(e.target.value as DependencyType)}
                  disabled={isAddingDependency}
                >
                  <option value="finish_to_start">Finish-to-Start</option>
                  <option value="start_to_start">Start-to-Start</option>
                  <option value="finish_to_finish">Finish-to-Finish</option>
                  <option value="start_to_finish">Start-to-Finish</option>
                </select>
                <button
                  type="submit"
                  className={styles.addButton}
                  disabled={!newDependencyPredecessorId || isAddingDependency}
                >
                  {isAddingDependency ? 'Adding...' : 'Add Dependency'}
                </button>
              </form>
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
    </div>
  );
}

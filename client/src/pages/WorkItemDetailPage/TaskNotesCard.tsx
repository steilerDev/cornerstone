import { useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteResponse } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useFormatters } from '../../lib/formatters.js';
import { deleteNote } from '../../lib/notesApi.js';
import { useNoteFormSchema } from '../../objectForms/noteForm.js';
import type { NoteFormMode } from '../../objectForms/noteForm.js';
import { taskActionError } from './taskActionError.js';
import { useRowTriggerRefs } from './useRowTriggerRefs.js';
import styles from './WorkItemDetailPage.module.css';

export interface TaskNotesCardProps {
  readonly workItemId: string;
  /** Newest first. */
  readonly notes: readonly NoteResponse[];
  /** After every successful change: the page refresh. */
  readonly onChanged: () => Promise<void>;
  /** Opens the Add / Edit note dialog (owned by the Overview panel); `opener` gets focus back. */
  readonly onOpenNote: (target: NoteFormMode, opener: RefObject<HTMLElement | null>) => void;
  /** The "Add note" button; the page focuses it after a note was added from the Add menu. */
  readonly addButtonRef: RefObject<HTMLButtonElement | null>;
  /** The last note was deleted: the card hides, so the page moves focus. */
  readonly onEmptied: () => void;
}

/** The notes of a task, newest first; an admin or the author edits and deletes. */
export function TaskNotesCard({
  workItemId,
  notes,
  onChanged,
  onOpenNote,
  addButtonRef,
  onEmptied,
}: TaskNotesCardProps) {
  const { t } = useTranslation('workItems');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const { user } = useAuth();
  const { formatDate } = useFormatters();
  const userText = useUserText();
  const triggerRefFor = useRowTriggerRefs();
  const [deleting, setDeleting] = useState<NoteResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async (target: NoteResponse) => {
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteNote(workItemId, target.id);
    } catch (err) {
      setDeleteError(taskActionError(err, tErrors, t('taskPage.notes.deleteError')));
      setBusy(false);
      return;
    }
    setBusy(false);
    setDeleting(null);
    // Before the refresh hides the card, so the page's focus effect sees the card disappear.
    if (notes.length === 1) onEmptied();
    await onChanged();
  };

  return (
    <SectionCard id="task-notes" title={t('taskPage.notes.title')} testId="section-task-notes">
      <ul className={styles.list}>
        {notes.map((note) => {
          const date = formatDate(note.createdAt.slice(0, 10));
          const canManage =
            user !== null && (user.role === 'admin' || note.createdBy?.id === user.id);
          return (
            <li key={note.id} className={styles.note} data-testid={`task-note-${note.id}`}>
              <div className={styles.noteHead}>
                <span className={styles.byline}>
                  {t('taskPage.notes.byline', {
                    name: note.createdBy?.displayName ?? t('taskPage.notes.unknownAuthor'),
                    date,
                  })}
                </span>
                {canManage ? (
                  <OverflowMenu
                    triggerAriaLabel={t('taskPage.notes.actions', { date })}
                    triggerRef={triggerRefFor(note.id)}
                    usePortal
                    items={[
                      {
                        id: 'edit',
                        label: t('taskPage.notes.edit'),
                        onClick: () => onOpenNote({ mode: 'edit', note }, triggerRefFor(note.id)),
                      },
                      {
                        id: 'delete',
                        label: t('taskPage.notes.delete'),
                        variant: 'destructive',
                        onClick: () => {
                          setDeleteError(null);
                          setDeleting(note);
                        },
                      },
                    ]}
                  />
                ) : null}
              </div>
              <p {...userText(styles.noteBody)}>{note.content}</p>
            </li>
          );
        })}
      </ul>
      <div className={styles.cardActions}>
        <button
          type="button"
          className={styles.compactButton}
          data-testid="task-notes-add"
          ref={addButtonRef}
          onClick={() => onOpenNote({ mode: 'create' }, addButtonRef)}
        >
          {t('taskPage.notes.add')}
        </button>
      </div>
      {deleting ? (
        <ConfirmDialog
          title={t('taskPage.notes.deleteTitle')}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={busy}
          error={deleteError}
          onConfirm={() => void confirmDelete(deleting)}
          onCancel={() => setDeleting(null)}
          returnFocusRef={addButtonRef}
          testIdPrefix="note-delete"
        />
      ) : null}
    </SectionCard>
  );
}

export interface NoteDialogProps {
  readonly workItemId: string;
  readonly target: NoteFormMode;
  /** After a successful request: the page refresh. */
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
  /** The button that opened the dialog; Cancel and Save return focus to it. */
  readonly openerRef: RefObject<HTMLElement | null>;
}

/** The Add / Edit note dialog; mount it only while open. */
export function NoteDialog({ workItemId, target, onSaved, onClose, openerRef }: NoteDialogProps) {
  const schema = useNoteFormSchema({ ...target, workItemId, onSaved });
  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={openerRef}
      testId="note-form"
    />
  );
}

export default TaskNotesCard;

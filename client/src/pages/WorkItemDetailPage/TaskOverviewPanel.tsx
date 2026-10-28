import { useEffect, useRef, useState } from 'react';
import type { Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { NoteResponse, UserResponse } from '@cornerstone/shared';
import { FormError } from '../../components/FormError/FormError.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import type { OverflowMenuItem } from '../../components/OverflowMenu/OverflowMenu.js';
import { SectionCardScope } from '../../components/SectionCard/index.js';
import type { SectionCardController } from '../../components/SectionCard/index.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';
import { listNotes } from '../../lib/notesApi.js';
import { listUsers } from '../../lib/usersApi.js';
import type { NoteFormMode } from '../../objectForms/noteForm.js';
import { TaskChecklistCard } from './TaskChecklistCard.js';
import { TaskDetailCards } from './TaskDetailCards.js';
import { NoteDialog, TaskNotesCard } from './TaskNotesCard.js';
import type { TaskPanelProps } from './taskPageTypes.js';
import styles from './WorkItemDetailPage.module.css';

export interface TaskOverviewPanelProps extends TaskPanelProps {
  readonly detailsCardRef: Ref<SectionCardController>;
  readonly whoWhereCardRef: Ref<SectionCardController>;
}

/** The notes of the task, newest first; they load on mount and again on every page refresh. */
function useTaskNotes(taskId: string, revision: number) {
  const [notes, setNotes] = useState<NoteResponse[] | null>(null);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await listNotes(taskId);
        if (cancelled) return;
        setNotes([...response.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setFailure(null);
      } catch (err) {
        if (!cancelled) setFailure(toFetchFailure(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, revision, attempt]);

  const retry = () => {
    setFailure(null);
    setAttempt((value) => value + 1);
  };
  return { notes, failure, retry };
}

/** The Overview tab: Details, Who and where, and the Checklist and Notes cards when they exist. */
export function TaskOverviewPanel({
  task,
  revision,
  refresh,
  headingRef,
  detailsCardRef,
  whoWhereCardRef,
}: TaskOverviewPanelProps) {
  const { t } = useTranslation('workItems');
  const { t: tErrors } = useTranslation('errors');
  const { notes, failure, retry } = useTaskNotes(task.id, revision);
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [usersFailure, setUsersFailure] = useState<FetchFailure | null>(null);
  const [usersAttempt, setUsersAttempt] = useState(0);
  const [forceChecklist, setForceChecklist] = useState(false);
  const [noteDialog, setNoteDialog] = useState<{
    readonly target: NoteFormMode;
    readonly opener: RefObject<HTMLElement | null>;
    /** Opened from the Add menu, whose trigger may be gone once the note shows. */
    readonly fromAddMenu: boolean;
  } | null>(null);
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addNoteButtonRef = useRef<HTMLButtonElement>(null);
  const focusNotesRef = useRef(false);
  const focusAddInputRef = useRef(false);
  const emptiedRef = useRef<'checklist' | 'notes' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listUsers()
      .then((response) => {
        if (cancelled) return;
        setUsers(response.users.filter((user) => !user.deactivatedAt));
        setUsersFailure(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setUsersFailure(toFetchFailure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [usersAttempt]);

  const showChecklist = task.subtasks.length > 0 || forceChecklist;
  const shownNotes = notes !== null && notes.length > 0 ? notes : null;
  const showNotes = shownNotes !== null;

  // After Add > Checklist item shows the empty card: focus its add field.
  useEffect(() => {
    if (showChecklist && focusAddInputRef.current) {
      focusAddInputRef.current = false;
      addInputRef.current!.focus();
    }
  }, [showChecklist]);

  // A note was added from the Add menu and its card now shows: focus "Add note".
  useEffect(() => {
    if (showNotes && focusNotesRef.current) {
      focusNotesRef.current = false;
      addNoteButtonRef.current!.focus();
    }
  }, [showNotes]);

  // The last checklist item or note was deleted and its card is gone: focus the Add menu.
  useEffect(() => {
    const emptied = emptiedRef.current;
    if ((emptied === 'checklist' && !showChecklist) || (emptied === 'notes' && !showNotes)) {
      emptiedRef.current = null;
      (addTriggerRef.current ?? headingRef.current)!.focus();
    }
  }, [showChecklist, showNotes, headingRef]);

  const addItems: OverflowMenuItem[] = [];
  if (!showChecklist) {
    addItems.push({
      id: 'checklist',
      label: t('taskPage.overview.addChecklistItem'),
      onClick: () => {
        focusAddInputRef.current = true;
        setForceChecklist(true);
      },
    });
  }
  if (!showNotes) {
    addItems.push({
      id: 'note',
      label: t('taskPage.overview.addNote'),
      onClick: () =>
        setNoteDialog({ target: { mode: 'create' }, opener: addTriggerRef, fromAddMenu: true }),
    });
  }

  return (
    <SectionCardScope>
      <div className={styles.panel}>
        <TaskDetailCards
          task={task}
          users={users}
          usersFailure={usersFailure}
          onRetryUsers={() => {
            setUsersFailure(null);
            setUsersAttempt((value) => value + 1);
          }}
          onSaved={refresh}
          detailsCardRef={detailsCardRef}
          whoWhereCardRef={whoWhereCardRef}
        />
        {notes !== null && addItems.length > 0 ? (
          <div className={styles.addRow}>
            <OverflowMenu
              items={addItems}
              triggerAriaLabel={t('taskPage.overview.addMenu')}
              triggerRef={addTriggerRef}
              placement="bottom-start"
              data-testid="task-add-menu"
              renderTrigger={(props) => (
                <button {...props} className={styles.compactButton}>
                  {t('taskPage.overview.add')} <span aria-hidden="true">▾</span>
                </button>
              )}
            />
          </div>
        ) : null}
        {showChecklist ? (
          <TaskChecklistCard
            workItemId={task.id}
            items={task.subtasks}
            onChanged={refresh}
            addInputRef={addInputRef}
            onEmptied={() => {
              setForceChecklist(false);
              emptiedRef.current = 'checklist';
            }}
          />
        ) : null}
        {shownNotes ? (
          <TaskNotesCard
            workItemId={task.id}
            notes={shownNotes}
            onChanged={refresh}
            addButtonRef={addNoteButtonRef}
            onOpenNote={(target, opener) => setNoteDialog({ target, opener, fromAddMenu: false })}
            onEmptied={() => {
              emptiedRef.current = 'notes';
            }}
          />
        ) : null}
        {failure ? (
          <div className={styles.errorActions}>
            <FormError
              message={fetchFailureMessage(failure, tErrors, t('taskPage.notes.loadError'))}
            />
            <button type="button" className={styles.compactButton} onClick={retry}>
              {t('taskPage.retry')}
            </button>
          </div>
        ) : null}
        {noteDialog ? (
          <NoteDialog
            workItemId={task.id}
            target={noteDialog.target}
            onSaved={async () => {
              if (noteDialog.fromAddMenu) focusNotesRef.current = true;
              await refresh();
            }}
            onClose={() => setNoteDialog(null)}
            openerRef={noteDialog.opener}
          />
        ) : null}
      </div>
    </SectionCardScope>
  );
}

export default TaskOverviewPanel;

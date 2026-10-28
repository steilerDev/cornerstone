import { useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubtaskResponse } from '@cornerstone/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../../components/FormError/FormError.js';
import { ObjectForm } from '../../components/ObjectForm/ObjectForm.js';
import { OverflowMenu } from '../../components/OverflowMenu/OverflowMenu.js';
import { SectionCard } from '../../components/SectionCard/SectionCard.js';
import { useUserText } from '../../hooks/useUserText.js';
import {
  createSubtask,
  deleteSubtask,
  reorderSubtasks,
  updateSubtask,
} from '../../lib/subtasksApi.js';
import { useChecklistItemFormSchema } from '../../objectForms/checklistItemForm.js';
import { taskActionError } from './taskActionError.js';
import { useRowTriggerRefs } from './useRowTriggerRefs.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './WorkItemDetailPage.module.css';

const ITEM_MAX = 500;

export interface TaskChecklistCardProps {
  readonly workItemId: string;
  readonly items: readonly SubtaskResponse[];
  /** After every successful change: the page refresh. */
  readonly onChanged: () => Promise<void>;
  /** The add field; the Add menu focuses it when it shows an empty card. */
  readonly addInputRef: RefObject<HTMLInputElement | null>;
  /** The last item was deleted: the card hides, so the page moves focus. */
  readonly onEmptied: () => void;
}

/** The checklist of a task (its subtasks): check, rename, reorder, delete, add. */
export function TaskChecklistCard({
  workItemId,
  items,
  onChanged,
  addInputRef,
  onEmptied,
}: TaskChecklistCardProps) {
  const { t } = useTranslation('workItems');
  const { t: tc } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const userText = useUserText();
  const triggerRefFor = useRowTriggerRefs();
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<SubtaskResponse | null>(null);
  const [deleting, setDeleting] = useState<SubtaskResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const announceFrameRef = useRef(0);

  // One always-mounted polite region. Clearing first makes a repeated message read again.
  const announce = (message: string) => {
    window.cancelAnimationFrame(announceFrameRef.current);
    setAnnouncement('');
    announceFrameRef.current = window.requestAnimationFrame(() => setAnnouncement(message));
  };
  useEffect(() => () => window.cancelAnimationFrame(announceFrameRef.current), []);

  const run = async (action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(taskActionError(err, tErrors, fallback));
      return false;
    }
    await onChanged();
    return true;
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const added = await run(
      () => createSubtask(workItemId, { title }),
      t('taskPage.checklist.addError'),
    );
    if (added) {
      setNewTitle('');
      addInputRef.current?.focus();
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const { title } = items[index]!;
    const ids = items.map((item) => item.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + by, 0, moved!);
    void run(
      () => reorderSubtasks(workItemId, { subtaskIds: ids }),
      t('taskPage.checklist.updateError'),
    ).then((ok) => {
      if (!ok) return;
      announce(
        t('taskPage.checklist.position', {
          title,
          position: index + by + 1,
          count: items.length,
        }),
      );
    });
  };

  const confirmDelete = async (target: SubtaskResponse) => {
    setBusy(true);
    setDeleteError(null);
    try {
      await deleteSubtask(workItemId, target.id);
    } catch (err) {
      setDeleteError(taskActionError(err, tErrors, t('taskPage.checklist.deleteError')));
      setBusy(false);
      return;
    }
    setBusy(false);
    setDeleting(null);
    // Before the refresh hides the card, so the page's focus effect sees the card disappear.
    if (items.length === 1) onEmptied();
    await onChanged();
  };

  return (
    <SectionCard
      id="task-checklist"
      title={t('taskPage.checklist.title')}
      testId="section-task-checklist"
    >
      <FormError message={error} />
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className={styles.listRow}
            data-testid={`task-checklist-item-${item.id}`}
          >
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={item.isCompleted}
                onChange={(event) =>
                  void run(
                    () => updateSubtask(workItemId, item.id, { isCompleted: event.target.checked }),
                    t('taskPage.checklist.updateError'),
                  )
                }
              />
              <span
                {...userText(
                  item.isCompleted ? `${styles.checkTitle} ${styles.checkDone}` : styles.checkTitle,
                )}
              >
                {item.title}
              </span>
            </label>
            <OverflowMenu
              triggerAriaLabel={t('taskPage.checklist.actions', { title: item.title })}
              triggerRef={triggerRefFor(item.id)}
              usePortal
              items={[
                {
                  id: 'rename',
                  label: t('taskPage.checklist.rename'),
                  onClick: () => setRenaming(item),
                },
                {
                  id: 'move-up',
                  label: t('taskPage.checklist.moveUp'),
                  onClick: () => move(index, -1),
                  ariaDisabled: index === 0,
                },
                {
                  id: 'move-down',
                  label: t('taskPage.checklist.moveDown'),
                  onClick: () => move(index, 1),
                  ariaDisabled: index === items.length - 1,
                },
                {
                  id: 'delete',
                  label: t('taskPage.checklist.delete'),
                  variant: 'destructive',
                  onClick: () => {
                    setDeleteError(null);
                    setDeleting(item);
                  },
                },
              ]}
            />
          </li>
        ))}
      </ul>
      <form className={styles.addForm} onSubmit={(event) => void add(event)}>
        <input
          ref={addInputRef}
          className={styles.addInput}
          value={newTitle}
          maxLength={ITEM_MAX}
          placeholder={t('taskPage.checklist.newItem')}
          aria-label={t('taskPage.checklist.newItem')}
          onChange={(event) => setNewTitle(event.target.value)}
          data-testid="task-checklist-add-input"
        />
        <button type="submit" className={styles.compactButton} data-testid="task-checklist-add">
          {t('taskPage.checklist.add')}
        </button>
      </form>
      <div role="status" className={sharedStyles.srOnly} data-testid="task-checklist-status">
        {announcement}
      </div>
      {renaming ? (
        <RenameDialog
          workItemId={workItemId}
          item={renaming}
          onSaved={onChanged}
          onClose={() => setRenaming(null)}
          openerRef={triggerRefFor(renaming.id)}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={tc('confirmDialog.deleteTitle', { name: deleting.title })}
          irreversible
          confirmLabel={tc('button.delete')}
          busyLabel={tc('confirmDialog.deleting')}
          busy={busy}
          error={deleteError}
          onConfirm={() => void confirmDelete(deleting)}
          onCancel={() => setDeleting(null)}
          returnFocusRef={addInputRef}
          testIdPrefix="subtask-delete"
        />
      ) : null}
    </SectionCard>
  );
}

function RenameDialog({
  workItemId,
  item,
  onSaved,
  onClose,
  openerRef,
}: {
  readonly workItemId: string;
  readonly item: SubtaskResponse;
  readonly onSaved: () => Promise<unknown>;
  readonly onClose: () => void;
  readonly openerRef: RefObject<HTMLElement | null>;
}) {
  const schema = useChecklistItemFormSchema({ workItemId, item, onSaved });
  return (
    <ObjectForm
      schema={schema}
      onCreated={onClose}
      onCancel={onClose}
      returnFocusRef={openerRef}
      testId="checklist-item-form"
    />
  );
}

export default TaskChecklistCard;

import { use, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../FormError/FormError.js';
import { isEscapeHandled, markEscapeHandled } from '../Modal/useFocusTrap.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import { isApplePlatform } from '../../lib/platform.js';
import sharedStyles from '../../styles/shared.module.css';
import { SectionCardScopeContext } from './SectionCardScope.js';
import type { SectionCardHandle } from './SectionCardScope.js';
import styles from './SectionCard.module.css';

export interface SectionCardEdit {
  /** Edit-mode fields; attach `firstFieldRef` to the first field (or the SearchPicker input). */
  readonly renderFields: (ctx: {
    readonly firstFieldRef: RefObject<HTMLElement | null>;
  }) => ReactNode;
  readonly dirty: boolean;
  /** Called when Edit opens the card (seed the draft). */
  readonly onStart?: () => void;
  /** Resolve true when saved; false keeps edit mode (show `error`). Never throws to the card. */
  readonly onSave: () => Promise<boolean>;
  /** Reset the draft (Cancel, Esc, Discard). */
  readonly onDiscard: () => void;
  /** Banner (FormError) at the top of the body. */
  readonly error?: string | null;
}

export interface SectionCardProps {
  /** Heading id is `${id}-title`; test ids are `section-${id}-…`. */
  readonly id: string;
  readonly title: string;
  /** Read-mode body. */
  readonly children: ReactNode;
  /** Omitted: no Edit button. */
  readonly edit?: SectionCardEdit;
  readonly loading?: boolean;
  readonly testId?: string;
}

type PendingFocus = 'edit' | 'field' | 'save' | null;

/**
 * A titled card with read and edit modes: one Edit button, then a form with Cancel and Save.
 * Enter saves from a single-line field, Ctrl/⌘+Enter from a textarea, Esc cancels (a dirty card
 * asks "Discard changes?"). Wrap a page's cards in `SectionCardScope` so only one is in edit
 * mode at a time. Save is the one primary button of the card; it is aria-disabled (never native
 * `disabled`) while there is nothing to save or a save runs.
 */
export function SectionCard({
  id,
  title,
  children,
  edit,
  loading = false,
  testId,
}: SectionCardProps) {
  const { t } = useTranslation('common');
  const scope = use(SectionCardScopeContext);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  // takeover: set when a neighbouring card asked this one to close; it takes focus itself.
  const [confirm, setConfirm] = useState<{ readonly takeover: (() => void) | null } | null>(null);
  const [hasTextarea, setHasTextarea] = useState(false);
  const [ownStatus, setOwnStatus] = useState('');
  const firstFieldRef = useRef<HTMLElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // The save hint ("Ctrl+Enter to save") shows only when the form has a textarea.
  const setForm = useCallback((el: HTMLFormElement | null) => {
    formRef.current = el;
    setHasTextarea(el?.querySelector('textarea') != null);
  }, []);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const editRef = useRef(edit);
  editRef.current = edit;
  const titleId = `${id}-title`;
  const cardTestId = testId ?? `section-${id}`;
  const dirty = editing && (edit?.dirty ?? false);

  const focusField = () => {
    // The form always holds Cancel and Save, so the fallback query finds something.
    const field =
      firstFieldRef.current ??
      formRef.current!.querySelector<HTMLElement>('input, select, textarea, button')!;
    field.focus();
  };

  // Focus moves after the commit that changed the mode / closed the discard dialog.
  useLayoutEffect(() => {
    if (confirm) return;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    // 'edit' is set while the card is editable; 'save' only while it is in edit mode.
    if (target === 'edit') editButtonRef.current?.focus();
    else if (target === 'field') focusField();
    else if (target === 'save') saveRef.current!.focus();
  }, [editing, confirm, busy]);

  // Leaving edit mode (or unmounting) frees the scope for the next card.
  useEffect(() => {
    if (!editing) return undefined;
    return () => scope?.release(id);
  }, [editing, scope, id]);

  // Unsaved changes survive an in-app tab switch, not a page unload.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const handle: SectionCardHandle = {
    isDirty: () => editRef.current!.dirty,
    closeClean: () => {
      editRef.current!.onDiscard();
      setEditing(false);
    },
    confirmDiscard: (onDiscarded) => setConfirm({ takeover: onDiscarded }),
  };

  const begin = () => {
    editRef.current!.onStart?.();
    pendingFocusRef.current = 'field';
    setEditing(true);
  };

  const startEdit = () => {
    // Edit is only rendered for a card with `edit` that is not editing.
    if (!scope) {
      begin();
      return;
    }
    scope.requestEdit(id, handle, begin);
  };

  const closeToRead = () => {
    pendingFocusRef.current = 'edit';
    setEditing(false);
  };

  const cancel = () => {
    if (busy) return;
    if (!edit!.dirty) {
      edit!.onDiscard();
      closeToRead();
      return;
    }
    setConfirm({ takeover: null });
  };

  const discard = () => {
    const pending = confirm!;
    setConfirm(null);
    edit!.onDiscard();
    if (pending.takeover) {
      setEditing(false);
      pending.takeover();
    } else {
      closeToRead();
    }
  };

  const keepEditing = () => {
    pendingFocusRef.current = 'field';
    setConfirm(null);
  };

  const announce = (message: string) => {
    if (scope) scope.announce(message);
    else setOwnStatus(message);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = edit!;
    if (!current.dirty || busy) return;
    setBusy(true);
    const saved = await current.onSave().catch(() => false);
    setBusy(false);
    if (saved) {
      closeToRead();
      announce(t('sectionCard.saved', { section: title }));
    } else {
      // Stay in edit mode with focus on Save, also when Enter / Ctrl+Enter in a field saved.
      pendingFocusRef.current = 'save';
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      if (event.defaultPrevented || isEscapeHandled(event.nativeEvent) || busy) return;
      // Portaled popovers bubble through the React tree; only keys from inside the form count.
      if (!formRef.current!.contains(event.target as Node)) return;
      event.preventDefault();
      markEscapeHandled(event.nativeEvent);
      cancel();
      return;
    }
    if (
      event.key === 'Enter' &&
      (event.ctrlKey || event.metaKey) &&
      event.target instanceof HTMLTextAreaElement
    ) {
      event.preventDefault();
      formRef.current!.requestSubmit();
    }
  };

  const saveDisabled = !edit?.dirty || busy;

  return (
    <section
      className={editing ? `${styles.card} ${styles.cardEditing}` : styles.card}
      aria-labelledby={titleId}
      aria-busy={loading ? 'true' : undefined}
      data-testid={cardTestId}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {edit && !editing && !loading && (
          <button
            ref={editButtonRef}
            type="button"
            className={styles.edit}
            aria-label={t('sectionCard.editSection', { section: title })}
            onClick={startEdit}
            data-testid={`${cardTestId}-edit`}
          >
            {t('button.edit')}
          </button>
        )}
      </div>
      {loading ? (
        <Skeleton lines={3} />
      ) : editing && edit ? (
        <form
          ref={setForm}
          noValidate
          className={styles.form}
          onSubmit={(event) => void submit(event)}
          onKeyDown={onKeyDown}
          data-testid={`${cardTestId}-form`}
        >
          <div className={styles.body}>
            <FormError message={edit.error} />
            {edit.renderFields({ firstFieldRef })}
          </div>
          <div className={styles.footer}>
            {hasTextarea && (
              <span className={styles.hint}>
                {t(isApplePlatform() ? 'sectionCard.saveHintMac' : 'sectionCard.saveHint')}
              </span>
            )}
            <button
              type="button"
              className={styles.cancel}
              aria-disabled={busy ? 'true' : undefined}
              onClick={cancel}
              data-testid={`${cardTestId}-cancel`}
            >
              {t('button.cancel')}
            </button>
            <button
              ref={saveRef}
              type="submit"
              className={styles.save}
              aria-disabled={saveDisabled ? 'true' : undefined}
              aria-busy={busy ? 'true' : undefined}
              data-testid={`${cardTestId}-save`}
            >
              {busy ? t('sectionCard.saving') : t('button.save')}
            </button>
          </div>
        </form>
      ) : (
        <div className={styles.body}>{children}</div>
      )}
      {!scope && (
        <div role="status" className={sharedStyles.srOnly}>
          {ownStatus}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title={t('confirmDialog.discardChangesTitle')}
          lead={t('sectionCard.discardLead', { section: title })}
          confirmLabel={t('confirmDialog.discard')}
          busyLabel={t('confirmDialog.discarding')}
          cancelLabel={t('confirmDialog.keepEditing')}
          tone="danger"
          busy={false}
          onConfirm={discard}
          onCancel={keepEditing}
          testIdPrefix={`${cardTestId}-discard`}
        />
      )}
    </section>
  );
}

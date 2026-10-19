import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../FormError/FormError.js';
import { ColorField } from '../ObjectForm/ColorField.js';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import type {
  ReferenceListFields,
  ReferenceListItem,
  ReferenceListLabels,
  ReferenceListValues,
} from './ReferenceList.js';
import styles from './ReferenceListDialog.module.css';

export interface ReferenceListDialogProps {
  readonly mode: 'new' | 'edit';
  /** The row being edited (`mode === 'edit'`); its `name` is the displayed name. */
  readonly item?: ReferenceListItem;
  readonly labels: ReferenceListLabels;
  readonly fields: ReferenceListFields;
  readonly testIdPrefix: string;
  /** `lang` for user-entered text (the language of the household's entries). */
  readonly entriesLanguage?: string;
  /** Resolves when saved (the host then closes the dialog); rejects with the request error. */
  readonly onSubmit: (values: ReferenceListValues | Partial<ReferenceListValues>) => Promise<void>;
  readonly onClose: () => void;
}

/**
 * New / Edit dialog of a ReferenceList: a Modal from 768 px, a bottom Sheet below. Nothing is
 * sent when an edit changed nothing, and only changed fields are sent, so an unchanged built-in
 * (translated) name keeps its translation key.
 */
export function ReferenceListDialog({
  mode,
  item,
  labels,
  fields,
  testIdPrefix,
  entriesLanguage,
  onSubmit,
  onClose,
}: ReferenceListDialogProps) {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const wide = useMediaQuery('(min-width: 768px)');
  const formId = useId();
  const sheetId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const descriptionId = useId();
  const colorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const confirmOpenRef = useRef(false);

  const initialName = mode === 'edit' ? (item?.name ?? '') : '';
  const initialDescription = mode === 'edit' ? (item?.description ?? '') : '';
  const initialColor = mode === 'edit' ? (item?.color ?? null) : null;

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [color, setColor] = useState<string | null>(initialColor);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasDescription = fields.descriptionMaxLength !== undefined;
  const hasColor = fields.color === true;
  const effectiveColor = color;
  const dirty =
    name !== initialName ||
    (hasDescription && description !== initialDescription) ||
    (hasColor && effectiveColor !== initialColor);

  const openConfirm = () => {
    confirmOpenRef.current = true;
    setConfirmOpen(true);
  };
  const closeConfirm = () => {
    confirmOpenRef.current = false;
    setConfirmOpen(false);
  };

  // Cancel, Escape and the backdrop. Both focus traps listen on `document`, so while the discard
  // confirm is open this must ignore the same Escape that the confirm handles.
  const requestClose = () => {
    if (busy || confirmOpenRef.current) return;
    if (dirty) openConfirm();
    else onClose();
  };

  const failWith = (message: string) => {
    setServerError(message);
    nameRef.current?.focus();
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('referenceList.nameRequired'));
      setServerError(null);
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setServerError(null);

    const normalizedDescription = description.trim() || null;
    let payload: ReferenceListValues | Partial<ReferenceListValues>;
    if (mode === 'new') {
      payload = {
        name: trimmed,
        ...(hasDescription ? { description: normalizedDescription } : {}),
        ...(hasColor ? { color: effectiveColor } : {}),
      };
    } else {
      const changes: { name?: string; description?: string | null; color?: string | null } = {};
      if (trimmed !== item?.name) changes.name = trimmed;
      if (hasDescription && normalizedDescription !== (item?.description ?? null)) {
        changes.description = normalizedDescription;
      }
      if (hasColor && effectiveColor !== initialColor) changes.color = effectiveColor;
      if (Object.keys(changes).length === 0) {
        onClose();
        return;
      }
      payload = changes;
    }

    setBusy(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      if (err instanceof ApiClientError) {
        failWith(
          err.error.code === 'CONFLICT'
            ? labels.duplicateName
            : translateApiError(err.error.code, tErrors),
        );
      } else if (err instanceof NetworkError) {
        failWith(t('requestErrors.network'));
      } else {
        failWith(t('requestErrors.unexpected'));
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'new' ? labels.newItem : labels.editItem;
  const invalid = nameError !== null || serverError !== null;

  const body = (
    <form
      id={formId}
      className={styles.form}
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      data-testid={wide ? `${testIdPrefix}-dialog` : undefined}
    >
      {serverError && <FormError message={serverError} />}

      <div className={styles.field}>
        <label htmlFor={nameId} className={styles.label}>
          {t('referenceList.nameLabel')}{' '}
          <span className={styles.required}>{t('objectForm.required')}</span>
        </label>
        <input
          ref={nameRef}
          id={nameId}
          type="text"
          className={styles.input}
          value={name}
          maxLength={fields.nameMaxLength}
          autoComplete="off"
          lang={entriesLanguage}
          aria-required="true"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          onChange={(event) => setName(event.target.value)}
          data-testid={`${testIdPrefix}-name`}
        />
        <FormError id={nameErrorId} variant="field" message={nameError} />
        {mode === 'edit' && item?.translated && (
          <p className={styles.hint}>{t('referenceList.translatedHint')}</p>
        )}
      </div>

      {hasDescription && (
        <div className={styles.field}>
          <label htmlFor={descriptionId} className={styles.label}>
            {t('referenceList.descriptionLabel')}
          </label>
          <textarea
            id={descriptionId}
            className={styles.textarea}
            rows={3}
            value={description}
            maxLength={fields.descriptionMaxLength}
            lang={entriesLanguage}
            onChange={(event) => setDescription(event.target.value)}
            data-testid={`${testIdPrefix}-description`}
          />
        </div>
      )}

      {hasColor && (
        <div className={styles.field}>
          <label htmlFor={colorId} className={styles.label}>
            {t('referenceList.colorLabel')}
          </label>
          <ColorField
            id={colorId}
            value={color}
            onChange={setColor}
            noColorLabel={t('referenceList.noColor')}
            testIdPrefix={testIdPrefix}
          />
        </div>
      )}
    </form>
  );

  const footer = (
    <div className={styles.footer}>
      <button
        type="button"
        className={styles.cancel}
        onClick={requestClose}
        data-testid={`${testIdPrefix}-cancel`}
      >
        {t('button.cancel')}
      </button>
      <button
        type="submit"
        form={formId}
        className={styles.save}
        aria-disabled={busy ? 'true' : undefined}
        data-testid={`${testIdPrefix}-save`}
      >
        {busy ? t('objectForm.saving') : t('button.save')}
      </button>
    </div>
  );

  return (
    <>
      {wide ? (
        <Modal
          title={title}
          onClose={requestClose}
          className={styles.dialog}
          initialFocusRef={nameRef}
          dismissible={!confirmOpen && !busy}
          footer={footer}
        >
          {body}
        </Modal>
      ) : (
        <Sheet
          id={sheetId}
          open
          onClose={requestClose}
          title={title}
          variant="bottom"
          restoreFocusOnUnmount
          footer={footer}
          initialFocusRef={nameRef}
          dismissible={!confirmOpen && !busy}
          testId={`${testIdPrefix}-dialog`}
        >
          {body}
        </Sheet>
      )}
      {confirmOpen && (
        <ConfirmDialog
          title={t('confirmDialog.discardChangesTitle')}
          confirmLabel={t('confirmDialog.discard')}
          busyLabel={t('confirmDialog.discarding')}
          cancelLabel={t('confirmDialog.keepEditing')}
          tone="danger"
          busy={false}
          onConfirm={() => {
            closeConfirm();
            onClose();
          }}
          onCancel={closeConfirm}
          testIdPrefix={`${testIdPrefix}-discard`}
        />
      )}
    </>
  );
}

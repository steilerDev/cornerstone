import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { notifyObjectCreated } from '../../lib/objectCreatedEvents.js';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.js';
import { FormError } from '../FormError/FormError.js';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { ObjectFormField } from './ObjectFormField.js';
import {
  adjustForOptions,
  clearResolvedError,
  firstErrorField,
  hasValue,
  initialFocusName,
  isDirty,
  isMoreField,
  moreIsEmpty,
  resetValues,
  serverFieldErrors,
  startsExpanded,
  startValues,
  visibleFields,
} from './objectFormState.js';
import type {
  ObjectFormChild,
  ObjectFormErrors,
  ObjectFormResult,
  ObjectFormSchema,
  ObjectFormValues,
} from './types.js';
import styles from './ObjectForm.module.css';

/** Modal from this width, a full-screen sheet below. */
export const OBJECT_FORM_MEDIA_QUERY = '(min-width: 768px)';

export interface ObjectFormProps {
  readonly schema: ObjectFormSchema;
  /** Field values to start from (already keyed by field name, see `mapPrefill`). */
  readonly prefill?: ObjectFormValues;
  /** The host navigates to the created object (the dialog then unmounts). */
  readonly onCreated: (result: ObjectFormResult) => void;
  /** The host closes the dialog. */
  readonly onCancel: () => void;
  /** Reports whether the root form has unsaved input. */
  readonly onDirtyChange?: (dirty: boolean) => void;
  /** The user is leaving by browser Back: show the discard confirm. */
  readonly leaveRequested?: boolean;
  /** Keep editing reports false, Discard reports true. */
  readonly onLeaveResolved?: (discard: boolean) => void;
  /** Focus target on close when the opener is gone (the New trigger). */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testId?: string;
}

interface Step {
  /** Null = the root form, whose schema is the live `schema` prop. */
  readonly schema: ObjectFormSchema | null;
  readonly prefill: ObjectFormValues | undefined;
  readonly initial: ObjectFormValues;
  readonly values: ObjectFormValues;
  readonly errors: ObjectFormErrors;
  readonly expanded: boolean;
  readonly addedText: string;
  /** Child steps only: the root form reports through the `onCreated` prop. */
  readonly onCreated?: (result: ObjectFormResult) => void;
  readonly parentField?: string;
}

function makeStep(
  own: ObjectFormSchema | null,
  schema: ObjectFormSchema,
  prefill: ObjectFormValues | undefined,
  extra?: Pick<Step, 'onCreated' | 'parentField'>,
): Step {
  const values = startValues(schema, prefill);
  return {
    schema: own,
    prefill,
    initial: values,
    values,
    errors: {},
    expanded: startsExpanded(schema, prefill),
    addedText: '',
    ...extra,
  };
}

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * Schema-driven create dialog: a `Modal` from 768px, a full-screen `Sheet` below. Essentials
 * first, "More details", Cancel before Save, optional "Add another", a discard confirm, and a
 * child step for create-from-picker. Values live here, above the container, so a resize between
 * the two keeps the input.
 */
export function ObjectForm({
  schema: rootSchema,
  prefill,
  onCreated,
  onCancel,
  onDirtyChange,
  leaveRequested = false,
  onLeaveResolved,
  returnFocusRef,
  testId = 'object-form',
}: ObjectFormProps) {
  const { t } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const wide = useMediaQuery(OBJECT_FORM_MEDIA_QUERY);
  const formId = useId();
  const moreId = useId();
  const sheetId = useId();

  const [steps, setSteps] = useState<Step[]>(() => [makeStep(null, rootSchema, prefill)]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [addAnother, setAddAnother] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const lastFocusedRef = useRef<string | null>(null);
  const skipOpenerRef = useRef(false);
  // The element that was focused when the dialog opened (e.g. the "New" button of the page behind).
  const openerElRef = useRef<HTMLElement | null>(null);
  const confirmReturnRef = useRef<HTMLElement | null>(null);

  const depth = steps.length;
  const root = steps[0]!;
  const top = steps[depth - 1]!;
  const schema = top.schema ?? rootSchema;
  const confirmVisible = confirmOpen || leaveRequested;

  // Latest values for handlers that run after an await or inside a focus trap.
  const schemaRef = useRef(rootSchema);
  schemaRef.current = rootSchema;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const confirmOpenRef = useRef(confirmVisible);
  confirmOpenRef.current = confirmVisible;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  // Select options arrive after mount: clear an unknown pre-filled id, apply "first option".
  const adjusted = adjustForOptions(rootSchema.fields, root.values, root.initial);
  if (adjusted.values !== root.values || adjusted.initial !== root.initial) {
    setSteps((prev) => [{ ...prev[0]!, ...adjusted }, ...prev.slice(1)]);
  }

  const rootDirty = isDirty(root.values, root.initial);
  useEffect(() => {
    onDirtyChangeRef.current?.(rootDirty);
  }, [rootDirty]);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);

  useDocumentTitle(schema.title, { overlay: true });

  const updateTop = useCallback((fn: (step: Step) => Step) => {
    setSteps((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1]!)]);
  }, []);

  useLayoutEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    openerElRef.current = active && active !== document.body ? active : null;
  }, []);
  // Discard returns to the opener while it is still there (the page behind survives the
  // history pop), else to the host's fallback (the New trigger).
  confirmReturnRef.current = openerElRef.current?.isConnected
    ? openerElRef.current
    : (returnFocusRef?.current ?? null);

  // Initial focus (D6): the first empty required field, else the first field. Never the close X.
  // On a container switch the new container's mount focus must land on the field that had focus
  // (captured before the swap, and not overwritten by the mount focus itself).
  const previousWideRef = useRef(wide);
  useLayoutEffect(() => {
    const switched = previousWideRef.current !== wide;
    const restore = switched ? lastFocusedRef.current : null;
    const name = restore ?? initialFocusName(schema.fields, top.values, top.expanded);
    initialFocusRef.current = name ? document.getElementById(name) : null;
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- computed on mount and on a container switch only
  }, [wide]);

  // Safety net after a switch: the remembered field keeps focus (passive: after the new
  // container's own mount focus).
  useEffect(() => {
    if (previousWideRef.current === wide) return;
    previousWideRef.current = wide;
    const name = lastFocusedRef.current;
    if (name) document.getElementById(name)!.focus();
  }, [wide]);

  // Focus requested by a handler (first invalid field, parent field after a child) once the
  // commit that shows it has landed.
  useLayoutEffect(() => {
    const name = pendingFocusRef.current;
    if (!name) return;
    pendingFocusRef.current = null;
    // A field whose input is gone (a picker now showing its selection chip) keeps focus on its
    // first focusable control, e.g. the chip's Clear button.
    const target =
      document.getElementById(name) ??
      document.querySelector<HTMLElement>(
        `[data-field="${name}"] :is(button, input, select, textarea):not(:disabled)`,
      );
    target?.focus();
  });

  useEffect(() => {
    if (banner) bannerRef.current!.scrollIntoView?.({ block: 'nearest' });
  }, [banner]);

  const setValue = (name: string, value: unknown) => {
    updateTop((step) => {
      const current = step.schema ?? schemaRef.current;
      const values = { ...step.values, [name]: value };
      const field = current.fields.find((f) => f.name === name);
      return {
        ...step,
        values,
        errors: clearResolvedError(step.errors, name, current.validate(values)),
        expanded: step.expanded || (field !== undefined && isMoreField(field)),
        addedText: '',
      };
    });
  };

  const setValues = (next: ObjectFormValues, announcement?: string) => {
    updateTop((step) => {
      const current = step.schema ?? schemaRef.current;
      const values = { ...step.values, ...next };
      let errors = step.errors;
      const validated = current.validate(values);
      for (const key of Object.keys(next)) errors = clearResolvedError(errors, key, validated);
      const needsMore = current.fields.some((f) => isMoreField(f) && hasValue(next[f.name]));
      return {
        ...step,
        values,
        errors,
        expanded: step.expanded || needsMore,
        addedText: announcement ?? '',
      };
    });
  };

  const createChild = (child: ObjectFormChild, parentField: string) => {
    setBanner(null);
    setSteps((prev) => [
      ...prev,
      makeStep(child.schema, child.schema, child.prefill, {
        onCreated: child.onCreated,
        parentField,
      }),
    ]);
    const childValues = startValues(child.schema, child.prefill);
    pendingFocusRef.current = initialFocusName(child.schema.fields, childValues, false) ?? null;
  };

  const popStep = () => {
    const parentField = top.parentField;
    setSteps((prev) => prev.slice(0, -1));
    setBanner(null);
    pendingFocusRef.current = parentField!;
  };

  const handleFailure = (error: unknown) => {
    const failed = top;
    if (error instanceof ApiClientError) {
      const code = error.error.code;
      const mappedErrors = schema.mapError?.(code, failed.values, error.error.details) ?? {};
      const mappedNames = Object.keys(mappedErrors).filter(
        (name) => mappedErrors[name] !== undefined,
      );
      if (mappedNames.length > 0) {
        const errors: Record<string, string | undefined> = {};
        for (const name of mappedNames) errors[name] = mappedErrors[name];
        const first = firstErrorField(visibleFields(schema.fields, failed.values), errors);
        const needsMore = visibleFields(schema.fields, failed.values).some(
          (f) => errors[f.name] !== undefined && isMoreField(f),
        );
        updateTop((step) => ({
          ...step,
          errors: { ...failed.errors, ...errors },
          expanded: step.expanded || needsMore,
        }));
        if (first) pendingFocusRef.current = first.name;
        setBanner(null);
      } else if (code === 'VALIDATION_ERROR') {
        const mapped = serverFieldErrors(
          error.error.details,
          schema.fields.map((f) => f.name),
        );
        const errors: Record<string, string> = {};
        for (const name of mapped.fields) errors[name] = t('objectForm.fieldInvalid');
        const first = firstErrorField(visibleFields(schema.fields, failed.values), errors);
        const needsMore = visibleFields(schema.fields, failed.values).some(
          (f) => errors[f.name] !== undefined && isMoreField(f),
        );
        updateTop((step) => ({
          ...step,
          errors: { ...failed.errors, ...errors },
          expanded: step.expanded || needsMore,
        }));
        if (first) pendingFocusRef.current = first.name;
        setBanner(mapped.unmapped ? translateApiError(code, tErrors) : null);
      } else {
        setBanner(translateApiError(code, tErrors));
      }
    } else {
      setBanner(t('objectForm.saveFailed'));
    }
    setBusy(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    const step = top;
    const current = schema;
    const errors = current.validate(step.values);
    const shown = visibleFields(current.fields, step.values);
    const invalid = firstErrorField(shown, errors);
    if (invalid) {
      const needsMore = shown.some((f) => errors[f.name] !== undefined && isMoreField(f));
      updateTop((s) => ({ ...s, errors, expanded: s.expanded || needsMore }));
      pendingFocusRef.current = invalid.name;
      setBanner(null);
      return;
    }
    updateTop((s) => ({ ...s, errors: {} }));
    setBusy(true);
    setBanner(null);
    let result: ObjectFormResult;
    try {
      result = await current.submit(step.values);
    } catch (error) {
      handleFailure(error);
      return;
    }

    if (depth > 1) {
      setBusy(false);
      popStep();
      step.onCreated!(result);
      return;
    }

    notifyObjectCreated(current.id);
    if (addAnother && current.addAnother) {
      const values = resetValues(current, step.prefill, step.values);
      const expanded = step.expanded && !moreIsEmpty(current, values);
      setSteps([
        {
          ...step,
          values,
          initial: values,
          errors: {},
          expanded,
          addedText: current.addedMessage?.(result) ?? '',
        },
      ]);
      pendingFocusRef.current = initialFocusName(current.fields, values, expanded) ?? null;
      setBusy(false);
      return;
    }
    skipOpenerRef.current = true;
    onCreated(result);
  };

  const requestClose = () => {
    if (busyRef.current || confirmOpenRef.current) return;
    const dirty = depth > 1 ? isDirty(top.values, top.initial) : rootDirty;
    if (dirty) {
      setConfirmOpen(true);
      return;
    }
    if (depth > 1) popStep();
    else onCancel();
  };

  const discard = () => {
    setConfirmOpen(false);
    if (leaveRequested) onLeaveResolved?.(true);
    else if (depth > 1) popStep();
    else onCancel();
  };

  const keepEditing = () => {
    setConfirmOpen(false);
    if (leaveRequested) onLeaveResolved?.(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      formRef.current!.requestSubmit();
    }
  };

  const handleFocus = (event: FocusEvent<HTMLFormElement>) => {
    const id = (event.target as HTMLElement).id;
    if (id && schema.fields.some((f) => f.name === id)) lastFocusedRef.current = id;
  };

  const shownFields = visibleFields(schema.fields, top.values);
  const essentials = shownFields.filter((f) => !isMoreField(f));
  const more = shownFields.filter(isMoreField);

  const renderField = (field: (typeof schema.fields)[number]) => (
    <ObjectFormField
      key={field.name}
      field={field}
      value={top.values[field.name]}
      values={top.values}
      error={top.errors[field.name]}
      busy={busy}
      onChange={(value) => setValue(field.name, value)}
      onSetValues={(next, announcement) => {
        if (!busyRef.current) setValues(next, announcement);
      }}
      createChild={(child) => createChild(child, field.name)}
    />
  );

  const parentTitle = depth > 1 ? (steps[depth - 2]!.schema ?? rootSchema).title : null;
  const headerStart =
    parentTitle === null ? undefined : (
      <button
        type="button"
        className={styles.backLink}
        onClick={requestClose}
        data-testid={`${testId}-back`}
      >
        <span aria-hidden="true">‹</span> {t('objectForm.backTo', { title: parentTitle })}
      </button>
    );

  const body = (
    <form
      ref={formRef}
      id={formId}
      noValidate
      className={styles.form}
      onSubmit={(event) => void save(event)}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      data-testid={testId}
    >
      <div role="status" className={styles.status} data-testid={`${testId}-added`}>
        {top.addedText ? (
          <>
            <span aria-hidden="true">✓</span> {top.addedText}
          </>
        ) : null}
      </div>
      {banner && (
        <div ref={bannerRef}>
          <FormError message={banner} />
        </div>
      )}
      <div className={styles.fields}>{essentials.map(renderField)}</div>
      {more.length > 0 && (
        <>
          <button
            type="button"
            className={styles.disclosure}
            aria-expanded={top.expanded}
            aria-controls={moreId}
            onClick={() => updateTop((step) => ({ ...step, expanded: !step.expanded }))}
            data-testid={`${testId}-more`}
          >
            {top.expanded ? t('objectForm.fewerDetails') : t('objectForm.moreDetails')}
            <span
              aria-hidden="true"
              className={cx(styles.chevron, top.expanded && styles.chevronOpen)}
            >
              ▾
            </span>
          </button>
          <div id={moreId} hidden={!top.expanded} className={cx(styles.fields, styles.more)}>
            {more.map(renderField)}
          </div>
        </>
      )}
    </form>
  );

  const footer = (
    <>
      {schema.addAnother && depth === 1 && (
        <label className={styles.addAnother}>
          <input
            type="checkbox"
            checked={addAnother}
            onChange={(event) => setAddAnother(event.target.checked)}
            data-testid={`${testId}-add-another`}
          />
          {t('objectForm.addAnother')}
        </label>
      )}
      <span className={styles.spacer} />
      <button
        type="button"
        className={styles.cancel}
        aria-disabled={busy || undefined}
        onClick={requestClose}
        data-testid={`${testId}-cancel`}
      >
        {t('button.cancel')}
      </button>
      <button
        type="submit"
        form={formId}
        className={styles.save}
        aria-disabled={busy || undefined}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        data-testid={`${testId}-save`}
      >
        {busy ? t('objectForm.saving') : t('button.save')}
      </button>
    </>
  );

  return (
    <>
      {wide ? (
        <Modal
          title={schema.title}
          onClose={requestClose}
          className={styles.dialog}
          footer={footer}
          headerStart={headerStart}
          initialFocusRef={initialFocusRef}
          dismissible={!busy && !confirmVisible}
          returnFocusRef={returnFocusRef}
          skipOpenerRef={skipOpenerRef}
        >
          {body}
        </Modal>
      ) : (
        <Sheet
          id={sheetId}
          open
          variant="fullScreen"
          title={schema.title}
          onClose={requestClose}
          footer={footer}
          headerStart={headerStart}
          initialFocusRef={initialFocusRef}
          dismissible={!busy && !confirmVisible}
          returnFocusRef={returnFocusRef}
          skipOpenerRef={skipOpenerRef}
          restoreFocusOnUnmount
          testId={`${testId}-sheet`}
        >
          {body}
        </Sheet>
      )}
      {confirmVisible && (
        <ConfirmDialog
          title={t('confirmDialog.discardChangesTitle')}
          confirmLabel={t('confirmDialog.discard')}
          busyLabel={t('confirmDialog.discarding')}
          cancelLabel={t('confirmDialog.keepEditing')}
          busy={false}
          returnFocusRef={confirmReturnRef}
          restoreToOpenerOnConfirm={false}
          onConfirm={discard}
          onCancel={keepEditing}
          testIdPrefix={`${testId}-discard`}
        />
      )}
    </>
  );
}

export default ObjectForm;

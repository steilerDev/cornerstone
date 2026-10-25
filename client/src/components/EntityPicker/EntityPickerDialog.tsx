import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useWideDialog } from '../../hooks/useWideDialog.js';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { EntityPicker } from './EntityPicker.js';
import styles from './EntityPicker.module.css';
import type { EntityOption, EntityPickerProps } from './types.js';

export interface EntityPickerDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  /** Called with the picked (or created) option; the dialog then closes itself. */
  readonly onPick: (option: EntityOption) => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testId?: string;
  /** The picker's props; the value is always '' (pick mode). */
  readonly picker: DistributiveOmit<EntityPickerProps, 'value' | 'onChange'>;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * An EntityPicker in a dialog: a Modal from 768px, a bottom Sheet below. Replaces the diary's
 * company dialog and the capture chips' "Other…" dialogs.
 */
export function EntityPickerDialog({
  open,
  title,
  onClose,
  onPick,
  returnFocusRef,
  testId,
  picker,
}: EntityPickerDialogProps) {
  const wide = useWideDialog();
  const sheetId = useId();
  const [creating, setCreating] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputFocusRef = useRef<HTMLElement | null>(null);

  // The Modal focuses its first focusable element (Close) after the picker's own autoFocus, so
  // hand it the picker input as its initial focus target. Layout effects run before it reads it.
  useLayoutEffect(() => {
    inputFocusRef.current = bodyRef.current?.querySelector('input') ?? null;
  }, [open, wide]);

  const body = (
    <div ref={bodyRef} className={styles.dialogBody} data-testid={wide ? testId : undefined}>
      <EntityPicker
        {...(picker as EntityPickerProps)}
        value=""
        onChange={(_value, option) => {
          if (!option) return;
          onPick(option);
          onClose();
        }}
        autoFocus
        onCreatingChange={(next) => {
          setCreating(next);
          picker.onCreatingChange?.(next);
        }}
        inputAriaProps={{ 'aria-label': title, ...picker.inputAriaProps }}
      />
    </div>
  );

  if (wide) {
    if (!open) return null;
    return (
      <Modal
        title={title}
        onClose={onClose}
        dismissible={!creating}
        returnFocusRef={returnFocusRef}
        initialFocusRef={inputFocusRef}
      >
        {body}
      </Modal>
    );
  }

  return (
    <Sheet
      id={sheetId}
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!creating}
      returnFocusRef={returnFocusRef}
      testId={testId}
      restoreFocusOnUnmount
    >
      {open ? body : null}
    </Sheet>
  );
}

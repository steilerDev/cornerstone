import { useId } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Modal } from '../../Modal/Modal.js';
import { Sheet } from '../../Modal/Sheet.js';
import { useWideDialog } from '../../../hooks/useWideDialog.js';
import styles from './TagChips.module.css';

export interface TagPickerDialogProps {
  title: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  testId: string;
  children: ReactNode;
}

/** A small picker dialog: a Modal from 768px, a bottom Sheet below. Mount it only while open. */
export function TagPickerDialog({
  title,
  onClose,
  returnFocusRef,
  testId,
  children,
}: TagPickerDialogProps) {
  const wide = useWideDialog();
  const sheetId = useId();

  if (wide) {
    return (
      <Modal title={title} onClose={onClose} returnFocusRef={returnFocusRef}>
        <div className={styles.pickerBody} data-testid={testId}>
          {children}
        </div>
      </Modal>
    );
  }
  return (
    <Sheet
      id={sheetId}
      open
      onClose={onClose}
      title={title}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId={testId}
    >
      <div className={styles.pickerBody}>{children}</div>
    </Sheet>
  );
}

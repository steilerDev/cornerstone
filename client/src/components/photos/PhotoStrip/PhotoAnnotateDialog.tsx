import { useId } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '@cornerstone/shared';
import { Modal } from '../../Modal/Modal.js';
import { Sheet } from '../../Modal/Sheet.js';
import { PhotoAnnotator } from '../PhotoAnnotator/PhotoAnnotator.js';
import { useWideDialog } from '../../../hooks/useWideDialog.js';
import styles from './PhotoAnnotateDialog.module.css';

export interface PhotoAnnotateDialogProps {
  photo: Pick<Photo, 'id' | 'width' | 'height'>;
  onSaved: (photo: Photo) => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

/**
 * Hosts `PhotoAnnotator` in a full-screen Sheet below 768px and a Modal from 768px. Mount it only
 * while annotating; it stacks above the photo sheet through the shared dialog layers.
 */
export function PhotoAnnotateDialog({
  photo,
  onSaved,
  onClose,
  returnFocusRef,
}: PhotoAnnotateDialogProps) {
  const { t } = useTranslation('photos');
  const wide = useWideDialog();
  const sheetId = useId();

  const content = (
    <div className={styles.container} data-testid="photo-annotate-dialog">
      <PhotoAnnotator photo={photo} onSave={onSaved} onCancel={onClose} />
    </div>
  );

  if (wide) {
    return (
      <Modal
        title={t('sheet.annotateTitle')}
        onClose={onClose}
        className={styles.modal}
        returnFocusRef={returnFocusRef}
      >
        {content}
      </Modal>
    );
  }
  return (
    <Sheet
      id={sheetId}
      open
      variant="fullScreen"
      title={t('sheet.annotateTitle')}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId="photo-annotate-sheet"
    >
      {content}
    </Sheet>
  );
}

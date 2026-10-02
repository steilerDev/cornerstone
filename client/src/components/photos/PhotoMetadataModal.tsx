import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaResponse } from '@cornerstone/shared';
import { Modal } from '../Modal/Modal.js';
import { AreaPicker } from '../AreaPicker/AreaPicker.js';
import { OrientationPicker } from '../OrientationPicker/index.js';
import styles from './PhotoMetadataModal.module.css';
import sharedStyles from '../../styles/shared.module.css';

export interface PhotoMetadataModalProps {
  file: File;
  entityType: string;
  areas: AreaResponse[];
  onSave: (metadata: {
    caption: string | null;
    areaId: string | null;
    orientationId: string | null;
  }) => void;
  onCancel: () => void;
}

export function PhotoMetadataModal({
  file,
  entityType: _entityType,
  areas,
  onSave,
  onCancel,
}: PhotoMetadataModalProps) {
  const { t } = useTranslation(['photoViewer', 'common']);
  const [caption, setCaption] = useState('');
  const [areaId, setAreaId] = useState('');
  const [orientationId, setOrientationId] = useState('');

  // Ref callback with cleanup (React 19): creates the object URL when the <img> attaches and
  // revokes it on detach or when `file` changes. A useMemo + effect-cleanup pair would revoke
  // the memoized URL under StrictMode's effect double-invoke and leave a dead src.
  const previewRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );

  const handleSave = () => {
    onSave({
      caption: caption || null,
      areaId: areaId || null,
      orientationId: orientationId || null,
    });
  };

  return (
    <Modal
      title={t('photoMetadataModal.title')}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            className={`${sharedStyles.btnSecondary} ${styles.footerButton}`}
            onClick={onCancel}
          >
            {t('photoMetadataModal.cancel')}
          </button>
          <button
            type="button"
            className={`${sharedStyles.btnPrimary} ${styles.footerButton}`}
            onClick={handleSave}
          >
            {t('photoMetadataModal.saveAndUpload')}
          </button>
        </>
      }
    >
      <div className={styles.formBody}>
        <div className={styles.photoPreview}>
          <img ref={previewRef} alt={file.name} className={styles.photoPreviewImage} />
        </div>
        {/* Description textarea */}
        <div>
          <label htmlFor="modal-photo-caption" className={styles.fieldLabel}>
            {t('photoMetadataModal.descriptionLabel')}
            <span className={styles.fieldOptional}>{t('common:optional')}</span>
          </label>
          <textarea
            id="modal-photo-caption"
            className={sharedStyles.textarea}
            placeholder={t('photoMetadataModal.descriptionPlaceholder')}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={500}
          />
        </div>

        {/* Area picker */}
        <div>
          <label className={styles.fieldLabel}>{t('photoMetadataModal.areaLabel')}</label>
          <AreaPicker areas={areas} value={areaId} onChange={setAreaId} nullable={true} />
        </div>

        {/* Orientation picker */}
        <div>
          <label className={styles.fieldLabel}>{t('photoMetadataModal.orientationLabel')}</label>
          <OrientationPicker
            value={orientationId}
            onChange={setOrientationId}
            nullable={true}
            emptyHint={t('photoMetadataModal.noOrientationsHint')}
          />
        </div>
      </div>
    </Modal>
  );
}

export default PhotoMetadataModal;

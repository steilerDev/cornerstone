import { useId, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaResponse } from '@cornerstone/shared';
import { Modal } from '../../Modal/Modal.js';
import { Sheet } from '../../Modal/Sheet.js';
import { AreaPicker } from '../../AreaPicker/AreaPicker.js';
import { OrientationPicker } from '../../OrientationPicker/OrientationPicker.js';
import { FormError } from '../../FormError/FormError.js';
import { useWideDialog } from '../../../hooks/useWideDialog.js';
import { ApiClientError, NetworkError } from '../../../lib/apiClient.js';
import { translateApiError } from '../../../lib/errorTranslation.js';
import { updatePhotoTags } from '../../../lib/photoApi.js';
import { TAG_KEEP } from '../../../lib/photoSpots.js';
import type { BulkTagResult } from '../../../photos/photoDialogsContext.js';
import styles from './PhotoBulkTagSheet.module.css';

export interface PhotoBulkTagSheetProps {
  photoIds: string[];
  areas: AreaResponse[];
  onSaved: (result: BulkTagResult) => void;
  onCancel: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  testIdPrefix?: string;
}

/**
 * Sets one area and/or orientation on many photos at once. Both fields default to "Leave as is";
 * a Modal from 768px, a bottom Sheet below. One all-or-nothing request, no partial save.
 */
export function PhotoBulkTagSheet({
  photoIds,
  areas,
  onSaved,
  onCancel,
  returnFocusRef,
  testIdPrefix = 'photo-bulk-tags',
}: PhotoBulkTagSheetProps) {
  const { t } = useTranslation(['photos', 'common']);
  const { t: tErrors } = useTranslation('errors');
  const wide = useWideDialog();
  const sheetId = useId();
  const baseId = useId();
  const areaInputId = `${baseId}-area`;
  const [area, setArea] = useState(TAG_KEEP);
  const [orientation, setOrientation] = useState(TAG_KEEP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The pickers render their input lazily, so the dialog resolves it by id when it opens.
  const initialFocusRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return document.getElementById(areaInputId);
      },
    }),
    [areaInputId],
  );

  const nothingChosen = area === TAG_KEEP && orientation === TAG_KEEP;

  const save = async () => {
    if (busy || nothingChosen) return;
    setBusy(true);
    setError(null);
    const areaId = area === TAG_KEEP ? undefined : area === '' ? null : area;
    const orientationId =
      orientation === TAG_KEEP ? undefined : orientation === '' ? null : orientation;
    try {
      const response = await updatePhotoTags({
        photoIds,
        ...(areaId !== undefined ? { areaId } : {}),
        ...(orientationId !== undefined ? { orientationId } : {}),
      });
      onSaved({
        ...(areaId !== undefined ? { areaId } : {}),
        ...(orientationId !== undefined ? { orientationId } : {}),
        updated: response.updated,
        undo: response.undo,
      });
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : err instanceof NetworkError
            ? t('common:requestErrors.network')
            : t('photos:bulk.error'),
      );
    }
  };

  const title = t('photos:bulk.title', { count: photoIds.length });
  const hintId = `${baseId}-hint`;

  const footer = (
    <div className={styles.footer}>
      <button
        type="button"
        className={styles.cancel}
        onClick={onCancel}
        disabled={busy}
        data-testid={`${testIdPrefix}-cancel`}
      >
        {t('common:button.cancel')}
      </button>
      <button
        type="button"
        className={styles.save}
        onClick={() => void save()}
        disabled={busy || nothingChosen}
        aria-describedby={hintId}
        data-testid={`${testIdPrefix}-save`}
      >
        {busy ? t('photos:bulk.saving') : t('common:button.save')}
      </button>
    </div>
  );

  const body = (
    <div className={styles.body} aria-busy={busy || undefined}>
      <div className={styles.field}>
        <label htmlFor={areaInputId} className={styles.label}>
          {t('photos:bulk.area')}
        </label>
        <AreaPicker
          id={areaInputId}
          areas={areas}
          value={area}
          onChange={setArea}
          disabled={busy}
          specialOptions={[{ id: TAG_KEEP, label: t('photos:bulk.leaveAsIs') }]}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${baseId}-orientation`} className={styles.label}>
          {t('photos:bulk.orientation')}
        </label>
        <OrientationPicker
          id={`${baseId}-orientation`}
          emptyHint={t('photos:tags.noOrientationsHint')}
          value={orientation}
          onChange={setOrientation}
          disabled={busy}
          specialOptions={[
            { id: TAG_KEEP, label: t('photos:bulk.leaveAsIs') },
            { id: '', label: t('photos:spots.noOrientation') },
          ]}
        />
      </div>
      <p id={hintId} className={styles.hint}>
        {t('photos:bulk.hint')}
      </p>
      <FormError message={error} />
    </div>
  );

  if (wide) {
    return (
      <Modal
        title={title}
        onClose={onCancel}
        footer={footer}
        dismissible={!busy}
        initialFocusRef={initialFocusRef}
        returnFocusRef={returnFocusRef}
      >
        {body}
      </Modal>
    );
  }
  return (
    <Sheet
      id={sheetId}
      open
      onClose={onCancel}
      title={title}
      footer={footer}
      dismissible={!busy}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
      testId={testIdPrefix}
    >
      {body}
    </Sheet>
  );
}

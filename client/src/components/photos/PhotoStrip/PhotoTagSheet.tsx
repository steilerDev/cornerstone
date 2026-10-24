import { useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaResponse, OrientationResponse, Photo } from '@cornerstone/shared';
import { Modal } from '../../Modal/Modal.js';
import { Sheet } from '../../Modal/Sheet.js';
import { EntityPicker } from '../../EntityPicker/EntityPicker.js';
import { useWideDialog } from '../../../hooks/useWideDialog.js';
import styles from './PhotoTagSheet.module.css';

export interface PhotoTagSheetPhoto {
  key: string;
  previewUrl: string;
  areaId: string | null;
  orientationId: string | null;
  caption: string | null;
  uploaded: boolean;
  annotated: boolean;
  serverPhoto: Photo | null;
}

export interface PhotoTagSheetProps {
  open: boolean;
  /** Zero-based position of the photo; the title reads "Photo {index + 1} of {total}". */
  index: number;
  total: number;
  photo: PhotoTagSheetPhoto;
  areas: AreaResponse[];
  /** Optional: lets the orientation picker show the name of a pending photo's orientation. */
  orientations?: OrientationResponse[];
  onAreaChange: (id: string | null) => void;
  onOrientationChange: (id: string | null) => void;
  /** On blur, on Done and before stepping to another photo. */
  onCaptionCommit: (caption: string | null) => void;
  /** Opens PhotoAnnotateDialog (the host owns it). */
  onAnnotate: () => void;
  onRemove: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  /** Also the id prefix of the form controls; unique per mount. */
  testIdPrefix?: string;
}

function normalizeCaption(value: string | null): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Per-photo sheet: area, orientation, caption, Annotate and Remove. A bottom Sheet below 768px,
 * a Modal from 768px. Edits apply at once; there is no Save/Cancel pair.
 */
export function PhotoTagSheet({
  open,
  index,
  total,
  photo,
  areas,
  orientations,
  onAreaChange,
  onOrientationChange,
  onCaptionCommit,
  onAnnotate,
  onRemove,
  onPrevious,
  onNext,
  onClose,
  returnFocusRef,
  testIdPrefix = 'photo-sheet',
}: PhotoTagSheetProps) {
  const { t } = useTranslation(['photos', 'photoViewer']);
  const wide = useWideDialog();
  const sheetId = useId();
  const baseId = useId();
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState({ key: photo.key, value: photo.caption ?? '' });
  if (draft.key !== photo.key) {
    setDraft({ key: photo.key, value: photo.caption ?? '' });
  }
  const caption = draft.key === photo.key ? draft.value : (photo.caption ?? '');

  const commitCaption = () => {
    const next = normalizeCaption(caption);
    if (next !== normalizeCaption(photo.caption)) onCaptionCommit(next);
  };

  const withCommit = (action: () => void) => () => {
    commitCaption();
    action();
  };

  const missingDimensions =
    photo.uploaded &&
    photo.serverPhoto !== null &&
    (photo.serverPhoto.width === null || photo.serverPhoto.height === null);
  const annotateBlocked = !photo.uploaded || missingDimensions;
  const annotateReasonId = `${baseId}-annotate-reason`;
  const annotateReason = !photo.uploaded
    ? t('photos:sheet.annotateWait')
    : missingDimensions
      ? t('photoViewer:annotateDisabledMissingDimensions')
      : null;

  const atStart = index <= 0;
  const atEnd = index >= total - 1;
  const title = t('photos:sheet.title', { n: index + 1, total });

  const headerStart = (
    <span className={styles.nav}>
      <button
        type="button"
        className={styles.navButton}
        aria-label={t('photos:sheet.previous')}
        aria-disabled={atStart ? true : undefined}
        onClick={atStart ? undefined : withCommit(onPrevious)}
        data-testid={`${testIdPrefix}-previous`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 4L6 9l5 5" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.navButton}
        aria-label={t('photos:sheet.next')}
        aria-disabled={atEnd ? true : undefined}
        onClick={atEnd ? undefined : withCommit(onNext)}
        data-testid={`${testIdPrefix}-next`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 4l5 5-5 5" />
        </svg>
      </button>
    </span>
  );

  const footer = (
    <button
      type="button"
      className={styles.done}
      onClick={withCommit(onClose)}
      data-testid={`${testIdPrefix}-done`}
    >
      {t('photos:sheet.done')}
    </button>
  );

  const body = (
    <div className={styles.body}>
      <img
        src={photo.previewUrl}
        alt=""
        className={styles.preview}
        data-testid={`${testIdPrefix}-preview`}
      />
      <div className={styles.field}>
        <label htmlFor={`${baseId}-area`} className={styles.label}>
          {t('photos:tags.area')}
        </label>
        <EntityPicker
          kind="area"
          id={`${baseId}-area`}
          areas={areas}
          value={photo.areaId ?? ''}
          onChange={(id) => onAreaChange(id === '' ? null : id)}
          noneLabel={t('photos:sheet.noArea')}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${baseId}-orientation`} className={styles.label}>
          {t('photos:tags.orientation')}
        </label>
        <EntityPicker
          kind="orientation"
          emptyHint={t('photos:tags.noOrientationsHint')}
          id={`${baseId}-orientation`}
          value={photo.orientationId ?? ''}
          selectedLabel={
            photo.serverPhoto?.orientation?.name ??
            orientations?.find((o) => o.id === photo.orientationId)?.name
          }
          onChange={(id) => onOrientationChange(id === '' ? null : id)}
          noneLabel={t('common:aria.noOrientation')}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${baseId}-caption`} className={styles.label}>
          {t('photos:sheet.caption')}
        </label>
        <textarea
          id={`${baseId}-caption`}
          ref={captionRef}
          className={styles.textarea}
          rows={2}
          value={caption}
          onChange={(event) => setDraft({ key: photo.key, value: event.target.value })}
          onBlur={commitCaption}
          data-testid={`${testIdPrefix}-caption`}
        />
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.annotate}
          aria-disabled={annotateBlocked ? true : undefined}
          aria-describedby={annotateReason ? annotateReasonId : undefined}
          onClick={annotateBlocked ? undefined : onAnnotate}
          data-testid={`${testIdPrefix}-annotate`}
        >
          {t('photos:sheet.annotate')}
        </button>
        {annotateReason ? (
          <span id={annotateReasonId} className={styles.hint}>
            {annotateReason}
          </span>
        ) : null}
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          data-testid={`${testIdPrefix}-remove`}
        >
          {t('photos:sheet.removePhoto')}
        </button>
      </div>
    </div>
  );

  if (wide) {
    return open ? (
      <Modal
        title={title}
        onClose={withCommit(onClose)}
        footer={footer}
        headerStart={headerStart}
        initialFocusRef={captionRef}
        returnFocusRef={returnFocusRef}
      >
        {body}
      </Modal>
    ) : null;
  }
  return (
    <Sheet
      id={sheetId}
      open={open}
      onClose={withCommit(onClose)}
      title={title}
      footer={footer}
      headerStart={headerStart}
      initialFocusRef={captionRef}
      returnFocusRef={returnFocusRef}
      testId={testIdPrefix}
    >
      {body}
    </Sheet>
  );
}

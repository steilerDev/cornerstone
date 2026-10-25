import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import type {
  AreaSummary,
  DiaryEntryType,
  OrientationSummary,
  Photo,
  UndoToken,
} from '@cornerstone/shared';
import { useAreas } from '../../hooks/useAreas.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { useFormatters } from '../../lib/formatters.js';
import { updatePhotoDetails } from '../../lib/photoApi.js';
import { areaPathFromList, formatAreaPath } from '../../lib/photoSpots.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { AreaLink } from '../AreaLink/index.js';
import { EntityPicker } from '../EntityPicker/EntityPicker.js';
import { Badge } from '../Badge/Badge.js';
import { FormError } from '../FormError/FormError.js';
import { Skeleton } from '../Skeleton/Skeleton.js';
import styles from './PhotoDetailsPanel.module.css';

export interface PhotoDetailsPanelPhoto {
  id: string;
  caption: string | null;
  areaId: string | null;
  orientationId: string | null;
  orientation: OrientationSummary | null;
}

export interface PhotoDetailsPanelEntry {
  id: string;
  entryType: DiaryEntryType;
  title: string | null;
  entryDate: string;
}

export interface PhotoDetailsSaveResult {
  photo: Photo;
  undo: UndoToken | null;
  tagsChanged: boolean;
  /** "‹area path› · ‹orientation›" of the new tags ("No area" / "No orientation" when cleared). */
  spotLabel: string;
}

export interface PhotoDetailsPanelProps {
  photo: PhotoDetailsPanelPhoto;
  /** Display hint while the area list loads (the spot viewer passes the response's area). */
  area?: AreaSummary | null;
  /** YYYY-MM-DD */
  diaryDate: string | null;
  /** "From diary entry" card; omitted on the entry page. */
  entry?: PhotoDetailsPanelEntry;
  entryLinkState?: OriginState;
  /** Edit tags is aria-disabled with a visible reason. */
  locked?: boolean;
  onSaved: (result: PhotoDetailsSaveResult) => void;
  onEditingChange?: (editing: boolean) => void;
  /** History list slot including its heading. */
  children?: ReactNode;
  editTagsButtonRef?: RefObject<HTMLButtonElement | null>;
  testIdPrefix?: string;
}

interface Draft {
  photoId: string;
  areaId: string;
  orientationId: string;
  caption: string;
}

function draftOf(photo: PhotoDetailsPanelPhoto): Draft {
  return {
    photoId: photo.id,
    areaId: photo.areaId ?? '',
    orientationId: photo.orientationId ?? '',
    caption: photo.caption ?? '',
  };
}

/**
 * The details of one photo on the dark photo surface: diary date, area, orientation, caption,
 * the entry it belongs to, and an Edit tags editor (area, orientation, caption). Shared by the
 * spot viewer and the entry-page photo viewer.
 */
export function PhotoDetailsPanel({
  photo,
  area,
  diaryDate,
  entry,
  entryLinkState,
  locked = false,
  onSaved,
  onEditingChange,
  children,
  editTagsButtonRef,
  testIdPrefix = 'photo-details',
}: PhotoDetailsPanelProps) {
  const { t } = useTranslation(['photos', 'common']);
  const { t: tErrors } = useTranslation('errors');
  const { formatDate } = useFormatters();
  const { diaryType } = useStatusBadgeVariants();
  const { areas, isLoading: areasLoading } = useAreas();
  const baseId = useId();
  const lockedReasonId = `${baseId}-locked`;
  const ownEditRef = useRef<HTMLButtonElement | null>(null);
  const editBtnRef = editTagsButtonRef ?? ownEditRef;
  const rootRef = useRef<HTMLElement | null>(null);
  const pendingFocusRef = useRef(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(photo));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Another photo: leave the editor (adjust state while rendering, no effect)
  if (draft.photoId !== photo.id) {
    setDraft(draftOf(photo));
    setEditing(false);
    setSaving(false);
    setError(null);
    setSaved(false);
  }

  // Tell the host while the editor is open (it ignores its own shortcuts then).
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  const changeEditing = setEditing;

  useLayoutEffect(() => {
    if (editing || !pendingFocusRef.current) return;
    pendingFocusRef.current = false;
    // The editor's focused control is gone (focus is on the body) or still inside the panel;
    // focus that moved elsewhere is left alone.
    const active = document.activeElement;
    if (active && active !== document.body && !rootRef.current!.contains(active)) return;
    editBtnRef.current!.focus();
  }, [editing, editBtnRef]);

  const areaRecord = photo.areaId ? areas.find((a) => a.id === photo.areaId) : undefined;
  const hintArea = area && area.id === photo.areaId ? area : null;
  const areaPath = photo.areaId
    ? (areaPathFromList(areas, photo.areaId) ?? (hintArea ? formatAreaPath(hintArea) : null))
    : null;
  const areaColor = areaRecord?.color ?? hintArea?.color ?? null;
  const caption = photo.caption?.trim() || null;
  const orientationName = photo.orientation?.name ?? null;

  const startEditing = () => {
    if (locked) return;
    setDraft(draftOf(photo));
    setError(null);
    setSaved(false);
    changeEditing(true);
  };

  // The Edit tags button mounts only once editing has ended, so focus moves from the effect
  // below, after that commit, never from the click handler.
  const focusEditButton = () => {
    pendingFocusRef.current = true;
  };

  const cancel = () => {
    setError(null);
    changeEditing(false);
    focusEditButton();
  };

  const save = async () => {
    if (saving) return;
    const nextCaption = draft.caption.trim();
    const changes: {
      caption?: string | null;
      areaId?: string | null;
      orientationId?: string | null;
    } = {};
    if (nextCaption !== (photo.caption ?? ''))
      changes.caption = nextCaption === '' ? null : nextCaption;
    if (draft.areaId !== (photo.areaId ?? ''))
      changes.areaId = draft.areaId === '' ? null : draft.areaId;
    if (draft.orientationId !== (photo.orientationId ?? '')) {
      changes.orientationId = draft.orientationId === '' ? null : draft.orientationId;
    }
    if (Object.keys(changes).length === 0) {
      changeEditing(false);
      focusEditButton();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await updatePhotoDetails(photo.id, changes);
      const tagsChanged = 'areaId' in changes || 'orientationId' in changes;
      const newAreaPath = res.photo.areaId
        ? (areaPathFromList(areas, res.photo.areaId) ?? t('photos:spots.noArea'))
        : t('photos:spots.noArea');
      const spotLabel = `${newAreaPath} · ${res.photo.orientation?.name ?? t('photos:spots.noOrientation')}`;
      setSaving(false);
      setSaved(true);
      changeEditing(false);
      focusEditButton();
      onSaved({ photo: res.photo, undo: res.undo ?? null, tagsChanged, spotLabel });
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiClientError) setError(translateApiError(err.error.code, tErrors));
      else if (err instanceof NetworkError) setError(t('common:requestErrors.network'));
      else setError(t('photos:viewer.tagsError'));
    }
  };

  const onFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    // An open picker consumes Escape first (it prevents the default)
    if (e.key === 'Escape' && !e.defaultPrevented && !saving) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const areaValue =
    areasLoading && photo.areaId && !areaPath ? (
      <Skeleton lines={1} />
    ) : photo.areaId && areaPath ? (
      <span className={styles.areaValue}>
        {areaColor ? (
          // User-chosen area colour is data, not a design value: the one allowed inline style.
          <span
            className={styles.dot}
            aria-hidden="true"
            style={{ '--area-color': areaColor } as CSSProperties}
          />
        ) : null}
        <AreaLink areaId={photo.areaId} tone="onPhoto">
          {areaPath}
        </AreaLink>
      </span>
    ) : (
      <span className={styles.muted}>{t('photos:spots.noArea')}</span>
    );

  const entryTitle = entry?.title?.trim() || t('photos:viewer.untitledEntry');

  return (
    <aside
      className={styles.panel}
      aria-label={t('photos:viewer.detailsLabel')}
      ref={rootRef}
      data-testid={testIdPrefix}
    >
      {diaryDate ? (
        <div className={styles.dateBlock}>
          <span className={styles.label}>{t('photos:viewer.diaryDate')}</span>
          <span className={styles.dateValue} data-testid={`${testIdPrefix}-date`}>
            {formatDate(diaryDate, undefined, 'long')}
          </span>
        </div>
      ) : null}

      <section className={styles.facts}>
        <div className={styles.factsHeading}>
          <h2 className={styles.sectionHeading}>{t('photos:viewer.detailsLabel')}</h2>
          {editing ? null : (
            <button
              type="button"
              ref={editBtnRef}
              className={styles.editButton}
              aria-disabled={locked || undefined}
              aria-describedby={locked ? lockedReasonId : undefined}
              onClick={startEditing}
              data-testid={`${testIdPrefix}-edit-tags`}
            >
              {t('photos:viewer.editTags')}
            </button>
          )}
        </div>
        {locked && !editing ? (
          <p id={lockedReasonId} className={styles.reason}>
            {t('photos:viewer.editTagsDisabledSigned')}
          </p>
        ) : null}

        {editing ? (
          <form
            className={styles.editForm}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            onKeyDown={onFormKeyDown}
            data-testid={`${testIdPrefix}-form`}
          >
            <div className={styles.field}>
              <label htmlFor={`${baseId}-area`} className={styles.fieldLabel}>
                {t('photos:viewer.area')}
              </label>
              <EntityPicker
                kind="area"
                id={`${baseId}-area`}
                areas={areas}
                value={draft.areaId}
                onChange={(id) => setDraft((d) => ({ ...d, areaId: id }))}
                noneLabel={t('photos:spots.noArea')}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${baseId}-orientation`} className={styles.fieldLabel}>
                {t('photos:viewer.orientation')}
              </label>
              <EntityPicker
                kind="orientation"
                id={`${baseId}-orientation`}
                emptyHint={t('photos:tags.noOrientationsHint')}
                value={draft.orientationId}
                onChange={(id) => setDraft((d) => ({ ...d, orientationId: id }))}
                selectedLabel={photo.orientation?.name}
                noneLabel={t('common:aria.noOrientation')}
                disabled={saving}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${baseId}-caption`} className={styles.fieldLabel}>
                {t('photos:viewer.caption')}
              </label>
              <textarea
                id={`${baseId}-caption`}
                className={styles.textarea}
                rows={3}
                value={draft.caption}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                data-testid={`${testIdPrefix}-caption`}
              />
            </div>
            <FormError message={error} />
            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.saveButton}
                disabled={saving}
                aria-busy={saving || undefined}
                data-testid={`${testIdPrefix}-save-tags`}
              >
                {saving ? t('photos:viewer.savingTags') : t('photos:viewer.saveTags')}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={cancel}
                disabled={saving}
                data-testid={`${testIdPrefix}-cancel`}
              >
                {t('common:button.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <dl className={styles.factList}>
            <dt className={styles.factLabel}>{t('photos:viewer.area')}</dt>
            <dd className={styles.factValue} data-testid={`${testIdPrefix}-area`}>
              {areaValue}
            </dd>
            <dt className={styles.factLabel}>{t('photos:viewer.orientation')}</dt>
            <dd className={styles.factValue} data-testid={`${testIdPrefix}-orientation`}>
              {orientationName ?? (
                <span className={styles.muted}>{t('photos:spots.noOrientation')}</span>
              )}
            </dd>
            <dt className={styles.factLabel}>{t('photos:viewer.caption')}</dt>
            <dd className={styles.factValue} data-testid={`${testIdPrefix}-caption-value`}>
              {caption ?? <span className={styles.muted}>{t('photos:viewer.noCaption')}</span>}
            </dd>
          </dl>
        )}
        <div role="status" className={styles.savedNote} data-testid={`${testIdPrefix}-saved`}>
          {saved && !editing ? t('photos:viewer.tagsSaved') : ''}
        </div>
      </section>

      {entry ? (
        <div className={styles.entryCard}>
          <h2 className={styles.cardHeading}>{t('photos:viewer.fromDiaryEntry')}</h2>
          <div className={styles.entryRow}>
            <Badge
              variants={diaryType}
              value={entry.entryType}
              testId={`diary-type-badge-${entry.entryType}`}
            />
            <span className={styles.entryTitle}>{entryTitle}</span>
          </div>
          <span className={styles.entryMeta}>{formatDate(entry.entryDate, undefined, 'long')}</span>
          <NavAnchor
            to={routeUrl('diaryEntry', { id: entry.id })}
            state={entryLinkState}
            className={styles.entryLink}
            data-testid="spot-viewer-diary-link"
          >
            {t('photos:viewer.openDiaryEntry')}
          </NavAnchor>
        </div>
      ) : null}

      {children}
    </aside>
  );
}

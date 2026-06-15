import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo, AreaResponse } from '@cornerstone/shared';
import { updatePhoto } from '../../lib/photoApi.js';
import { fetchAreas } from '../../lib/areasApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { SearchPicker } from '../SearchPicker/index.js';
import { OrientationPicker } from '../OrientationPicker/index.js';
import styles from './PhotoMetadataSidepanel.module.css';

/**
 * PhotoMetadataSidepanel — displays and edits photo metadata (caption, area).
 * On mobile, renders as a bottom sheet with a toggle button.
 * When annotation mode is active, the sidepanel and toggle button are hidden
 * to prevent interaction interference with the annotation canvas.
 */
export interface PhotoMetadataSidepanelProps {
  photo: Photo;
  onPhotoUpdated?: (photo: Photo) => void;
  /** If true, hides the sidepanel and toggle button to avoid pointer event interference during annotation. */
  isAnnotating?: boolean;
}

export function PhotoMetadataSidepanel({
  photo,
  onPhotoUpdated,
  isAnnotating = false,
}: PhotoMetadataSidepanelProps) {
  const { t } = useTranslation('photoViewer');
  const { formatDate } = useFormatters();

  const [caption, setCaption] = useState(photo.caption ?? '');
  const [areaId, setAreaId] = useState(photo.areaId ?? '');
  const [orientationId, setOrientationId] = useState(photo.orientationId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaResponse[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  // Load areas on mount
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- initializing loading and data state from async operation */
    setIsLoadingAreas(true);
    fetchAreas()
      .then((resp) => {
        setAreas(resp.areas || []);
      })
      .catch(() => {
        setAreas([]);
      })
      .finally(() => {
        setIsLoadingAreas(false);
      });
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, []);

  // Reset form when photo changes
  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- resetting form state in response to photo change */
    setCaption(photo.caption ?? '');
    setAreaId(photo.areaId ?? '');
    setOrientationId(photo.orientationId ?? '');
    setError(null);
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, [photo.id, photo.caption, photo.areaId, photo.orientationId]);

  const handleSave = useCallback(async () => {
    setError(null);
    setIsSaving(true);

    try {
      const updated = await updatePhoto(photo.id, {
        caption: caption === '' ? null : caption,
        areaId: areaId === '' ? null : areaId,
        orientationId: orientationId === '' ? null : orientationId,
      });

      onPhotoUpdated?.(updated);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save metadata';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [photo.id, caption, areaId, orientationId, onPhotoUpdated]);

  const searchAreas = useCallback(async (query: string) => {
    return fetchAreas({ search: query }).then((resp) => resp.areas || []);
  }, []);

  // Hide sidepanel entirely when annotation mode is active
  if (isAnnotating) {
    return null;
  }

  const hasChanges =
    caption !== (photo.caption ?? '') ||
    areaId !== (photo.areaId ?? '') ||
    orientationId !== (photo.orientationId ?? '');
  const isDisabled = isSaving || isLoadingAreas;

  const renderAreaItem = (area: AreaResponse) => ({
    id: area.id,
    label: area.name,
  });

  return (
    <>
      {/* Toggle button — visible on mobile only */}
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setIsOpenMobile((v) => !v)}
        aria-expanded={isOpenMobile}
        aria-controls="photo-metadata-sidepanel"
        data-testid="photo-metadata-toggle"
        title={t('metadataToggle')}
        aria-label={t('metadataToggle')}
      >
        <ChevronUpIcon />
      </button>

      {/* Sidepanel */}
      <div
        className={`${styles.sidepanel} ${isOpenMobile ? styles.sidepanelOpen : ''}`}
        aria-label={t('metadataTitle')}
        role="complementary"
        id="photo-metadata-sidepanel"
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{t('metadataTitle')}</h3>
        </div>

        <div className={styles.content}>
          {/* Upload date — read-only */}
          <div className={styles.section}>
            <label className={styles.label}>{t('uploadDate')}</label>
            <div className={styles.dateValue}>{formatDate(photo.createdAt)}</div>
          </div>

          {/* Description */}
          <div className={styles.section}>
            <label htmlFor="photo-caption" className={styles.label}>
              {t('description')}
            </label>
            <textarea
              id="photo-caption"
              className={styles.descriptionTextarea}
              placeholder={t('descriptionPlaceholder')}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={isDisabled}
              rows={4}
            />
          </div>

          {/* Area picker */}
          <div className={styles.section}>
            <label htmlFor="photo-area" className={styles.label}>
              {t('area')}
            </label>
            <div className={styles.areaPicker}>
              <SearchPicker<AreaResponse>
                id="photo-area"
                value={areaId}
                onChange={setAreaId}
                excludeIds={[]}
                disabled={isDisabled}
                placeholder={t('areaPlaceholder')}
                searchFn={searchAreas}
                renderItem={renderAreaItem}
                specialOptions={[{ id: '', label: t('noArea') }]}
                showItemsOnFocus={true}
                initialTitle={
                  areas.find((a) => a.id === areaId)?.name ||
                  (areaId === '' ? t('noArea') : undefined)
                }
              />
            </div>
          </div>

          {/* Orientation picker */}
          <div className={styles.section}>
            <label htmlFor="photo-orientation" className={styles.label}>
              {t('photoViewer:orientation')}
            </label>
            <div className={styles.areaPicker}>
              <OrientationPicker
                id="photo-orientation"
                value={orientationId}
                onChange={setOrientationId}
                disabled={isDisabled}
                nullable={true}
                initialOrientationName={photo.orientation?.name}
              />
            </div>
          </div>

          {/* Error message */}
          {error && <div className={styles.errorMessage}>{error}</div>}

          {/* Save button */}
          {hasChanges && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSave}
                disabled={isDisabled}
                aria-busy={isSaving}
              >
                {isSaving ? t('saving') : t('saveButton')}
              </button>
            </div>
          )}

          {isSaving && <div className={styles.savingIndicator}>{t('saving')}</div>}
        </div>
      </div>
    </>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M18 15l-6-6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

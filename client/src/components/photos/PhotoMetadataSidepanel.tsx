import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo, AreaResponse } from '@cornerstone/shared';
import { updatePhoto } from '../../lib/photoApi.js';
import { fetchAreas } from '../../lib/areasApi.js';
import { useFormatters } from '../../lib/formatters.js';
import { SearchPicker } from '../SearchPicker/index.js';
import styles from './PhotoMetadataSidepanel.module.css';

export interface PhotoMetadataSidepanelProps {
  photo: Photo;
  onPhotoUpdated?: (photo: Photo) => void;
}

export function PhotoMetadataSidepanel({
  photo,
  onPhotoUpdated,
}: PhotoMetadataSidepanelProps) {
  const { t } = useTranslation('photoViewer');
  const { formatDate } = useFormatters();

  const [caption, setCaption] = useState(photo.caption ?? '');
  const [areaId, setAreaId] = useState(photo.areaId ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaResponse[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);

  // Load areas on mount
  useEffect(() => {
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
  }, []);

  // Reset form when photo changes
  useEffect(() => {
    setCaption(photo.caption ?? '');
    setAreaId(photo.areaId ?? '');
    setError(null);
  }, [photo.id, photo.caption, photo.areaId]);

  const handleSave = useCallback(async () => {
    setError(null);
    setIsSaving(true);

    try {
      const updated = await updatePhoto(photo.id, {
        caption: caption === '' ? null : caption,
        areaId: areaId === '' ? null : areaId,
      });

      onPhotoUpdated?.(updated);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save metadata';
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }, [photo.id, caption, areaId, onPhotoUpdated]);

  const hasChanges = caption !== (photo.caption ?? '') || areaId !== (photo.areaId ?? '');
  const isDisabled = isSaving || isLoadingAreas;

  const searchAreas = useCallback(async (query: string) => {
    return fetchAreas({ search: query }).then((resp) => resp.areas || []);
  }, []);

  const renderAreaItem = (area: AreaResponse) => ({
    id: area.id,
    label: area.name,
  });

  return (
    <div
      className={styles.sidepanel}
      aria-label={t('metadataTitle')}
      role="complementary"
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
  );
}

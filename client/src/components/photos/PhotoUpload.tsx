import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '@cornerstone/shared';
import { uploadPhoto } from '../../lib/photoApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import styles from './PhotoUpload.module.css';

export interface PhotoUploadProps {
  entityType: string;
  entityId: string;
  onUpload: (photo: Photo) => void;
  disabled?: boolean;
  onError?: (error: string) => void;
  onUploadingCountChange?: (count: number) => void;
}

type PhotoUploadState = 'queued' | 'uploading' | 'succeeded' | 'failed';

interface PhotoEntry {
  file: File;
  state: PhotoUploadState;
  errorMessage?: string;
}

export function PhotoUpload({
  entityType,
  entityId,
  onUpload,
  disabled,
  onError,
  onUploadingCountChange,
}: PhotoUploadProps) {
  const { t } = useTranslation('diary');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [photoQueue, setPhotoQueue] = useState<PhotoEntry[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const uploadingCountRef = useRef(0);

  useEffect(() => {
    setIsTouchDevice(() => {
      if (typeof window === 'undefined') return false;
      return window.matchMedia('(hover: none)').matches;
    });
  }, []);

  // Notify parent of uploading count changes
  useEffect(() => {
    const uploadingCount = photoQueue.filter(
      (p) => p.state === 'queued' || p.state === 'uploading',
    ).length;
    onUploadingCountChange?.(uploadingCount);
  }, [photoQueue, onUploadingCountChange]);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      void handleFiles(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []);
    if (files.length > 0) {
      void handleFiles(files);
    }
    // Reset input so the same file can be selected again
    e.currentTarget.value = '';
  };

  const uploadSinglePhoto = useCallback(
    async (entry: PhotoEntry) => {
      try {
        uploadingCountRef.current += 1;

        const photo = await uploadPhoto(entityType, entityId, entry.file);
        onUpload(photo);

        // Remove from queue after 2s (user sees success state briefly)
        setPhotoQueue((prev) => prev.filter((p) => p.file !== entry.file));
      } catch (err) {
        let errorMessage = t('photoUpload.unknownError');
        if (err instanceof ApiClientError) {
          errorMessage = err.error.message;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }

        setPhotoQueue((prev) =>
          prev.map((p) =>
            p.file === entry.file ? { ...p, state: 'failed', errorMessage } : p,
          ),
        );

        onError?.(`${entry.file.name}: ${errorMessage}`);
      } finally {
        uploadingCountRef.current -= 1;
      }
    },
    [entityType, entityId, onUpload, onError, t],
  );

  // Flip all queued entries to 'uploading' and kick them off in parallel.
  // No concurrency cap: the browser, server, and reverse proxy each impose
  // their own limits, and the per-photo failure UI gives the user a clear
  // signal if anything goes wrong. A cap was attempted in earlier iterations
  // but kept fighting with React state-update timing; see #1429.
  //
  // Drive the work from a useEffect that observes the queue and atomically
  // transitions queued → uploading + kicks off uploads. Both reads and updates
  // happen after React has committed state, eliminating the race.
  useEffect(() => {
    const queued = photoQueue.filter((p) => p.state === 'queued');
    if (queued.length === 0) return;

    // Atomically flip queued → uploading
    setPhotoQueue((prev) =>
      prev.map((p) => (p.state === 'queued' ? { ...p, state: 'uploading' as const } : p)),
    );

    // Kick off uploads in parallel; they update state on completion
    for (const entry of queued) {
      void uploadSinglePhoto(entry);
    }
  }, [photoQueue, uploadSinglePhoto]);

  const handleFiles = (files: File[]) => {
    setPhotoQueue((prev) => [
      ...prev,
      ...files.map((file) => ({ file, state: 'queued' as const })),
    ]);
  };

  const handleRetry = (entry: PhotoEntry) => {
    setPhotoQueue((prev) =>
      prev.map((p) => (p.file === entry.file ? { ...p, state: 'queued', errorMessage: undefined } : p)),
    );
  };

  const handleRemovePhoto = (entry: PhotoEntry) => {
    setPhotoQueue((prev) => prev.filter((p) => p.file !== entry.file));
  };

  const buttonLabel = isTouchDevice
    ? t('photoUpload.buttonTakePhoto')
    : t('photoUpload.buttonUploadPhotos');

  const isProcessing = photoQueue.some((p) => p.state === 'queued' || p.state === 'uploading');

  return (
    <div className={styles.container}>
      {/* Drag-and-drop zone */}
      <div
        ref={dropZoneRef}
        className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="region"
        aria-label={t('photoUpload.dropZoneAriaLabel')}
        data-testid="photo-upload-zone"
      >
        <div className={styles.dropZoneContent}>
          <p className={styles.dropZoneText}>{t('photoUpload.dropZoneText')}</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isProcessing}
            className={styles.uploadButton}
            aria-label={buttonLabel}
          >
            {isProcessing ? t('photoUpload.uploading') : buttonLabel}
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        capture="environment"
        onChange={handleFileInputChange}
        className={styles.fileInput}
        aria-hidden="true"
        data-testid="photo-file-input"
      />

      {/* Photo queue with per-photo state */}
      {photoQueue.length > 0 && (
        <div className={styles.queueContainer} aria-label={t('photoUpload.queueAriaLabel')}>
          {photoQueue.map((entry, index) => (
            <div key={index} className={`${styles.queueItem} ${styles[`state-${entry.state}`]}`}>
              <div className={styles.queueItemHeader}>
                <span className={styles.queueItemName}>{entry.file.name}</span>
                <span className={styles.queueItemState}>
                  {entry.state === 'queued' && t('photoUpload.stateQueued')}
                  {entry.state === 'uploading' && t('photoUpload.stateUploading')}
                  {entry.state === 'succeeded' && t('photoUpload.stateSucceeded')}
                  {entry.state === 'failed' && t('photoUpload.stateFailed')}
                </span>
              </div>
              {entry.errorMessage && (
                <div className={styles.queueItemError}>{entry.errorMessage}</div>
              )}
              <div className={styles.queueItemActions}>
                {entry.state === 'failed' && (
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => handleRetry(entry)}
                    aria-label={`${t('photoUpload.retryButton')} ${entry.file.name}`}
                  >
                    {t('photoUpload.retryButton')}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => handleRemovePhoto(entry)}
                  aria-label={`Remove ${entry.file.name}`}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

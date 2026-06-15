import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo, AreaResponse } from '@cornerstone/shared';
import { uploadPhoto } from '../../lib/photoApi.js';
import { fetchAreas } from '../../lib/areasApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import PhotoMetadataModal from './PhotoMetadataModal.js';
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
  metadata?: { caption: string | null; areaId: string | null; orientationId: string | null };
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const takePhotoButtonRef = useRef<HTMLButtonElement>(null);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const modalTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [photoQueue, setPhotoQueue] = useState<PhotoEntry[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [modalFileIndex, setModalFileIndex] = useState<number | null>(null);
  const [areas, setAreas] = useState<AreaResponse[]>([]);
  const uploadingCountRef = useRef(0);

  useEffect(() => {
    /* eslint-disable @eslint-react/set-state-in-effect -- checking device capabilities on mount */
    setIsTouchDevice(() => {
      if (typeof window === 'undefined') return false;
      return window.matchMedia('(hover: none)').matches;
    });
    /* eslint-enable @eslint-react/set-state-in-effect */
  }, []);

  // Load areas on mount
  useEffect(() => {
    fetchAreas()
      .then((resp) => setAreas(resp.areas || []))
      .catch(() => setAreas([]));
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

        const photo = await uploadPhoto(
          entityType,
          entityId,
          entry.file,
          entry.metadata?.caption ?? undefined,
          undefined,
          entry.metadata?.areaId ?? undefined,
          entry.metadata?.orientationId ?? undefined,
        );
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
          prev.map((p) => (p.file === entry.file ? { ...p, state: 'failed', errorMessage } : p)),
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
    /* eslint-disable @eslint-react/set-state-in-effect -- updating queue state based on observed entries; async uploads follow */
    setPhotoQueue((prev) =>
      prev.map((p) => (p.state === 'queued' ? { ...p, state: 'uploading' as const } : p)),
    );
    /* eslint-enable @eslint-react/set-state-in-effect */

    // Kick off uploads in parallel; they update state on completion
    for (const entry of queued) {
      void uploadSinglePhoto(entry);
    }
  }, [photoQueue, uploadSinglePhoto]);

  const handleFiles = (files: File[], triggerButton?: HTMLButtonElement | null) => {
    if (files.length === 0) return;
    modalTriggerRef.current = triggerButton ?? null;
    setPendingFiles(files);
    setModalFileIndex(0);
  };

  const handleModalSave = (metadata: {
    caption: string | null;
    areaId: string | null;
    orientationId: string | null;
  }) => {
    const file = pendingFiles[modalFileIndex!];
    if (!file) return;
    // Add to upload queue with metadata
    setPhotoQueue((prev) => [...prev, { file, state: 'queued', metadata }]);

    const next = modalFileIndex! + 1;
    if (next < pendingFiles.length) {
      setModalFileIndex(next);
    } else {
      // Done with all files
      setPendingFiles([]);
      setModalFileIndex(null);
      modalTriggerRef.current?.focus();
    }
  };

  const handleModalCancel = () => {
    // Discard current file, advance to next
    const next = modalFileIndex! + 1;
    if (next < pendingFiles.length) {
      setModalFileIndex(next);
    } else {
      setPendingFiles([]);
      setModalFileIndex(null);
      modalTriggerRef.current?.focus();
    }
  };

  const handleRetry = (entry: PhotoEntry) => {
    setPhotoQueue((prev) =>
      prev.map((p) =>
        p.file === entry.file ? { ...p, state: 'queued', errorMessage: undefined } : p,
      ),
    );
  };

  const handleRemovePhoto = (entry: PhotoEntry) => {
    setPhotoQueue((prev) => prev.filter((p) => p.file !== entry.file));
  };

  const isProcessing = photoQueue.some((p) => p.state === 'queued' || p.state === 'uploading');

  return (
    <div className={styles.container}>
      {/* Mobile: Two-button pair */}
      {isTouchDevice ? (
        <div className={styles.mobileButtonPair}>
          {/* Take photo — camera capture */}
          <button
            ref={takePhotoButtonRef}
            type="button"
            className={styles.captureButton}
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
            aria-label={t('photoUpload.buttonTakePhoto')}
          >
            <CameraIcon aria-hidden="true" />
            {t('photoUpload.buttonTakePhoto')}
          </button>
          {/* Upload from library */}
          <button
            ref={uploadButtonRef}
            type="button"
            className={styles.uploadPhotoButton}
            disabled={disabled}
            onClick={() => libraryInputRef.current?.click()}
            aria-label={t('photoUpload.buttonUploadPhotos')}
          >
            <UploadIcon aria-hidden="true" />
            {t('photoUpload.buttonUploadPhotos')}
          </button>
        </div>
      ) : (
        /* Desktop: Drag-and-drop zone + single button */
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
              aria-label={t('photoUpload.buttonUploadPhotos')}
            >
              {isProcessing ? t('photoUpload.uploading') : t('photoUpload.buttonUploadPhotos')}
            </button>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      {/* Camera input (touch devices: Take photo) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          if (files.length > 0) handleFiles(files, takePhotoButtonRef.current);
          e.currentTarget.value = '';
        }}
        className={styles.fileInput}
        aria-hidden="true"
        data-testid="photo-camera-input"
      />
      {/* Library input (touch devices: Upload photo) */}
      <input
        ref={libraryInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          if (files.length > 0) handleFiles(files, uploadButtonRef.current);
          e.currentTarget.value = '';
        }}
        className={styles.fileInput}
        aria-hidden="true"
        data-testid="photo-library-input"
      />
      {/* Desktop file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileInputChange}
        className={styles.fileInput}
        aria-hidden="true"
        data-testid="photo-file-input"
      />

      {/* Photo queue with per-photo state */}
      {photoQueue.length > 0 && (
        <div className={styles.queueContainer} aria-label={t('photoUpload.queueAriaLabel')}>
          {photoQueue.map((entry) => (
            <div
              key={`${entry.file.name}-${entry.file.size}-${entry.file.lastModified}`}
              className={`${styles.queueItem} ${styles[`state-${entry.state}`]}`}
            >
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

      {/* PhotoMetadataModal for per-file metadata capture */}
      {modalFileIndex !== null && pendingFiles[modalFileIndex] && (
        <PhotoMetadataModal
          file={pendingFiles[modalFileIndex]}
          entityType={entityType}
          areas={areas}
          onSave={handleModalSave}
          onCancel={handleModalCancel}
        />
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

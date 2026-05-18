import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Photo } from '@cornerstone/shared';
import { PhotoAnnotator } from './PhotoAnnotator/PhotoAnnotator.js';
import { Modal } from '../Modal/Modal.js';
import { clearAnnotation } from '../../lib/photoApi.js';
import styles from './PhotoViewer.module.css';

export interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onPhotoAnnotated?: (photo: Photo) => void;
}

export function PhotoViewer({ photos, initialIndex, onClose, onPhotoAnnotated }: PhotoViewerProps) {
  const { t } = useTranslation(['photoViewer', 'common']);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearingAnnotation, setIsClearingAnnotation] = useState(false);

  const previousFocusRef = useRef<HTMLElement | null>(null);
  const annotateBtnRef = useRef<HTMLButtonElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);

  // currentIndex is always within bounds [0, photos.length) due to cyclic navigation logic
  const currentPhoto = photos[currentIndex]!;

  // Store previous focus and restore on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // When annotating, Escape cancels the annotator (does NOT close the viewer)
      if (isAnnotating && e.key === 'Escape') {
        e.preventDefault();
        setIsAnnotating(false);
        annotateBtnRef.current?.focus();
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          if (!isAnnotating) {
            e.preventDefault();
            setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
          }
          break;
        case 'ArrowRight':
          if (!isAnnotating) {
            e.preventDefault();
            setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
          }
          break;
        case 'Escape':
          if (!isAnnotating) {
            e.preventDefault();
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, onClose, isAnnotating]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleAnnotationSave = useCallback(
    (updatedPhoto: Photo) => {
      setIsAnnotating(false);
      setShowingOriginal(false);
      onPhotoAnnotated?.(updatedPhoto);
      annotateBtnRef.current?.focus();
    },
    [onPhotoAnnotated],
  );

  const handleAnnotationCancel = useCallback(() => {
    setIsAnnotating(false);
    annotateBtnRef.current?.focus();
  }, []);

  const handleClearAnnotation = useCallback(async () => {
    setIsClearingAnnotation(true);
    try {
      await clearAnnotation(currentPhoto.id);
      const clearedPhoto: Photo = {
        ...currentPhoto,
        annotatedAt: null,
      };
      onPhotoAnnotated?.(clearedPhoto);
      setShowClearConfirm(false);
      clearBtnRef.current?.focus();
    } catch (err) {
      // Error handling — could show a toast here
      console.error('Failed to clear annotation:', err);
    } finally {
      setIsClearingAnnotation(false);
    }
  }, [currentPhoto, onPhotoAnnotated]);

  const buildPhotoUrl = (photo: Photo, showOriginal: boolean): string => {
    if (showOriginal) {
      return `${photo.fileUrl}?variant=original${photo.annotatedAt ? `&v=${photo.annotatedAt}` : ''}`;
    }
    return photo.annotatedAt ? `${photo.fileUrl}?v=${photo.annotatedAt}` : photo.fileUrl;
  };

  const viewer = (
    <div className={styles.modal} data-testid="photo-viewer">
      <div className={styles.backdrop} onClick={handleBackdropClick} />

      <div className={styles.container}>
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close photo viewer"
          data-testid="photo-viewer-close"
          style={{ display: isAnnotating ? 'none' : undefined }}
        >
          ×
        </button>

        {/* Photo or Annotator */}
        <div className={styles.photoContainer}>
          {isAnnotating ? (
            <PhotoAnnotator
              photo={currentPhoto}
              onSave={handleAnnotationSave}
              onCancel={handleAnnotationCancel}
            />
          ) : (
            <img
              src={buildPhotoUrl(currentPhoto, showingOriginal)}
              alt={currentPhoto.caption || currentPhoto.originalFilename}
              className={styles.photo}
            />
          )}
        </div>

        {/* Navigation */}
        {photos.length > 1 && !isAnnotating && (
          <>
            <button
              type="button"
              onClick={handlePrevious}
              className={`${styles.navButton} ${styles.navButtonLeft}`}
              aria-label="Previous photo"
              data-testid="photo-viewer-prev"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={handleNext}
              className={`${styles.navButton} ${styles.navButtonRight}`}
              aria-label="Next photo"
              data-testid="photo-viewer-next"
            >
              ›
            </button>
          </>
        )}

        {/* Info bar */}
        <div className={styles.infoBar} style={{ display: isAnnotating ? 'none' : undefined }}>
          <div className={styles.infoLeft}>
            {currentPhoto.caption && <p className={styles.caption}>{currentPhoto.caption}</p>}
          </div>
          <div className={styles.infoRight}>
            {/* Annotate button */}
            <button
              ref={annotateBtnRef}
              type="button"
              className={`${styles.iconButton} ${
                !currentPhoto.width || !currentPhoto.height ? styles.iconButtonDisabled : ''
              }`}
              disabled={!currentPhoto.width || !currentPhoto.height}
              aria-label={t('photoViewer:annotate')}
              title={
                !currentPhoto.width || !currentPhoto.height
                  ? t('photoViewer:annotateDisabledMissingDimensions')
                  : undefined
              }
              data-testid="photo-viewer-annotate"
              onClick={() => {
                setIsAnnotating(true);
                setShowingOriginal(false);
              }}
            >
              <PencilIcon />
            </button>

            {/* View Original toggle — only when annotatedAt is set */}
            {currentPhoto.annotatedAt && (
              <button
                type="button"
                aria-pressed={showingOriginal}
                aria-label={
                  showingOriginal ? t('photoViewer:viewAnnotated') : t('photoViewer:viewOriginal')
                }
                data-testid="photo-viewer-view-original"
                className={`${styles.iconButton} ${showingOriginal ? styles.iconButtonActive : ''}`}
                onClick={() => setShowingOriginal((v) => !v)}
              >
                {showingOriginal ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            )}

            {/* Clear Annotations — only when annotatedAt is set */}
            {currentPhoto.annotatedAt && (
              <button
                ref={clearBtnRef}
                type="button"
                className={styles.iconButtonDanger}
                aria-label={t('photoViewer:clearAnnotations')}
                data-testid="photo-viewer-clear-annotations"
                onClick={() => setShowClearConfirm(true)}
              >
                <TrashIcon />
              </button>
            )}

            <span className={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </span>
          </div>
        </div>

        {/* Clear Annotations confirmation modal */}
        {showClearConfirm && (
          <Modal
            title={t('photoViewer:clearConfirmTitle')}
            onClose={() => {
              setShowClearConfirm(false);
              clearBtnRef.current?.focus();
            }}
            footer={
              <>
                <button
                  type="button"
                  className={styles.modalButtonSecondary}
                  onClick={() => {
                    setShowClearConfirm(false);
                    clearBtnRef.current?.focus();
                  }}
                >
                  {t('common:button.cancel')}
                </button>
                <button
                  type="button"
                  className={styles.modalButtonDanger}
                  onClick={handleClearAnnotation}
                  disabled={isClearingAnnotation}
                >
                  {t('photoViewer:clearConfirmAction')}
                </button>
              </>
            }
          >
            <p>{t('photoViewer:clearConfirmBody')}</p>
          </Modal>
        )}
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
}

function PencilIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17 3L21 7M3 21H7L20 8L16 4L3 17V21Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 1l22 22M9.88 9.88A3 3 0 1012.32 15.32M9.379 5.407A10.863 10.863 0 0112 5c7 0 11 8 11 8a13.986 13.986 0 01-1.811 2.834m-2.409 1.879A10 10 0 0023.07 12s-4-8-11-8-9.2 3.6-10.6 5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7M10 11v6M14 11v6M3 7h18M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

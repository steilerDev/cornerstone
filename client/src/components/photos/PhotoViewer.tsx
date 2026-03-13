import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Photo } from '@cornerstone/shared';
import styles from './PhotoViewer.module.css';

export interface PhotoViewerProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}

export function PhotoViewer({ photos, initialIndex, onClose }: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const currentPhoto = photos[currentIndex];

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
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, onClose]);

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
        >
          ×
        </button>

        {/* Photo */}
        <div className={styles.photoContainer}>
          <img
            src={currentPhoto.fileUrl}
            alt={currentPhoto.caption || currentPhoto.originalFilename}
            className={styles.photo}
          />
        </div>

        {/* Navigation */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevious}
              className={styles.navButton}
              aria-label="Previous photo"
              data-testid="photo-viewer-prev"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={handleNext}
              className={styles.navButton}
              aria-label="Next photo"
              data-testid="photo-viewer-next"
            >
              ›
            </button>
          </>
        )}

        {/* Info bar */}
        <div className={styles.infoBar}>
          <div className={styles.infoLeft}>
            {currentPhoto.caption && <p className={styles.caption}>{currentPhoto.caption}</p>}
          </div>
          <div className={styles.infoRight}>
            <span className={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
}

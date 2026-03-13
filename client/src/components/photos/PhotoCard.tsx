import { useState, useRef, useEffect } from 'react';
import type { Photo } from '@cornerstone/shared';
import styles from './PhotoCard.module.css';

export interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
  onDelete?: () => void;
}

export function PhotoCard({ photo, onClick, onDelete }: PhotoCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    } else if (e.key === 'Delete' && onDelete) {
      e.preventDefault();
      onDelete();
    }
  };

  useEffect(() => {
    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const element = cardRef.current;
    if (element) {
      element.addEventListener('focus', handleFocus, true);
      element.addEventListener('blur', handleBlur, true);
    }

    return () => {
      if (element) {
        element.removeEventListener('focus', handleFocus, true);
        element.removeEventListener('blur', handleBlur, true);
      }
    };
  }, []);

  return (
    <div
      ref={cardRef}
      role="listitem"
      className={`${styles.card} ${isHovered || isFocused ? styles.cardHovered : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      data-testid={`photo-card-${photo.id}`}
    >
      {/* Image */}
      <img
        src={photo.thumbnailUrl}
        alt={photo.caption || photo.originalFilename}
        className={styles.image}
        loading="lazy"
      />

      {/* Caption overlay */}
      {photo.caption && (
        <div className={styles.captionOverlay}>
          <p className={styles.caption}>{photo.caption}</p>
        </div>
      )}

      {/* Click handler */}
      <button
        type="button"
        onClick={onClick}
        className={styles.clickArea}
        aria-label={`View photo: ${photo.caption || photo.originalFilename}`}
      />

      {/* Delete button (shown on hover/focus) */}
      {onDelete && (isHovered || isFocused) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={styles.deleteButton}
          aria-label={`Delete photo: ${photo.caption || photo.originalFilename}`}
          title="Delete photo (or press Delete key)"
        >
          ×
        </button>
      )}
    </div>
  );
}

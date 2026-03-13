import type { Photo } from '@cornerstone/shared';
import { PhotoCard } from './PhotoCard.js';
import styles from './PhotoGrid.module.css';

export interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  onDelete?: (photo: Photo) => void;
  loading?: boolean;
}

export function PhotoGrid({ photos, onPhotoClick, onDelete, loading }: PhotoGridProps) {
  if (loading) {
    return (
      <div className={styles.grid} role="list" aria-label="Loading photos">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${styles.card} ${styles.skeleton}`} role="listitem" />
        ))}
      </div>
    );
  }

  if (photos.length === 0) {
    return null;
  }

  return (
    <div className={styles.grid} role="list" aria-label="Photos">
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          onClick={() => onPhotoClick(photo)}
          onDelete={onDelete ? () => onDelete(photo) : undefined}
        />
      ))}
    </div>
  );
}

import { useState } from 'react';
import { usePhotos } from '../../hooks/usePhotos.js';
import { PhotoUpload } from '../../components/photos/PhotoUpload.js';
import { PhotoGrid } from '../../components/photos/PhotoGrid.js';
import { PhotoViewer } from '../../components/photos/PhotoViewer.js';
import styles from './DevPhotosPage.module.css';

export default function DevPhotosPage() {
  const { photos, loading, error, deletePhoto, refresh } = usePhotos('test', 'test-1');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Photo Components (Dev)</h1>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <p className={styles.errorText}>{error}</p>
          <button
            type="button"
            onClick={refresh}
            className={styles.retryButton}
          >
            Retry
          </button>
        </div>
      )}

      {uploadError && (
        <div className={styles.errorBanner} role="alert">
          <p className={styles.errorText}>{uploadError}</p>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className={styles.retryButton}
          >
            Dismiss
          </button>
        </div>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Upload</h2>
        <PhotoUpload
          entityType="test"
          entityId="test-1"
          onUpload={() => refresh()}
          onError={(err) => setUploadError(err)}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Photos ({photos.length})
        </h2>
        {photos.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>No photos yet. Upload some above.</p>
          </div>
        )}
        <PhotoGrid
          photos={photos}
          onPhotoClick={(photo) => {
            const idx = photos.findIndex((p) => p.id === photo.id);
            setViewerIndex(idx >= 0 ? idx : 0);
          }}
          onDelete={(photo) => {
            void deletePhoto(photo.id);
          }}
          loading={loading}
        />
      </section>

      {viewerIndex !== null && (
        <PhotoViewer
          photos={photos}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}

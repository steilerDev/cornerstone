import { useRef, useState, useEffect } from 'react';
import type { Photo } from '@cornerstone/shared';
import { uploadPhoto } from '../../lib/photoApi.js';
import styles from './PhotoUpload.module.css';

export interface PhotoUploadProps {
  entityType: string;
  entityId: string;
  onUpload: (photo: Photo) => void;
  disabled?: boolean;
  onError?: (error: string) => void;
}

export function PhotoUpload({ entityType, entityId, onUpload, disabled, onError }: PhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice(() => {
      if (typeof window === 'undefined') return false;
      return window.matchMedia('(hover: none)').matches;
    });
  }, []);

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

  const handleFiles = async (files: File[]) => {
    setUploading(true);

    for (const file of files) {
      const fileName = file.name;
      try {
        const photo = await uploadPhoto(entityType, entityId, file, undefined, (percent) => {
          setUploadProgress((prev) => {
            const next = new Map(prev);
            next.set(fileName, percent);
            return next;
          });
        });

        onUpload(photo);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        onError?.(`Failed to upload ${fileName}: ${message}`);
      } finally {
        setUploadProgress((prev) => {
          const next = new Map(prev);
          next.delete(fileName);
          return next;
        });
      }
    }

    setUploading(false);
  };

  const buttonLabel = isTouchDevice ? 'Take Photo' : 'Upload Photos';

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
        aria-label="Photo upload drop zone"
        data-testid="photo-upload-zone"
      >
        <div className={styles.dropZoneContent}>
          <p className={styles.dropZoneText}>Drag photos here or</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className={styles.uploadButton}
            aria-label={buttonLabel}
          >
            {uploading ? 'Uploading...' : buttonLabel}
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

      {/* Progress bars */}
      {uploadProgress.size > 0 && (
        <div className={styles.progressContainer}>
          {Array.from(uploadProgress.entries()).map(([fileName, percent]) => (
            <div key={fileName} className={styles.progressItem}>
              <div className={styles.progressLabel}>{fileName}</div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${percent}%` }}
                  role="progressbar"
                  aria-label={`${fileName} upload progress`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <div className={styles.progressPercent}>{percent}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

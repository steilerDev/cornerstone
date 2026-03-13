import { useState, useEffect, useCallback } from 'react';
import type { Photo } from '@cornerstone/shared';
import {
  getPhotosForEntity,
  uploadPhoto as uploadPhotoApi,
  updatePhoto as updatePhotoApi,
  deletePhoto as deletePhotoApi,
} from '../lib/photoApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UsePhotosResult {
  photos: Photo[];
  loading: boolean;
  error: string | null;
  uploadPhoto: (file: File, caption?: string, onProgress?: (percent: number) => void) => Promise<Photo>;
  deletePhoto: (id: string) => Promise<void>;
  updatePhoto: (id: string, data: { caption?: string | null; sortOrder?: number }) => Promise<void>;
  refresh: () => void;
  uploadProgress: Map<string, number>; // filename -> percent
}

export function usePhotos(entityType: string, entityId: string): UsePhotosResult {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());

  // Fetch photos on mount and when refresh is called
  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      setLoading(true);
      setError(null);

      try {
        const fetchedPhotos = await getPhotosForEntity(entityType, entityId);
        if (!cancelled) {
          setPhotos(fetchedPhotos);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(err.error.message ?? 'Failed to load photos.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred.');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, fetchCount]);

  const uploadPhoto = useCallback(
    async (file: File, caption?: string, onProgress?: (percent: number) => void) => {
      const fileName = file.name;
      const progressWrapper = (percent: number) => {
        setUploadProgress((prev) => {
          const next = new Map(prev);
          next.set(fileName, percent);
          return next;
        });
        onProgress?.(percent);
      };

      try {
        const photo = await uploadPhotoApi(entityType, entityId, file, caption, progressWrapper);
        // Clear progress after successful upload
        setUploadProgress((prev) => {
          const next = new Map(prev);
          next.delete(fileName);
          return next;
        });
        // Add the new photo to the list
        setPhotos((prev) => [photo, ...prev]);
        return photo;
      } catch (err) {
        // Clear progress on error
        setUploadProgress((prev) => {
          const next = new Map(prev);
          next.delete(fileName);
          return next;
        });
        throw err;
      }
    },
    [entityType, entityId],
  );

  const deletePhoto = useCallback(async (id: string) => {
    await deletePhotoApi(id);
    // Optimistically remove from local state immediately for better UX
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
  }, []);

  const updatePhoto = useCallback(
    async (id: string, data: { caption?: string | null; sortOrder?: number }) => {
      const updated = await updatePhotoApi(id, data);
      // Optimistically update local state
      setPhotos((prev) => prev.map((photo) => (photo.id === id ? updated : photo)));
    },
    [],
  );

  const refresh = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  return {
    photos,
    loading,
    error,
    uploadPhoto,
    deletePhoto,
    updatePhoto,
    refresh,
    uploadProgress,
  };
}

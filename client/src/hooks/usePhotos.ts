import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeletePhotoResponse, Photo } from '@cornerstone/shared';
import {
  getPhotosForEntity,
  uploadPhoto as uploadPhotoApi,
  updatePhoto as updatePhotoApi,
  deletePhoto as deletePhotoApi,
} from '../lib/photoApi.js';
import { undoChange } from '../lib/undoApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UsePhotosResult {
  photos: Photo[];
  loading: boolean;
  error: string | null;
  uploadPhoto: (
    file: File,
    caption?: string,
    onProgress?: (percent: number) => void,
  ) => Promise<Photo>;
  /** Deletes the photo and resolves with the undo token. */
  deletePhoto: (id: string) => Promise<DeletePhotoResponse>;
  /** Restores a deleted photo from its undo token, then reloads the entity's photos. Rejects on 404/409. */
  restorePhoto: (token: DeletePhotoResponse['undo']) => Promise<void>;
  updatePhoto: (id: string, data: { caption?: string | null; sortOrder?: number }) => Promise<void>;
  updatePhotoInList: (updatedPhoto: Photo) => void;
  refresh: () => void;
  uploadProgress: Map<string, number>; // filename -> percent
}

export function usePhotos(entityType: string, entityId: string): UsePhotosResult {
  const { t } = useTranslation('photoViewer');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(() => new Map());

  // Fetch photos on mount and when refresh is called
  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (!entityType || !entityId) {
        setPhotos([]);
        return;
      }

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
            setError(translateApiError(err.error.code, tErrors));
          } else if (err instanceof NetworkError) {
            setError(tCommon('requestErrors.network'));
          } else {
            setError(t('unexpectedError'));
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
  }, [entityType, entityId, fetchCount, t, tErrors, tCommon]);

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
    const response = await deletePhotoApi(id);
    // Optimistically remove from local state immediately for better UX
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
    return response;
  }, []);

  const restorePhoto = useCallback(
    async (token: DeletePhotoResponse['undo']) => {
      if (!entityType || !entityId) return;
      await undoChange(token.token);
      // The restored photo keeps its id and sort order; reload the list for its position.
      setPhotos(await getPhotosForEntity(entityType, entityId));
    },
    [entityType, entityId],
  );

  const updatePhoto = useCallback(
    async (id: string, data: { caption?: string | null; sortOrder?: number }) => {
      const updated = await updatePhotoApi(id, data);
      // Optimistically update local state
      setPhotos((prev) => prev.map((photo) => (photo.id === id ? updated : photo)));
    },
    [],
  );

  const updatePhotoInList = useCallback((updatedPhoto: Photo) => {
    setPhotos((prev) => prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p)));
  }, []);

  const refresh = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  return {
    photos,
    loading,
    error,
    uploadPhoto,
    deletePhoto,
    restorePhoto,
    updatePhoto,
    updatePhotoInList,
    refresh,
    uploadProgress,
  };
}

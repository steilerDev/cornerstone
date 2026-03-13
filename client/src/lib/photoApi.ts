import { get, patch, del, getBaseUrl, ApiClientError, NetworkError } from './apiClient.js';
import type { Photo, UpdatePhotoRequest } from '@cornerstone/shared';

/**
 * Upload a photo using XMLHttpRequest for progress tracking.
 */
export function uploadPhoto(
  entityType: string,
  entityId: string,
  file: File,
  caption?: string,
  onProgress?: (percent: number) => void,
): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getBaseUrl()}/photos`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 201) {
        try {
          const data = JSON.parse(xhr.responseText) as { photo: Photo };
          resolve(data.photo);
        } catch {
          reject(new Error('Failed to parse upload response'));
        }
      } else {
        try {
          const errBody = JSON.parse(xhr.responseText);
          reject(new Error(errBody.error?.message ?? `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new NetworkError('Network error during upload', null)));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);
    if (caption) formData.append('caption', caption);

    xhr.send(formData);
  });
}

/**
 * List photos for an entity.
 */
export function getPhotosForEntity(entityType: string, entityId: string): Promise<Photo[]> {
  const params = new URLSearchParams({ entityType, entityId });
  return get<{ photos: Photo[] }>(`/photos?${params.toString()}`).then((r) => r.photos);
}

/**
 * Update a photo's caption or sort order.
 */
export function updatePhoto(id: string, data: UpdatePhotoRequest): Promise<Photo> {
  return patch<{ photo: Photo }>(`/photos/${id}`, data).then((r) => r.photo);
}

/**
 * Delete a photo.
 */
export function deletePhoto(id: string): Promise<void> {
  return del<void>(`/photos/${id}`);
}

/**
 * Get the URL for a photo's original file.
 */
export function getPhotoFileUrl(id: string): string {
  return `${getBaseUrl()}/photos/${id}/file`;
}

/**
 * Get the URL for a photo's thumbnail.
 */
export function getPhotoThumbnailUrl(id: string): string {
  return `${getBaseUrl()}/photos/${id}/thumbnail`;
}

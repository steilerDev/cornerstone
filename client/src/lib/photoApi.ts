import { get, patch, del, getBaseUrl, ApiClientError, NetworkError } from './apiClient.js';
import type { RequestOptions } from './apiClient.js';
import { PHOTO_SPOT_NONE } from '@cornerstone/shared';
import type {
  ApiError,
  Photo,
  UpdatePhotoRequest,
  PhotoSpotsResponse,
  PhotoSpotPhotosResponse,
} from '@cornerstone/shared';

/**
 * Build an ApiClientError for a non-2xx upload response. Uses the server's
 * `{ error: { code, message } }` body when present; otherwise derives a code from the
 * HTTP status so the UI can still translate it.
 */
function buildUploadError(status: number, body: unknown): ApiClientError {
  const apiError = (body as { error?: Partial<ApiError> } | null)?.error;
  if (apiError && typeof apiError.code === 'string') {
    return new ApiClientError(status, apiError as ApiError);
  }
  return new ApiClientError(status, {
    code:
      status === 413 ? 'PAYLOAD_TOO_LARGE' : status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR',
    message: `Upload failed (${status})`,
  });
}

/**
 * Upload a photo using XMLHttpRequest for progress tracking.
 */
export function uploadPhoto(
  entityType: string,
  entityId: string,
  file: File,
  caption?: string | null,
  onProgress?: ((percent: number) => void) | null,
  areaId?: string | null,
  orientationId?: string | null,
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
        let errBody: unknown = null;
        try {
          errBody = JSON.parse(xhr.responseText);
        } catch {
          // Non-JSON body: fall back to a status-derived error
        }
        reject(buildUploadError(xhr.status, errBody));
      }
    });

    xhr.addEventListener('error', () =>
      reject(new NetworkError('Network error during upload', null)),
    );
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);
    if (caption) formData.append('caption', caption);
    if (areaId) formData.append('areaId', areaId);
    if (orientationId) formData.append('orientationId', orientationId);

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

/**
 * Upload a baked annotated WebP for a photo.
 * Uses fetch (no XHR) — no progress tracking needed.
 */
export async function uploadAnnotation(id: string, blob: Blob): Promise<Photo> {
  const formData = new FormData();
  formData.append('file', blob, 'annotated.webp');

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/photos/${id}/annotation`, {
      method: 'PUT',
      body: formData,
      credentials: 'include',
    });
  } catch (error) {
    throw new NetworkError('Network request failed', error);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw buildUploadError(response.status, body);
  }

  const data = (await response.json()) as { photo: Photo };
  return data.photo;
}

/**
 * Clear the annotated image for a photo (DELETE /api/photos/:id/annotation).
 */
export async function clearAnnotation(id: string): Promise<void> {
  await del<void>(`/photos/${id}/annotation`);
}

/**
 * List every photo spot (area x orientation) with counts and the latest photo, plus the
 * areas and orientations needed to lay out the matrix.
 */
export function getPhotoSpots(options?: RequestOptions): Promise<PhotoSpotsResponse> {
  return get<PhotoSpotsResponse>('/photos/spots', options);
}

/**
 * List the photos of one spot, newest first. `null` means "no area" / "no orientation".
 */
export function getPhotoSpotPhotos(
  areaId: string | null,
  orientationId: string | null,
  options?: RequestOptions,
): Promise<PhotoSpotPhotosResponse> {
  const params = new URLSearchParams({
    areaId: areaId ?? PHOTO_SPOT_NONE,
    orientationId: orientationId ?? PHOTO_SPOT_NONE,
  });
  return get<PhotoSpotPhotosResponse>(`/photos/spots/photos?${params.toString()}`, options);
}

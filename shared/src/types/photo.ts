/**
 * Photo attachment types.
 *
 * Photos are attached to various entities (diary entries, rooms, surfaces, etc.)
 * using the same polymorphic entity_type + entity_id pattern as document links.
 */

import type { OrientationResponse, OrientationSummary } from './orientation.js';
import type { AreaResponse, AreaSummary } from './area.js';
import type { DiaryEntryType } from './diary.js';

export type PhotoEntityType = 'diary_entry' | 'room' | 'surface' | 'test';

/**
 * Represents a photo attachment with metadata.
 */
export interface Photo {
  id: string;
  entityType: string;
  entityId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  caption: string | null;
  areaId: string | null;
  orientationId: string | null;
  orientation: OrientationSummary | null;
  sortOrder: number;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
  annotatedAt: string | null;
  fileUrl: string;
  thumbnailUrl: string;
}

/**
 * Request to update photo metadata (caption, area, orientation, and sort order).
 */
export interface UpdatePhotoRequest {
  caption?: string | null;
  areaId?: string | null;
  orientationId?: string | null;
  sortOrder?: number;
}

/**
 * Request to reorder photos for an entity.
 */
export interface ReorderPhotosRequest {
  entityType: string;
  entityId: string;
  photoIds: string[];
}

/** Query sentinel selecting photos with no area / no orientation (Story #2162). */
export const PHOTO_SPOT_NONE = '__none__';

export interface PhotoSpotSummary {
  areaId: string | null;
  orientationId: string | null;
  photoCount: number;
  latestEntryDate: string;
  latestPhotoId: string;
  latestThumbnailUrl: string;
}

export interface PhotoSpotsResponse {
  spots: PhotoSpotSummary[];
  areas: AreaResponse[];
  orientations: OrientationResponse[];
}

export interface PhotoSpotDiaryEntry {
  id: string;
  entryType: DiaryEntryType;
  title: string | null;
  entryDate: string;
}

export interface PhotoSpotPhoto {
  id: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  fileUrl: string;
  thumbnailUrl: string;
  diaryEntry: PhotoSpotDiaryEntry;
}

export interface PhotoSpotPhotosResponse {
  area: AreaSummary | null;
  orientation: OrientationSummary | null;
  photos: PhotoSpotPhoto[];
}

export interface PhotoSpotPhotosQuery {
  /** Area id, or PHOTO_SPOT_NONE */
  areaId: string;
  /** Orientation id, or PHOTO_SPOT_NONE */
  orientationId: string;
}

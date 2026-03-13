/**
 * Photo attachment types.
 *
 * Photos are attached to various entities (diary entries, rooms, surfaces, etc.)
 * using the same polymorphic entity_type + entity_id pattern as document links.
 */

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
  sortOrder: number;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
  fileUrl: string;
  thumbnailUrl: string;
}

/**
 * Request to update photo metadata (caption and sort order).
 */
export interface UpdatePhotoRequest {
  caption?: string | null;
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

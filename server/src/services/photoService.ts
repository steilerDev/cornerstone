/**
 * Photo service — CRUD for photo attachments and file management.
 *
 * EPIC-13 & EPIC-16: Photo Upload Infrastructure
 *
 * Manages the polymorphic `photos` table and on-disk file storage.
 * Handles image processing (auto-rotation, format conversion, thumbnail generation).
 *
 * File structure on disk:
 *   {photoStoragePath}/{photoId}/
 *     original.{ext}    - Processed original (JPEG for HEIC/HEIF, otherwise original format)
 *     thumbnail.webp    - 300px wide WebP thumbnail
 */

import { randomUUID } from 'node:crypto';
import { mkdir, rm, readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { eq, and, asc, inArray, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { photos, users } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import type { Photo, PhotoEntityType } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Allowed MIME types for photo uploads.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Map a MIME type to file extension.
 */
function getExtensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'jpg', // HEIC converted to JPEG
    'image/heif': 'jpg', // HEIF converted to JPEG
  };
  return map[mimeType] || 'jpg';
}

/**
 * Map a photos DB row + user to a Photo shape.
 */
function toPhoto(
  row: typeof photos.$inferSelect,
  user: typeof users.$inferSelect | null | undefined,
): Photo {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    width: row.width,
    height: row.height,
    takenAt: row.takenAt,
    caption: row.caption,
    sortOrder: row.sortOrder,
    createdBy: user ? { id: user.id, displayName: user.displayName } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fileUrl: `/api/photos/${row.id}/file`,
    thumbnailUrl: `/api/photos/${row.id}/thumbnail`,
  };
}

/**
 * Resolve the user who created a photo.
 */
function resolveCreatedBy(
  db: DbType,
  createdBy: string | null,
): typeof users.$inferSelect | null {
  if (!createdBy) return null;
  return db.select().from(users).where(eq(users.id, createdBy)).get() ?? null;
}

/**
 * Upload a photo: process the image, save files, and create a DB record.
 *
 * Validates MIME type, processes image (auto-rotate, convert HEIC/HEIF to JPEG),
 * generates thumbnail, and returns the Photo object.
 *
 * @param db Database instance
 * @param photoStoragePath Base directory for photo storage
 * @param fileBuffer Raw file content
 * @param originalFilename Original filename from upload
 * @param mimeType MIME type of the file
 * @param entityType Entity type (e.g., 'diary_entry', 'room')
 * @param entityId Entity ID (UUID string)
 * @param userId User ID of uploader
 * @param caption Optional caption
 * @throws ValidationError if MIME type not allowed
 * @returns Photo object with metadata and URLs
 */
export async function uploadPhoto(
  db: DbType,
  photoStoragePath: string,
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType: string,
  entityType: PhotoEntityType,
  entityId: string,
  userId: string,
  caption?: string | null,
): Promise<Photo> {
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`MIME type not allowed: ${mimeType}`);
  }

  const photoId = randomUUID();
  const photoDir = path.join(photoStoragePath, photoId);

  try {
    // Create photo directory
    await mkdir(photoDir, { recursive: true });

    // Process image with sharp
    let processedImage = sharp(fileBuffer);

    // Get image metadata (including EXIF orientation)
    const metadata = await processedImage.metadata();

    // Auto-rotate based on EXIF orientation (sharp does this by default with rotate())
    processedImage = processedImage.rotate();

    // Extract dimensions after processing
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;

    // Extract taken date from EXIF if available (simplified approach)
    // For now, we'll leave takenAt as null since sharp's metadata doesn't expose DateTimeOriginal easily
    // A full implementation would use exif-reader or similar
    const takenAt: string | null = null;

    // Determine final extension and format
    const extension = getExtensionForMimeType(mimeType);
    const isHeic = mimeType === 'image/heic' || mimeType === 'image/heif';

    // Convert HEIC/HEIF to JPEG, or keep original format
    let processedBuffer: Buffer;
    if (isHeic) {
      // Convert HEIC/HEIF to JPEG
      processedBuffer = await processedImage.jpeg({ quality: 90 }).toBuffer();
    } else if (mimeType === 'image/png') {
      // Keep as PNG
      processedBuffer = await processedImage.png().toBuffer();
    } else if (mimeType === 'image/webp') {
      // Keep as WebP
      processedBuffer = await processedImage.webp().toBuffer();
    } else {
      // JPEG or others
      processedBuffer = await processedImage.jpeg({ quality: 90 }).toBuffer();
    }

    // Save original file
    const originalPath = path.join(photoDir, `original.${extension}`);
    await writeFile(originalPath, processedBuffer);

    // Generate thumbnail (300px wide, maintain aspect ratio)
    const thumbnailBuffer = await sharp(processedBuffer)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();

    const thumbnailPath = path.join(photoDir, 'thumbnail.webp');
    await writeFile(thumbnailPath, thumbnailBuffer);

    // Insert DB record
    const now = new Date().toISOString();
    const row: typeof photos.$inferInsert = {
      id: photoId,
      entityType,
      entityId,
      filename: `original.${extension}`,
      originalFilename,
      mimeType,
      fileSize: processedBuffer.length,
      width,
      height,
      takenAt,
      caption: caption ?? null,
      sortOrder: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(photos).values(row).run();

    // Fetch the inserted row with user info
    const insertedRow = db
      .select()
      .from(photos)
      .where(eq(photos.id, photoId))
      .get();

    if (!insertedRow) {
      throw new Error('Failed to retrieve inserted photo');
    }

    const user = resolveCreatedBy(db, insertedRow.createdBy);
    return toPhoto(insertedRow, user);
  } catch (error) {
    // Clean up files on error
    try {
      await rm(photoDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Get a single photo by ID.
 *
 * @returns Photo object or null if not found
 */
export function getPhoto(db: DbType, id: string): Photo | null {
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!row) return null;

  const user = resolveCreatedBy(db, row.createdBy);
  return toPhoto(row, user);
}

/**
 * Get all photos for an entity, ordered by sortOrder then createdAt.
 *
 * @returns Array of Photo objects
 */
export function getPhotosForEntity(
  db: DbType,
  entityType: string,
  entityId: string,
): Photo[] {
  const rows = db
    .select()
    .from(photos)
    .where(and(eq(photos.entityType, entityType), eq(photos.entityId, entityId)))
    .orderBy(asc(photos.sortOrder), asc(photos.createdAt))
    .all();

  return rows.map((row) => {
    const user = resolveCreatedBy(db, row.createdBy);
    return toPhoto(row, user);
  });
}

/**
 * Update a photo's caption and/or sort order.
 *
 * @returns Updated Photo object or null if not found
 */
export function updatePhoto(
  db: DbType,
  id: string,
  updates: { caption?: string | null; sortOrder?: number },
): Photo | null {
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!row) return null;

  const now = new Date().toISOString();
  const updateData: Partial<typeof photos.$inferInsert> = {
    updatedAt: now,
  };

  if (updates.caption !== undefined) {
    updateData.caption = updates.caption;
  }
  if (updates.sortOrder !== undefined) {
    updateData.sortOrder = updates.sortOrder;
  }

  db.update(photos).set(updateData).where(eq(photos.id, id)).run();

  const updated = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!updated) return null;

  const user = resolveCreatedBy(db, updated.createdBy);
  return toPhoto(updated, user);
}

/**
 * Reorder photos for an entity by updating their sort_order values.
 *
 * @param photoIds Array of photo IDs in desired order
 */
export function reorderPhotos(
  db: DbType,
  entityType: string,
  entityId: string,
  photoIds: string[],
): void {
  const now = new Date().toISOString();

  db.transaction((tx) => {
    photoIds.forEach((photoId, index) => {
      tx.update(photos)
        .set({ sortOrder: index, updatedAt: now })
        .where(
          and(
            eq(photos.id, photoId),
            eq(photos.entityType, entityType),
            eq(photos.entityId, entityId),
          ),
        )
        .run();
    });
  });
}

/**
 * Delete a photo and its associated files.
 *
 * @param photoStoragePath Base directory for photo storage
 */
export async function deletePhoto(
  db: DbType,
  photoStoragePath: string,
  id: string,
): Promise<void> {
  // Delete DB record
  db.delete(photos).where(eq(photos.id, id)).run();

  // Delete files
  const photoDir = path.join(photoStoragePath, id);
  try {
    await rm(photoDir, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
}

/**
 * Delete all photos for an entity.
 *
 * @param photoStoragePath Base directory for photo storage
 */
export async function deletePhotosForEntity(
  db: DbType,
  photoStoragePath: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  const rows = db
    .select()
    .from(photos)
    .where(and(eq(photos.entityType, entityType), eq(photos.entityId, entityId)))
    .all();

  for (const row of rows) {
    await deletePhoto(db, photoStoragePath, row.id);
  }
}

/**
 * Get the file path for a photo variant.
 *
 * For 'original', reads the directory to find the actual file (since extension varies).
 * For 'thumbnail', returns the thumbnail.webp path.
 *
 * @param variant 'original' or 'thumbnail'
 * @returns Full file path or null if not found
 */
export async function getPhotoFilePath(
  photoStoragePath: string,
  id: string,
  variant: 'original' | 'thumbnail',
): Promise<string | null> {
  const photoDir = path.join(photoStoragePath, id);

  try {
    if (variant === 'thumbnail') {
      const thumbnailPath = path.join(photoDir, 'thumbnail.webp');
      await stat(thumbnailPath);
      return thumbnailPath;
    } else {
      // original: find the file starting with "original."
      const files = await readdir(photoDir);
      const originalFile = files.find((f) => f.startsWith('original.'));
      if (!originalFile) return null;
      return path.join(photoDir, originalFile);
    }
  } catch {
    return null;
  }
}

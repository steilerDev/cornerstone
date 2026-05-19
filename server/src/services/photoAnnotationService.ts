/**
 * Photo annotation service — save and clear annotated image overlays.
 *
 * Story #1473: Photo Annotator Foundation
 *
 * File structure on disk:
 *   {photoStoragePath}/{photoId}/
 *     original.{ext}    - Never modified
 *     annotated.webp    - Baked overlay (full-resolution WebP); managed by this service
 *     thumbnail.webp    - Regenerated from annotated.webp (if present) or original
 */

import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { photos } from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { getPhoto, getPhotoFilePath } from './photoService.js';
import type { Photo } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Save a baked annotated WebP image for a photo.
 *
 * Writes annotated.webp, regenerates thumbnail.webp from it, sets annotated_at.
 *
 * @throws NotFoundError if photo does not exist
 */
export async function saveAnnotatedImage(
  db: DbType,
  photoStoragePath: string,
  id: string,
  webpBuffer: Buffer,
): Promise<Photo> {
  const existing = getPhoto(db, id);
  if (!existing) throw new NotFoundError('Photo not found');

  const photoDir = path.join(photoStoragePath, id);
  const annotatedPath = path.join(photoDir, 'annotated.webp');
  const thumbnailPath = path.join(photoDir, 'thumbnail.webp');

  // Generate thumbnail first — sharp validates the buffer before any file writes
  const thumbnailBuffer = await sharp(webpBuffer)
    .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
    .webp()
    .toBuffer();

  // Only write to disk after sharp has successfully decoded the WebP buffer
  await writeFile(annotatedPath, webpBuffer);
  await writeFile(thumbnailPath, thumbnailBuffer);

  // Update DB record
  const now = new Date().toISOString();
  db.update(photos).set({ annotatedAt: now, updatedAt: now }).where(eq(photos.id, id)).run();

  const updated = getPhoto(db, id);
  if (!updated) throw new Error('Failed to retrieve updated photo after annotation save');
  return updated;
}

/**
 * Clear the annotated image for a photo.
 *
 * Removes annotated.webp, regenerates thumbnail.webp from original, nulls annotated_at.
 *
 * @throws NotFoundError if photo does not exist
 */
export async function clearAnnotation(
  db: DbType,
  photoStoragePath: string,
  id: string,
): Promise<void> {
  const existing = getPhoto(db, id);
  if (!existing) throw new NotFoundError('Photo not found');

  const photoDir = path.join(photoStoragePath, id);
  const annotatedPath = path.join(photoDir, 'annotated.webp');
  const thumbnailPath = path.join(photoDir, 'thumbnail.webp');

  // Remove annotated.webp (ignore if not present)
  try {
    await rm(annotatedPath, { force: true });
  } catch {
    // If file doesn't exist, that's fine
  }

  // Regenerate thumbnail from original
  const originalPath = await getPhotoFilePath(photoStoragePath, id, 'original', false);
  if (originalPath) {
    const thumbnailBuffer = await sharp(originalPath)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();
    await writeFile(thumbnailPath, thumbnailBuffer);
  }

  // Update DB record: null annotated_at
  const now = new Date().toISOString();
  db.update(photos).set({ annotatedAt: null, updatedAt: now }).where(eq(photos.id, id)).run();
}

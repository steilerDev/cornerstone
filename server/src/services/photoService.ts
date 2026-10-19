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
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { mkdir, rm, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { eq, and, asc, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { photos, users, areas, orientations, diaryEntries } from '../db/schema.js';
import {
  ConflictError,
  ImmutableEntryError,
  NotFoundError,
  ValidationError,
} from '../errors/AppError.js';
import { hasDiarySignatures, isDiaryEntrySignatureLocked } from '@cornerstone/shared';
import type {
  DiaryEntryStatus,
  Photo,
  PhotoEntityType,
  UpdatePhotoTagsRequest,
} from '@cornerstone/shared';
import type { UndoTransaction } from './undoService.js';

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
 * Build cache-busted asset URLs for a photo. The version param is annotatedAt
 * (if annotated) or updatedAt.
 */
export function buildPhotoAssetUrls(
  id: string,
  annotatedAt: string | null,
  updatedAt: string,
): { fileUrl: string; thumbnailUrl: string } {
  const v = encodeURIComponent(annotatedAt ?? updatedAt);
  return {
    fileUrl: `/api/photos/${id}/file?v=${v}`,
    thumbnailUrl: `/api/photos/${id}/thumbnail?v=${v}`,
  };
}

/**
 * Map a photos DB row + user + orientation to a Photo shape.
 * Includes cache-buster version param in thumbnailUrl based on annotatedAt (or updatedAt as fallback).
 */
function toPhoto(
  row: typeof photos.$inferSelect,
  user: typeof users.$inferSelect | null | undefined,
  orientation: typeof orientations.$inferSelect | null | undefined,
): Photo {
  const { thumbnailUrl } = buildPhotoAssetUrls(row.id, row.annotatedAt, row.updatedAt);

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
    areaId: row.areaId,
    orientationId: row.orientationId ?? null,
    orientation: orientation
      ? { id: orientation.id, name: orientation.name, description: orientation.description }
      : null,
    sortOrder: row.sortOrder,
    createdBy: user ? { id: user.id, displayName: user.displayName } : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    annotatedAt: row.annotatedAt ?? null,
    fileUrl: `/api/photos/${row.id}/file`,
    thumbnailUrl,
  };
}

/**
 * Resolve the user who created a photo.
 */
function resolveCreatedBy(db: DbType, createdBy: string | null): typeof users.$inferSelect | null {
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
 * @param areaId Optional area ID
 * @param orientationId Optional orientation ID
 * @throws ValidationError if MIME type not allowed or orientation not found
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
  areaId?: string | null,
  orientationId?: string | null,
): Promise<Photo> {
  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(`MIME type not allowed: ${mimeType}`);
  }

  // Validate areaId if provided and not null
  if (areaId !== undefined && areaId !== null) {
    const area = db.select().from(areas).where(eq(areas.id, areaId)).get();
    if (!area) {
      throw new ValidationError('Area not found');
    }
  }

  // Validate orientationId if provided and not null
  if (orientationId !== undefined && orientationId !== null) {
    const orientation = db
      .select()
      .from(orientations)
      .where(eq(orientations.id, orientationId))
      .get();
    if (!orientation) {
      throw new ValidationError('Orientation not found');
    }
  }

  const photoId = randomUUID();
  const photoDir = path.join(photoStoragePath, photoId);

  try {
    // Create photo directory
    await mkdir(photoDir, { recursive: true });

    // Process image with sharp
    let processedImage = sharp(fileBuffer);

    // Auto-rotate based on EXIF orientation FIRST (sharp does this by default with rotate())
    // Must call rotate() BEFORE metadata() to get post-rotation dimensions
    processedImage = processedImage.rotate();

    // Get image metadata (including dimensions after rotation)
    const metadata = await processedImage.metadata();

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
      areaId: areaId ?? null,
      orientationId: orientationId ?? null,
      sortOrder: 0,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(photos).values(row).run();

    // Fetch the inserted row with user info and orientation
    const insertedRow = db.select().from(photos).where(eq(photos.id, photoId)).get();

    if (!insertedRow) {
      throw new Error('Failed to retrieve inserted photo');
    }

    const user = resolveCreatedBy(db, insertedRow.createdBy);
    const orientation = insertedRow.orientationId
      ? db.select().from(orientations).where(eq(orientations.id, insertedRow.orientationId)).get()
      : null;
    return toPhoto(insertedRow, user, orientation);
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
  const orientation = row.orientationId
    ? db.select().from(orientations).where(eq(orientations.id, row.orientationId)).get()
    : null;
  return toPhoto(row, user, orientation);
}

/**
 * Get all photos for an entity, ordered by sortOrder then createdAt.
 *
 * @returns Array of Photo objects
 */
export function getPhotosForEntity(db: DbType, entityType: string, entityId: string): Photo[] {
  const rows = db
    .select()
    .from(photos)
    .where(and(eq(photos.entityType, entityType), eq(photos.entityId, entityId)))
    .orderBy(asc(photos.sortOrder), asc(photos.createdAt))
    .all();

  return rows.map((row) => {
    const user = resolveCreatedBy(db, row.createdBy);
    const orientation = row.orientationId
      ? db.select().from(orientations).where(eq(orientations.id, row.orientationId)).get()
      : null;
    return toPhoto(row, user, orientation);
  });
}

/**
 * Signature-lock decision for a loaded diary row: saved with a non-empty signatures array
 * in metadata. Drafts are never locked (#2124). Unparseable metadata fails open (not locked).
 */
export function isDiaryRowSignatureLocked(entry: {
  status: DiaryEntryStatus;
  metadata: string | null;
}): boolean {
  let parsed: unknown;
  try {
    parsed = entry.metadata ? JSON.parse(entry.metadata) : null;
  } catch {
    return false;
  }
  return isDiaryEntrySignatureLocked({
    isSigned: hasDiarySignatures(parsed),
    status: entry.status,
  });
}

/** Per-photo tag snapshot of a tag change; drives the Undo restore (#2226). */
export interface PhotoTagSnapshotEntry {
  photoId: string;
  before: { areaId: string | null; orientationId: string | null };
  after: { areaId: string | null; orientationId: string | null };
}

/**
 * Set area and/or orientation on several photos in one transaction (all or nothing).
 * An absent key leaves that tag unchanged, null clears it.
 *
 * @throws ValidationError unknown area / orientation
 * @throws NotFoundError a photo does not exist (details.missingPhotoIds)
 * @throws ImmutableEntryError a photo belongs to a signed, saved diary entry (details.lockedPhotoIds)
 */
export function updatePhotoTags(db: DbType, req: UpdatePhotoTagsRequest): PhotoTagSnapshotEntry[] {
  return db.transaction((tx) => {
    if (typeof req.areaId === 'string') {
      const area = tx.select({ id: areas.id }).from(areas).where(eq(areas.id, req.areaId)).get();
      if (!area) {
        throw new ValidationError('Area not found', { unknownAreaIds: [req.areaId] });
      }
    }
    if (typeof req.orientationId === 'string') {
      const orientation = tx
        .select({ id: orientations.id })
        .from(orientations)
        .where(eq(orientations.id, req.orientationId))
        .get();
      if (!orientation) {
        throw new ValidationError('Orientation not found', {
          unknownOrientationIds: [req.orientationId],
        });
      }
    }

    const rows = tx
      .select({
        id: photos.id,
        entityType: photos.entityType,
        entityId: photos.entityId,
        areaId: photos.areaId,
        orientationId: photos.orientationId,
      })
      .from(photos)
      .where(inArray(photos.id, req.photoIds))
      .all();

    const found = new Set(rows.map((r) => r.id));
    const missingPhotoIds = req.photoIds.filter((id) => !found.has(id));
    if (missingPhotoIds.length > 0) {
      throw new NotFoundError('Photo not found', { missingPhotoIds });
    }

    const entryIds = [
      ...new Set(rows.filter((r) => r.entityType === 'diary_entry').map((r) => r.entityId)),
    ];
    if (entryIds.length > 0) {
      const entries = tx
        .select({
          id: diaryEntries.id,
          status: diaryEntries.status,
          metadata: diaryEntries.metadata,
        })
        .from(diaryEntries)
        .where(inArray(diaryEntries.id, entryIds))
        .all();
      const lockedEntryIds = new Set(
        entries.filter((e) => isDiaryRowSignatureLocked(e)).map((e) => e.id),
      );
      const lockedPhotoIds = rows
        .filter((r) => r.entityType === 'diary_entry' && lockedEntryIds.has(r.entityId))
        .map((r) => r.id);
      if (lockedPhotoIds.length > 0) {
        throw new ImmutableEntryError('Signed diary entries cannot be modified', {
          lockedPhotoIds,
        });
      }
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const snapshot: PhotoTagSnapshotEntry[] = req.photoIds.map((photoId) => {
      const row = byId.get(photoId)!;
      return {
        photoId,
        before: { areaId: row.areaId, orientationId: row.orientationId },
        after: {
          areaId: req.areaId !== undefined ? req.areaId : row.areaId,
          orientationId: req.orientationId !== undefined ? req.orientationId : row.orientationId,
        },
      };
    });

    const set: Partial<typeof photos.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (req.areaId !== undefined) set.areaId = req.areaId;
    if (req.orientationId !== undefined) set.orientationId = req.orientationId;
    tx.update(photos).set(set).where(inArray(photos.id, req.photoIds)).run();

    return snapshot;
  });
}

/**
 * Undo of a tag change. Runs inside the undo transaction.
 *
 * @throws ConflictError when any photo is gone, its tags differ from the snapshot's `after`,
 *   or its diary entry is now signature-locked or gone
 */
export function restorePhotoTags(tx: UndoTransaction, entries: PhotoTagSnapshotEntry[]): void {
  const ids = entries.map((e) => e.photoId);
  const rows = tx
    .select({
      id: photos.id,
      entityType: photos.entityType,
      entityId: photos.entityId,
      areaId: photos.areaId,
      orientationId: photos.orientationId,
    })
    .from(photos)
    .where(inArray(photos.id, ids))
    .all();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const entryIds = [
    ...new Set(rows.filter((r) => r.entityType === 'diary_entry').map((r) => r.entityId)),
  ];
  const entryRows =
    entryIds.length > 0
      ? tx
          .select({
            id: diaryEntries.id,
            status: diaryEntries.status,
            metadata: diaryEntries.metadata,
          })
          .from(diaryEntries)
          .where(inArray(diaryEntries.id, entryIds))
          .all()
      : [];
  const entryById = new Map(entryRows.map((e) => [e.id, e]));

  const changed: string[] = [];
  for (const entry of entries) {
    const row = byId.get(entry.photoId);
    if (
      !row ||
      row.areaId !== entry.after.areaId ||
      row.orientationId !== entry.after.orientationId
    ) {
      changed.push(entry.photoId);
      continue;
    }
    if (row.entityType === 'diary_entry') {
      const diary = entryById.get(row.entityId);
      if (!diary || isDiaryRowSignatureLocked(diary)) changed.push(entry.photoId);
    }
  }
  if (changed.length > 0) {
    throw new ConflictError('The record changed after this action', {
      changed: changed.map((id) => ({ type: 'photo', id })),
    });
  }

  const areaIds = [...new Set(entries.map((e) => e.before.areaId).filter((v): v is string => !!v))];
  const orientationIds = [
    ...new Set(entries.map((e) => e.before.orientationId).filter((v): v is string => !!v)),
  ];
  const existingAreas = new Set(
    areaIds.length > 0
      ? tx
          .select({ id: areas.id })
          .from(areas)
          .where(inArray(areas.id, areaIds))
          .all()
          .map((a) => a.id)
      : [],
  );
  const existingOrientations = new Set(
    orientationIds.length > 0
      ? tx
          .select({ id: orientations.id })
          .from(orientations)
          .where(inArray(orientations.id, orientationIds))
          .all()
          .map((o) => o.id)
      : [],
  );

  const now = new Date().toISOString();
  for (const entry of entries) {
    const areaId =
      entry.before.areaId && existingAreas.has(entry.before.areaId) ? entry.before.areaId : null;
    const orientationId =
      entry.before.orientationId && existingOrientations.has(entry.before.orientationId)
        ? entry.before.orientationId
        : null;
    tx.update(photos)
      .set({ areaId, orientationId, updatedAt: now })
      .where(eq(photos.id, entry.photoId))
      .run();
  }
}

/**
 * Update a photo's caption, areaId, orientationId and/or sort order.
 *
 * @returns Updated Photo object or null if not found
 */
export function updatePhoto(
  db: DbType,
  id: string,
  updates: {
    caption?: string | null;
    areaId?: string | null;
    orientationId?: string | null;
    sortOrder?: number;
  },
): Photo | null {
  const row = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!row) return null;

  // Validate areaId if provided and not null
  if (updates.areaId !== undefined && updates.areaId !== null) {
    const area = db.select().from(areas).where(eq(areas.id, updates.areaId)).get();
    if (!area) {
      throw new ValidationError('Area not found');
    }
  }

  // Validate orientationId if provided and not null
  if (updates.orientationId !== undefined && updates.orientationId !== null) {
    const orientation = db
      .select()
      .from(orientations)
      .where(eq(orientations.id, updates.orientationId))
      .get();
    if (!orientation) {
      throw new ValidationError('Orientation not found');
    }
  }

  const now = new Date().toISOString();
  const updateData: Partial<typeof photos.$inferInsert> = {
    updatedAt: now,
  };

  if (updates.caption !== undefined) {
    updateData.caption = updates.caption;
  }
  if (updates.areaId !== undefined) {
    updateData.areaId = updates.areaId;
  }
  if (updates.orientationId !== undefined) {
    updateData.orientationId = updates.orientationId;
  }
  if (updates.sortOrder !== undefined) {
    updateData.sortOrder = updates.sortOrder;
  }

  db.update(photos).set(updateData).where(eq(photos.id, id)).run();

  const updated = db.select().from(photos).where(eq(photos.id, id)).get();
  if (!updated) return null;

  const user = resolveCreatedBy(db, updated.createdBy);
  const orientation = updated.orientationId
    ? db.select().from(orientations).where(eq(orientations.id, updated.orientationId)).get()
    : null;
  return toPhoto(updated, user, orientation);
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
export async function deletePhoto(db: DbType, photoStoragePath: string, id: string): Promise<void> {
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

// ─── Undoable delete (#2221) ──────────────────────────────────────────────────

/** Row snapshot of a trashed photo, held in memory with its undo token. */
export interface PhotoDeleteSnapshot {
  row: typeof photos.$inferSelect;
  /** Set when moving the files into the trash failed (not ENOENT); the caller logs it. */
  moveError?: unknown;
}

/** Minimal logger shape (a Fastify request or app logger). */
export interface WarnLogger {
  warn(obj: object, msg: string): void;
}

/** The undo transaction, as far as the restore needs it. */
type RestoreTx = Pick<DbType, 'select' | 'insert'>;

/** Directory holding photos removed inside their Undo window. */
export function photoTrashDir(photoStoragePath: string): string {
  return path.join(photoStoragePath, '.trash');
}

/**
 * Delete the photo row, then move its directory into the trash in one rename.
 * A missing directory is fine; any other move failure leaves the directory in place.
 *
 * @throws NotFoundError when the photo does not exist
 */
export function trashPhoto(db: DbType, photoStoragePath: string, id: string): PhotoDeleteSnapshot {
  const row = db.transaction((tx) => {
    const found = tx.select().from(photos).where(eq(photos.id, id)).get();
    if (!found) throw new NotFoundError('Photo not found');
    tx.delete(photos).where(eq(photos.id, id)).run();
    return found;
  });

  const trash = photoTrashDir(photoStoragePath);
  try {
    mkdirSync(trash, { recursive: true });
    renameSync(path.join(photoStoragePath, id), path.join(trash, id));
  } catch (err) {
    // ENOENT: nothing to move. Anything else: the directory stays in place (restore accepts it
    // there, discard removes it) and the error is handed back for logging.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return { row, moveError: err };
  }
  return { row };
}

/**
 * Re-insert a trashed photo and move its files back. Runs inside the undo transaction.
 *
 * @throws ConflictError when the parent diary entry is gone, automatic, or saved and signed
 * @throws NotFoundError when the files exist neither in the trash nor in place
 */
export function restoreTrashedPhoto(
  tx: RestoreTx,
  photoStoragePath: string,
  snapshot: PhotoDeleteSnapshot,
): void {
  const row = { ...snapshot.row };
  const conflict = (): ConflictError =>
    new ConflictError('The record changed after this action', {
      changed: [{ type: 'photo', id: row.id }],
    });

  if (row.entityType === 'diary_entry') {
    const entry = tx
      .select({
        isAutomatic: diaryEntries.isAutomatic,
        status: diaryEntries.status,
        metadata: diaryEntries.metadata,
      })
      .from(diaryEntries)
      .where(eq(diaryEntries.id, row.entityId))
      .get();
    if (!entry || entry.isAutomatic) throw conflict();
    let parsed: unknown;
    try {
      parsed = entry.metadata ? JSON.parse(entry.metadata) : null;
    } catch {
      parsed = null; // fail open, as the photo routes do
    }
    if (
      isDiaryEntrySignatureLocked({ isSigned: hasDiarySignatures(parsed), status: entry.status })
    ) {
      throw conflict();
    }
  }

  if (
    row.areaId &&
    !tx.select({ id: areas.id }).from(areas).where(eq(areas.id, row.areaId)).get()
  ) {
    row.areaId = null;
  }
  if (
    row.orientationId &&
    !tx
      .select({ id: orientations.id })
      .from(orientations)
      .where(eq(orientations.id, row.orientationId))
      .get()
  ) {
    row.orientationId = null;
  }
  if (
    row.createdBy &&
    !tx.select({ id: users.id }).from(users).where(eq(users.id, row.createdBy)).get()
  ) {
    row.createdBy = null;
  }

  const trashed = path.join(photoTrashDir(photoStoragePath), row.id);
  const live = path.join(photoStoragePath, row.id);
  const inTrash = existsSync(trashed);
  if (!inTrash && !existsSync(live)) throw new NotFoundError('Undo is no longer available');

  tx.insert(photos).values(row).run();
  if (inTrash) renameSync(trashed, live);
}

/**
 * Undo discard step: remove the photo's files from the trash and from the live tree. Safe because
 * discard only runs when the photo was not restored, so its row is already gone. Covers a failed
 * move into the trash and a restore whose rename succeeded but whose transaction rolled back.
 * Paths are built only from the stored id. Never throws.
 */
export function purgeTrashedPhoto(photoStoragePath: string, id: string, log?: WarnLogger): void {
  for (const dir of [
    path.join(photoTrashDir(photoStoragePath), id),
    path.join(photoStoragePath, id),
  ]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      // Best effort; the startup sweep removes trash leftovers.
      log?.warn({ err, photoId: id }, 'Failed to remove a discarded photo');
    }
  }
}

/** Empty the whole trash (startup sweep: pending tokens do not survive a restart). */
export async function purgePhotoTrash(photoStoragePath: string): Promise<void> {
  await rm(photoTrashDir(photoStoragePath), { recursive: true, force: true });
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
 * When preferAnnotated is true and annotated.webp exists, returns it instead.
 * For 'thumbnail', returns the thumbnail.webp path.
 *
 * @param variant 'original' or 'thumbnail'
 * @param preferAnnotated When variant is 'original', prefer annotated.webp if it exists (default: true)
 * @returns Full file path or null if not found
 */
export async function getPhotoFilePath(
  photoStoragePath: string,
  id: string,
  variant: 'original' | 'thumbnail',
  preferAnnotated: boolean = true,
): Promise<string | null> {
  const photoDir = path.join(photoStoragePath, id);

  try {
    if (variant === 'thumbnail') {
      const thumbnailPath = path.join(photoDir, 'thumbnail.webp');
      await stat(thumbnailPath);
      return thumbnailPath;
    } else {
      // original: prefer annotated.webp if requested and exists
      if (preferAnnotated) {
        const annotatedPath = path.join(photoDir, 'annotated.webp');
        try {
          await stat(annotatedPath);
          return annotatedPath;
        } catch {
          // annotated.webp doesn't exist; fall through to original
        }
      }
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

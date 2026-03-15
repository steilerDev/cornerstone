/**
 * Diary service — CRUD for construction diary entries (Bautagebuch).
 *
 * EPIC-13: Construction Diary
 *
 * Manages manual and automatic diary entries with type-specific metadata validation.
 * Supports pagination, filtering, and photo attachment management.
 */

import { randomUUID } from 'node:crypto';
import { eq, desc, and, or, gte, lte, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { diaryEntries, photos, users } from '../db/schema.js';
import {
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  InvalidMetadataError,
  ImmutableEntryError,
  InvalidEntryTypeError,
} from '../errors/AppError.js';
import { deletePhotosForEntity } from './photoService.js';
import type {
  DiaryEntrySummary,
  DiaryEntryDetail,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  DiaryEntryListQuery,
  DiaryUserSummary,
  ManualDiaryEntryType,
  DiaryEntryMetadata,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
} from '@cornerstone/shared';
import type { PaginationMeta } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Manual diary entry types that can be created by users.
 */
const MANUAL_ENTRY_TYPES = new Set<ManualDiaryEntryType>([
  'daily_log',
  'site_visit',
  'delivery',
  'issue',
  'general_note',
]);

/**
 * Convert database user row to DiaryUserSummary shape.
 */
function toDiaryUserSummary(user: typeof users.$inferSelect | null): DiaryUserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
  };
}

/**
 * Parse metadata from JSON string, returning null if not present or invalid.
 */
function parseMetadata(metadata: string | null): DiaryEntryMetadata | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata);
  } catch {
    return null;
  }
}

/**
 * Convert database diary entry row to DiaryEntrySummary shape.
 * Includes photo count aggregated from photos table.
 */
function toDiarySummary(
  entry: typeof diaryEntries.$inferSelect,
  user: typeof users.$inferSelect | null,
  photoCount: number,
): DiaryEntrySummary {
  const metadata = parseMetadata(entry.metadata);
  const isSigned = Boolean(
    metadata &&
      'signatures' in metadata &&
      Array.isArray(metadata.signatures) &&
      metadata.signatures.length > 0,
  );

  return {
    id: entry.id,
    entryType: entry.entryType as any,
    entryDate: entry.entryDate,
    title: entry.title,
    body: entry.body,
    metadata,
    isAutomatic: entry.isAutomatic,
    isSigned,
    sourceEntityType: entry.sourceEntityType as any,
    sourceEntityId: entry.sourceEntityId,
    photoCount,
    createdBy: toDiaryUserSummary(user),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Validate metadata structure for a given entry type.
 * @throws InvalidMetadataError if metadata does not match schema
 */
function validateMetadata(
  entryType: string,
  metadata: DiaryEntryMetadata | null | undefined,
): void {
  if (!metadata) return;

  const md = metadata as Record<string, unknown>;

  switch (entryType) {
    case 'daily_log': {
      const dlm = md as DailyLogMetadata;
      // Validate weather enum
      if (dlm.weather !== undefined && dlm.weather !== null) {
        const validWeathers = ['sunny', 'cloudy', 'rainy', 'snowy', 'stormy', 'other'];
        if (!validWeathers.includes(dlm.weather)) {
          throw new InvalidMetadataError(
            `daily_log weather must be one of: ${validWeathers.join(', ')}`,
          );
        }
      }
      // Validate temperatureCelsius is number or null
      if (dlm.temperatureCelsius !== undefined && dlm.temperatureCelsius !== null) {
        if (typeof dlm.temperatureCelsius !== 'number') {
          throw new InvalidMetadataError('daily_log temperatureCelsius must be a number or null');
        }
      }
      // Validate workersOnSite is integer >= 0 or null
      if (dlm.workersOnSite !== undefined && dlm.workersOnSite !== null) {
        if (!Number.isInteger(dlm.workersOnSite) || dlm.workersOnSite < 0) {
          throw new InvalidMetadataError(
            'daily_log workersOnSite must be a non-negative integer or null',
          );
        }
      }
      // Validate signatures array
      if (dlm.signatures !== undefined && dlm.signatures !== null) {
        if (!Array.isArray(dlm.signatures)) {
          throw new InvalidMetadataError('daily_log signatures must be an array or null');
        }
        for (const sig of dlm.signatures) {
          if (typeof sig.signerName !== 'string' || sig.signerName.trim().length === 0) {
            throw new InvalidMetadataError(
              'daily_log signature entry must have non-empty signerName',
            );
          }
          if (!['self', 'vendor'].includes(sig.signerType)) {
            throw new InvalidMetadataError(
              'daily_log signature entry signerType must be "self" or "vendor"',
            );
          }
          if (typeof sig.signatureDataUrl !== 'string' || sig.signatureDataUrl.trim().length === 0) {
            throw new InvalidMetadataError(
              'daily_log signature entry must have non-empty signatureDataUrl',
            );
          }
        }
      }
      break;
    }

    case 'site_visit': {
      const svm = md as SiteVisitMetadata;
      // Validate inspectorName is string or null
      if (svm.inspectorName !== undefined && svm.inspectorName !== null) {
        if (typeof svm.inspectorName !== 'string') {
          throw new InvalidMetadataError('site_visit inspectorName must be a string or null');
        }
      }
      // Validate outcome enum
      if (svm.outcome !== undefined && svm.outcome !== null) {
        const validOutcomes = ['pass', 'fail', 'conditional'];
        if (!validOutcomes.includes(svm.outcome)) {
          throw new InvalidMetadataError(
            `site_visit outcome must be one of: ${validOutcomes.join(', ')}`,
          );
        }
      }
      // Validate signatures array
      if (svm.signatures !== undefined && svm.signatures !== null) {
        if (!Array.isArray(svm.signatures)) {
          throw new InvalidMetadataError('site_visit signatures must be an array or null');
        }
        for (const sig of svm.signatures) {
          if (typeof sig.signerName !== 'string' || sig.signerName.trim().length === 0) {
            throw new InvalidMetadataError(
              'site_visit signature entry must have non-empty signerName',
            );
          }
          if (!['self', 'vendor'].includes(sig.signerType)) {
            throw new InvalidMetadataError(
              'site_visit signature entry signerType must be "self" or "vendor"',
            );
          }
          if (typeof sig.signatureDataUrl !== 'string' || sig.signatureDataUrl.trim().length === 0) {
            throw new InvalidMetadataError(
              'site_visit signature entry must have non-empty signatureDataUrl',
            );
          }
        }
      }
      break;
    }

    case 'delivery': {
      const dm = md as DeliveryMetadata;
      // Validate vendor is string or null
      if (dm.vendor !== undefined && dm.vendor !== null) {
        if (typeof dm.vendor !== 'string') {
          throw new InvalidMetadataError('delivery vendor must be a string or null');
        }
      }
      // Validate materials is array of strings or null
      if (dm.materials !== undefined && dm.materials !== null) {
        if (!Array.isArray(dm.materials)) {
          throw new InvalidMetadataError('delivery materials must be an array or null');
        }
        if (!dm.materials.every((m) => typeof m === 'string')) {
          throw new InvalidMetadataError('delivery materials must be an array of strings');
        }
      }
      // Validate deliveryConfirmed is boolean
      if (dm.deliveryConfirmed !== undefined && typeof dm.deliveryConfirmed !== 'boolean') {
        throw new InvalidMetadataError('delivery deliveryConfirmed must be a boolean');
      }
      break;
    }

    case 'issue': {
      const im = md as IssueMetadata;
      // Validate severity enum
      if (im.severity !== undefined && im.severity !== null) {
        const validSeverities = ['low', 'medium', 'high', 'critical'];
        if (!validSeverities.includes(im.severity)) {
          throw new InvalidMetadataError(
            `issue severity must be one of: ${validSeverities.join(', ')}`,
          );
        }
      }
      // Validate resolutionStatus enum
      if (im.resolutionStatus !== undefined && im.resolutionStatus !== null) {
        const validStatuses = ['open', 'in_progress', 'resolved'];
        if (!validStatuses.includes(im.resolutionStatus)) {
          throw new InvalidMetadataError(
            `issue resolutionStatus must be one of: ${validStatuses.join(', ')}`,
          );
        }
      }
      break;
    }

    case 'general_note':
      // general_note accepts any metadata structure
      break;

    default:
      // For automatic types, validate less strictly
      break;
  }
}

/**
 * List diary entries with pagination, filtering, and search.
 */
export function listDiaryEntries(
  db: DbType,
  query: DiaryEntryListQuery,
): { items: DiaryEntrySummary[]; pagination: PaginationMeta } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));

  // Build WHERE conditions
  const conditions: SQL<unknown>[] = [];

  if (query.type) {
    type EntryTypeValue = typeof diaryEntries.entryType._.data;
    const types = query.type
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean) as EntryTypeValue[];
    if (types.length === 1) {
      conditions.push(eq(diaryEntries.entryType, types[0]));
    } else if (types.length > 1) {
      conditions.push(inArray(diaryEntries.entryType, types));
    }
  }

  if (query.dateFrom) {
    conditions.push(gte(diaryEntries.entryDate, query.dateFrom));
  }

  if (query.dateTo) {
    conditions.push(lte(diaryEntries.entryDate, query.dateTo));
  }

  if (query.automatic !== undefined) {
    conditions.push(eq(diaryEntries.isAutomatic, query.automatic));
  }

  if (query.q) {
    // Escape SQL LIKE wildcards
    const escapedQ = query.q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escapedQ}%`;
    conditions.push(
      or(
        sql`LOWER(${diaryEntries.title}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${diaryEntries.body}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total items
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(diaryEntries)
    .where(whereClause)
    .get();
  const totalItems = countResult?.count ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Fetch paginated entries with users and photo counts
  const offset = (page - 1) * pageSize;
  const entryRows = db
    .select({
      entry: diaryEntries,
      user: users,
    })
    .from(diaryEntries)
    .leftJoin(users, eq(users.id, diaryEntries.createdBy))
    .where(whereClause)
    .orderBy(desc(diaryEntries.entryDate), desc(diaryEntries.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all();

  const items = entryRows.map((row) => {
    const photoCount = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(photos)
      .where(and(eq(photos.entityType, 'diary_entry'), eq(photos.entityId, row.entry.id)))
      .get();
    return toDiarySummary(row.entry, row.user, photoCount?.count ?? 0);
  });

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

/**
 * Get a single diary entry by ID.
 * @throws NotFoundError if entry does not exist
 */
export function getDiaryEntry(db: DbType, id: string): DiaryEntryDetail {
  const row = db
    .select({
      entry: diaryEntries,
      user: users,
    })
    .from(diaryEntries)
    .leftJoin(users, eq(users.id, diaryEntries.createdBy))
    .where(eq(diaryEntries.id, id))
    .get();

  if (!row) {
    throw new NotFoundError('Diary entry not found');
  }

  const photoCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(photos)
    .where(and(eq(photos.entityType, 'diary_entry'), eq(photos.entityId, id)))
    .get();

  return toDiarySummary(row.entry, row.user, photoCount?.count ?? 0);
}

/**
 * Create a new diary entry.
 * Only manual entry types can be created by users; automatic types are system-generated.
 * @throws ValidationError if entryType is automatic
 * @throws InvalidMetadataError if metadata validation fails
 */
export function createDiaryEntry(
  db: DbType,
  userId: string,
  data: CreateDiaryEntryRequest,
): DiaryEntrySummary {
  // Validate entry type is manual
  if (!MANUAL_ENTRY_TYPES.has(data.entryType)) {
    throw new InvalidEntryTypeError(
      'Only manual entry types can be created: daily_log, site_visit, delivery, issue, general_note',
    );
  }

  // Validate body is not empty
  const trimmedBody = data.body.trim();
  if (trimmedBody.length === 0) {
    throw new ValidationError('Entry body cannot be empty');
  }

  // Validate metadata
  validateMetadata(data.entryType, data.metadata);

  // Create entry
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(diaryEntries)
    .values({
      id,
      entryType: data.entryType,
      entryDate: data.entryDate,
      title: data.title || null,
      body: trimmedBody,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      isAutomatic: false,
      sourceEntityType: null,
      sourceEntityId: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Fetch created entry
  const user = db.select().from(users).where(eq(users.id, userId)).get() || null;

  return toDiarySummary(
    {
      id,
      entryType: data.entryType,
      entryDate: data.entryDate,
      title: data.title || null,
      body: trimmedBody,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      isAutomatic: false,
      sourceEntityType: null,
      sourceEntityId: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    },
    user,
    0,
  );
}

/**
 * Update a diary entry.
 * Cannot update automatic entries.
 * @throws NotFoundError if entry does not exist
 * @throws ImmutableEntryError if entry is automatic
 * @throws InvalidMetadataError if metadata validation fails
 */
export function updateDiaryEntry(
  db: DbType,
  id: string,
  data: UpdateDiaryEntryRequest,
): DiaryEntrySummary {
  // Fetch entry
  const entry = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();

  if (!entry) {
    throw new NotFoundError('Diary entry not found');
  }

  // Cannot update automatic entries
  if (entry.isAutomatic) {
    throw new ImmutableEntryError();
  }

  // Cannot update signed entries
  const metadata = parseMetadata(entry.metadata);
  const isSigned = Boolean(
    metadata &&
      'signatures' in metadata &&
      Array.isArray(metadata.signatures) &&
      metadata.signatures.length > 0,
  );
  if (isSigned) {
    throw new ImmutableEntryError('Signed diary entries cannot be modified');
  }

  // Validate body if provided
  if (data.body !== undefined) {
    const trimmedBody = data.body.trim();
    if (trimmedBody.length === 0) {
      throw new ValidationError('Entry body cannot be empty');
    }
  }

  // Validate metadata if provided
  if (data.metadata !== undefined) {
    validateMetadata(entry.entryType, data.metadata);
  }

  // Update entry
  const now = new Date().toISOString();
  db.update(diaryEntries)
    .set({
      entryDate: data.entryDate ?? entry.entryDate,
      title: data.title !== undefined ? data.title : entry.title,
      body: data.body ? data.body.trim() : entry.body,
      metadata: data.metadata !== undefined ? JSON.stringify(data.metadata) : entry.metadata,
      updatedAt: now,
    })
    .where(eq(diaryEntries.id, id))
    .run();

  // Fetch updated entry
  const row = db
    .select({
      entry: diaryEntries,
      user: users,
    })
    .from(diaryEntries)
    .leftJoin(users, eq(users.id, diaryEntries.createdBy))
    .where(eq(diaryEntries.id, id))
    .get();

  const photoCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(photos)
    .where(and(eq(photos.entityType, 'diary_entry'), eq(photos.entityId, id)))
    .get();

  return toDiarySummary(row!.entry, row!.user, photoCount?.count ?? 0);
}

/**
 * Delete a diary entry and cascade-delete associated photos.
 * @throws NotFoundError if entry does not exist
 */
export async function deleteDiaryEntry(
  db: DbType,
  id: string,
  photoStoragePath: string,
): Promise<void> {
  // Fetch entry
  const entry = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();

  if (!entry) {
    throw new NotFoundError('Diary entry not found');
  }

  // Delete associated photos
  await deletePhotosForEntity(db, photoStoragePath, 'diary_entry', id);

  // Delete entry
  db.delete(diaryEntries).where(eq(diaryEntries.id, id)).run();
}

/**
 * Create an automatic diary entry (system-generated on state changes).
 * For internal use only; not exposed via API.
 */
export function createAutomaticDiaryEntry(
  db: DbType,
  entryType: string,
  entryDate: string,
  body: string,
  metadata: DiaryEntryMetadata | null,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
): void {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(diaryEntries)
    .values({
      id,
      entryType: entryType as typeof diaryEntries.entryType._.data,
      entryDate,
      title: null,
      body,
      metadata: metadata ? JSON.stringify(metadata) : null,
      isAutomatic: true,
      sourceEntityType,
      sourceEntityId,
      createdBy: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

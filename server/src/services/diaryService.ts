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
import type { areas } from '../db/schema.js';
import {
  diaryEntries,
  photos,
  users,
  workItems,
  invoices,
  milestones,
  vendors,
  subsidyPrograms,
  budgetSources,
} from '../db/schema.js';
import {
  NotFoundError,
  ValidationError,
  InvalidMetadataError,
  ImmutableEntryError,
  InvalidEntryTypeError,
  AlreadySavedError,
} from '../errors/AppError.js';
import { toLikeContainsPattern } from './shared/likePattern.js';
import { isValidIsoDate } from './shared/validators.js';
import { buildPhotoAssetUrls, deletePhotosForEntity } from './photoService.js';
import type {
  DiaryEntrySummary,
  DiaryEntryDetail,
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  PromoteDiaryEntryRequest,
  DiaryEntryListQuery,
  DiaryFilterOptions,
  DiaryPhotoThumbnail,
  DiaryEntryLookupQuery,
  DiaryEntryLookupMatch,
  DiaryEntryLookupResponse,
  DiaryUserSummary,
  ManualDiaryEntryType,
  DiaryEntryMetadata,
  DiaryEntryStatus,
  DailyLogMetadata,
  SiteVisitMetadata,
  DeliveryMetadata,
  IssueMetadata,
  DiarySignatureEntry,
  DiaryEntryType,
  DiarySourceEntityType,
  AreaSummary,
  SystemEventMetadataV1,
  AutomaticDiaryEntryType,
  SystemEventRepeat,
} from '@cornerstone/shared';
import type { PaginationMeta } from '@cornerstone/shared';
import {
  hasDiarySignatures,
  isDiaryEntrySignatureLocked,
  MAX_SIGNATURES_PER_ENTRY,
  foldSearchText,
  MAX_SIGNER_NAME_LENGTH,
  MAX_SIGNATURE_DATA_URL_LENGTH,
  SIGNATURE_DATA_URL_PATTERN,
  SIGNED_AT_PATTERN,
  DIARY_TYPE_METADATA_KEYS,
  DIARY_WEATHERS,
  DIARY_INSPECTION_OUTCOMES,
  DIARY_ISSUE_SEVERITIES,
  DIARY_LIST_THUMBNAIL_LIMIT,
  MANUAL_DIARY_ENTRY_TYPES,
} from '@cornerstone/shared';
import { listDisplayRows, type DisplayRow } from './systemEventDisplay.js';
import {
  getDescendantIds,
  loadAreaMap,
  resolveAreaAncestors,
  type AreaMapEntry,
} from './areaService.js';
import { toAreaSummary } from './shared/converters.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Rejects values that match SIGNED_AT_PATTERN but contain impossible components
 * (e.g. 2026-02-30, hour 24) which Date.parse would silently roll over.
 * Takes the match produced by SIGNED_AT_PATTERN so the grammar is defined once.
 */
function hasValidCalendarComponents(match: RegExpMatchArray): boolean {
  const g = match.groups!;
  const year = Number(g.year);
  const month = Number(g.month);
  const day = Number(g.day);
  // setUTCFullYear does not remap years 0-99 to 1900-1999 (unlike Date.UTC)
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  // The full round-trip rejects out-of-range months and days (they roll over).
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    Number(g.hour) <= 23 &&
    Number(g.minute) <= 59 &&
    Number(g.second ?? 0) <= 59 &&
    Number(g.offsetHour ?? 0) <= 23 &&
    Number(g.offsetMinute ?? 0) <= 59
  );
}

/**
 * Validate a metadata signatures array (daily_log, site_visit, issue).
 * Also normalises in place: each `signerName` is replaced by its trimmed form, so callers
 * must persist the same object they validated.
 * @throws InvalidMetadataError if malformed
 */
function validateSignatures(entryType: string, signatures: unknown): void {
  if (signatures === undefined || signatures === null) return;
  if (!Array.isArray(signatures)) {
    throw new InvalidMetadataError(`${entryType} signatures must be an array or null`);
  }
  if (signatures.length > MAX_SIGNATURES_PER_ENTRY) {
    throw new InvalidMetadataError(
      `${entryType} signatures must not exceed ${MAX_SIGNATURES_PER_ENTRY} entries`,
    );
  }
  for (const raw of signatures) {
    if (typeof raw !== 'object' || raw === null) {
      throw new InvalidMetadataError(`${entryType} signature entry must be an object`);
    }
    const sig = raw as Partial<DiarySignatureEntry>;
    if (typeof sig.signerName !== 'string' || sig.signerName.trim().length === 0) {
      throw new InvalidMetadataError(`${entryType} signature entry must have non-empty signerName`);
    }
    if (sig.signerName.trim().length > MAX_SIGNER_NAME_LENGTH) {
      throw new InvalidMetadataError(
        `${entryType} signature entry signerName must not exceed ${MAX_SIGNER_NAME_LENGTH} characters`,
      );
    }
    if (!sig.signerType || !['self', 'vendor'].includes(sig.signerType)) {
      throw new InvalidMetadataError(
        `${entryType} signature entry signerType must be "self" or "vendor"`,
      );
    }
    if (typeof sig.signatureDataUrl !== 'string' || sig.signatureDataUrl.trim().length === 0) {
      throw new InvalidMetadataError(
        `${entryType} signature entry must have non-empty signatureDataUrl`,
      );
    }
    if (
      sig.signatureDataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH ||
      !SIGNATURE_DATA_URL_PATTERN.test(sig.signatureDataUrl)
    ) {
      throw new InvalidMetadataError(
        `${entryType} signature entry signatureDataUrl must be a base64 png, jpeg or webp data URL of at most ${MAX_SIGNATURE_DATA_URL_LENGTH / 1024} KB`,
      );
    }
    if (sig.signedAt !== undefined) {
      if (typeof sig.signedAt !== 'string' || sig.signedAt.trim().length === 0) {
        throw new InvalidMetadataError(
          `${entryType} signature entry signedAt must be a non-empty string if provided`,
        );
      }
      const signedAtMatch = SIGNED_AT_PATTERN.exec(sig.signedAt);
      if (!signedAtMatch || !hasValidCalendarComponents(signedAtMatch)) {
        throw new InvalidMetadataError(
          `${entryType} signature entry signedAt must be a valid date`,
        );
      }
    }
    // Normalise: persist the trimmed name (callers store this same metadata object).
    sig.signerName = sig.signerName.trim();
  }
}

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

/** Maximum matches returned by the lookup (contract 5). */
const LOOKUP_LIMIT = 5;
/** Maximum length of the lookup title parameter. */
const MAX_LOOKUP_TITLE_LENGTH = 1000;

/** Trim a title; null, undefined and blank all become null. */
function normalizeTitle(title: string | null | undefined): string | null {
  if (title === null || title === undefined) return null;
  const trimmed = title.trim();
  return trimmed === '' ? null : trimmed;
}

/** @throws ValidationError unless the value is a real calendar date (YYYY-MM-DD). */
function assertValidEntryDate(value: string): void {
  if (!isValidIsoDate(value)) {
    throw new ValidationError('Entry date must be a valid date in YYYY-MM-DD format', {
      field: 'entryDate',
    });
  }
}

/** Number of photos attached to a diary entry. */
function countEntryPhotos(db: DbType, id: string): number {
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(photos)
    .where(and(eq(photos.entityType, 'diary_entry'), eq(photos.entityId, id)))
    .get();
  return row?.count ?? 0;
}

/**
 * Content rule for saved entries (#2220): a title, text or at least one photo.
 * @throws ValidationError otherwise
 */
function assertHasContent(title: string | null, body: string, photoCount: number): void {
  if ((title === null || title.trim() === '') && body.trim() === '' && photoCount === 0) {
    throw new ValidationError('A saved entry needs a title, text or at least one photo', {
      fields: ['title', 'body', 'photos'],
    });
  }
}

/**
 * Keep only the metadata keys the target type knows; an empty result is null (#2220).
 */
function filterMetadataForType(
  metadata: DiaryEntryMetadata | null | undefined,
  type: ManualDiaryEntryType,
): DiaryEntryMetadata | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const source = metadata as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const key of DIARY_TYPE_METADATA_KEYS[type]) {
    if (key in source) kept[key] = source[key];
  }
  return Object.keys(kept).length === 0 ? null : (kept as DiaryEntryMetadata);
}

/**
 * Validate workStart/workEnd (HH:mm or null, end strictly after start) for daily_log
 * and site_visit metadata.
 * @throws InvalidMetadataError
 */
function validateWorkTimes(
  entryType: string,
  md: { workStart?: unknown; workEnd?: unknown },
): void {
  const HH_MM_REGEX = /^\d{2}:\d{2}$/;
  if (md.workStart !== undefined && md.workStart !== null) {
    if (typeof md.workStart !== 'string' || !HH_MM_REGEX.test(md.workStart)) {
      throw new InvalidMetadataError(
        `${entryType} workStart must be a valid HH:mm time string or null`,
      );
    }
  }
  if (md.workEnd !== undefined && md.workEnd !== null) {
    if (typeof md.workEnd !== 'string' || !HH_MM_REGEX.test(md.workEnd)) {
      throw new InvalidMetadataError(
        `${entryType} workEnd must be a valid HH:mm time string or null`,
      );
    }
  }
  if (md.workStart && md.workEnd) {
    if ((md.workEnd as string) <= (md.workStart as string)) {
      throw new InvalidMetadataError(`${entryType} workEnd must be strictly after workStart`);
    }
  }
}

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

/** A resolved source entity: live display name and whether the subject still exists. */
interface ResolvedSourceEntity {
  title: string | null;
  /** true/false for work_item, invoice, milestone and subsidy_program; undefined otherwise. */
  exists: boolean | undefined;
}

/**
 * Resolve the live name of a source entity based on its type and ID, and whether it still exists.
 * `title` is null when the type is null/unknown, the entity is gone, or it has no name
 * (invoice without a number). `exists` is undefined for any other type or a null id.
 */
export function resolveSourceEntity(
  db: DbType,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
): ResolvedSourceEntity {
  if (!sourceEntityType || !sourceEntityId) {
    return { title: null, exists: undefined };
  }

  try {
    switch (sourceEntityType) {
      case 'work_item': {
        const result = db
          .select({ title: workItems.title })
          .from(workItems)
          .where(eq(workItems.id, sourceEntityId))
          .get();
        return { title: result?.title ?? null, exists: result !== undefined };
      }

      case 'invoice': {
        const result = db
          .select({ invoiceNumber: invoices.invoiceNumber })
          .from(invoices)
          .where(eq(invoices.id, sourceEntityId))
          .get();
        return { title: result?.invoiceNumber ?? null, exists: result !== undefined };
      }

      case 'milestone': {
        const result = db
          .select({ title: milestones.title })
          .from(milestones)
          .where(eq(milestones.id, parseInt(sourceEntityId, 10)))
          .get();
        return { title: result?.title ?? null, exists: result !== undefined };
      }

      case 'subsidy_program': {
        const result = db
          .select({ name: subsidyPrograms.name })
          .from(subsidyPrograms)
          .where(eq(subsidyPrograms.id, sourceEntityId))
          .get();
        return { title: result?.name ?? null, exists: result !== undefined };
      }

      case 'budget_source': {
        const result = db
          .select({ name: budgetSources.name })
          .from(budgetSources)
          .where(eq(budgetSources.id, sourceEntityId))
          .get();
        return { title: result?.name ?? null, exists: result !== undefined };
      }

      default:
        return { title: null, exists: undefined };
    }
  } catch {
    // If query fails, resolve nothing
    return { title: null, exists: undefined };
  }
}

/**
 * Helper to resolve area summary with ancestors from area map.
 */
function getAreaWithAncestors(
  areaId: string | null,
  areaMap: Map<string, AreaMapEntry>,
): AreaSummary | null {
  if (!areaId) return null;
  const entry = areaMap.get(areaId);
  if (!entry) return null;
  const ancestors = resolveAreaAncestors(areaId, areaMap);
  return toAreaSummary(
    {
      id: entry.id,
      name: entry.name,
      color: entry.color,
      parentId: entry.parentId,
    } as typeof areas.$inferSelect,
    ancestors,
  );
}

/** Sort key of an area: ancestor names then its own name, joined (#2225). */
function areaPathKey(area: AreaSummary): string {
  return [...(area.ancestors ?? []).map((a) => a.name), area.name].join(' \u203A ');
}

function compareAreaPaths(a: AreaSummary, b: AreaSummary): number {
  return (
    areaPathKey(a).localeCompare(areaPathKey(b), undefined, { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  );
}

/** Resolve distinct area ids to summaries with ancestors, sorted by path. */
function resolveSortedAreas(
  areaIds: Iterable<string>,
  areaMap: Map<string, AreaMapEntry>,
): AreaSummary[] {
  const result: AreaSummary[] = [];
  for (const areaId of new Set(areaIds)) {
    const summary = getAreaWithAncestors(areaId, areaMap);
    if (summary) result.push(summary);
  }
  return result.sort(compareAreaPaths);
}

export interface DiaryPhotoExtras {
  photoCount: number;
  thumbnails: DiaryPhotoThumbnail[];
  photoAreas: AreaSummary[];
}

/**
 * Photo count, first thumbnails and distinct photo areas for a set of diary entries, from a
 * single photos query (#2225). Photo order: sort_order, created_at, id.
 */
export function loadDiaryPhotoExtras(
  db: DbType,
  entryIds: readonly string[],
  areaMap: Map<string, AreaMapEntry>,
): Map<string, DiaryPhotoExtras> {
  const result = new Map<string, DiaryPhotoExtras>();
  if (entryIds.length === 0) return result;

  const rows = db
    .select({
      id: photos.id,
      entityId: photos.entityId,
      areaId: photos.areaId,
      annotatedAt: photos.annotatedAt,
      updatedAt: photos.updatedAt,
    })
    .from(photos)
    .where(and(eq(photos.entityType, 'diary_entry'), inArray(photos.entityId, [...entryIds])))
    .orderBy(photos.entityId, photos.sortOrder, photos.createdAt, photos.id)
    .all();

  const areaIdsByEntry = new Map<string, Set<string>>();
  for (const row of rows) {
    let extras = result.get(row.entityId);
    if (!extras) {
      extras = { photoCount: 0, thumbnails: [], photoAreas: [] };
      result.set(row.entityId, extras);
    }
    extras.photoCount += 1;
    if (extras.thumbnails.length < DIARY_LIST_THUMBNAIL_LIMIT) {
      extras.thumbnails.push({
        id: row.id,
        thumbnailUrl: buildPhotoAssetUrls(row.id, row.annotatedAt, row.updatedAt).thumbnailUrl,
      });
    }
    if (row.areaId) {
      let set = areaIdsByEntry.get(row.entityId);
      if (!set) {
        set = new Set();
        areaIdsByEntry.set(row.entityId, set);
      }
      set.add(row.areaId);
    }
  }
  for (const [entryId, areaIds] of areaIdsByEntry) {
    result.get(entryId)!.photoAreas = resolveSortedAreas(areaIds, areaMap);
  }
  return result;
}

/**
 * Resolve the area of a source entity based on its type and ID.
 * Returns null if source entity is not a work_item or entity is not found.
 */
function resolveSourceEntityArea(
  db: DbType,
  sourceEntityType: string | null,
  sourceEntityId: string | null,
  areaMap: Map<string, AreaMapEntry>,
): AreaSummary | null {
  if (sourceEntityType !== 'work_item' || !sourceEntityId) return null;
  const result = db
    .select({ areaId: workItems.areaId })
    .from(workItems)
    .where(eq(workItems.id, sourceEntityId))
    .get();
  if (!result) return null;
  return getAreaWithAncestors(result.areaId, areaMap);
}

/**
 * Convert database diary entry row to DiaryEntrySummary shape.
 * Includes photo count aggregated from photos table.
 */
function toDiarySummary(
  entry: typeof diaryEntries.$inferSelect,
  user: typeof users.$inferSelect | null,
  photoCount: number,
  sourceEntityTitle: string | null = null,
  sourceEntityArea: AreaSummary | null = null,
  db?: DbType,
  extras: {
    sourceEntityExists?: boolean;
    repeat?: SystemEventRepeat | null;
    hidden?: boolean;
    thumbnails?: DiaryPhotoThumbnail[];
    photoAreas?: AreaSummary[];
  } = {},
): DiaryEntrySummary {
  const metadata = parseMetadata(entry.metadata);
  // Denormalize vendorName for daily_log entries
  if (entry.entryType === 'daily_log' && metadata && db) {
    const dlm = metadata as DailyLogMetadata;
    if (dlm.vendorId) {
      const vendorRow = db
        .select({ name: vendors.name })
        .from(vendors)
        .where(eq(vendors.id, dlm.vendorId))
        .get();
      dlm.vendorName = vendorRow?.name ?? null;
    }
  }
  const isSigned = hasDiarySignatures(metadata);

  return {
    id: entry.id,
    entryType: entry.entryType as DiaryEntryType,
    status: (entry.status ?? 'saved') as DiaryEntryStatus,
    entryDate: entry.entryDate,
    title: entry.title,
    body: entry.body,
    metadata,
    isAutomatic: entry.isAutomatic,
    isSigned,
    sourceEntityType: entry.sourceEntityType as DiarySourceEntityType | null,
    sourceEntityId: entry.sourceEntityId,
    sourceEntityArea,
    sourceEntityTitle,
    ...(extras.sourceEntityExists !== undefined && {
      sourceEntityExists: extras.sourceEntityExists,
    }),
    ...(extras.repeat ? { repeat: extras.repeat } : {}),
    ...(extras.hidden ? { hidden: true } : {}),
    photoCount,
    thumbnails: extras.thumbnails ?? [],
    photoAreas: extras.photoAreas ?? [],
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
  db: DbType,
): void {
  if (!metadata) return;

  const md = metadata as Record<string, unknown>;

  switch (entryType) {
    case 'daily_log': {
      const dlm = md as DailyLogMetadata;
      // Validate weather enum
      if (dlm.weather !== undefined && dlm.weather !== null) {
        const validWeathers: readonly string[] = DIARY_WEATHERS;
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
      validateSignatures('daily_log', dlm.signatures);
      // Validate vendorId is a string or null, and references an existing vendor
      if (dlm.vendorId !== undefined && dlm.vendorId !== null) {
        if (typeof dlm.vendorId !== 'string' || dlm.vendorId.trim().length === 0) {
          throw new InvalidMetadataError('daily_log vendorId must be a non-empty string or null');
        }
        const vendor = db
          .select({ id: vendors.id })
          .from(vendors)
          .where(eq(vendors.id, dlm.vendorId))
          .get();
        if (!vendor) {
          throw new InvalidMetadataError(
            `daily_log vendorId "${dlm.vendorId}" does not reference an existing vendor`,
          );
        }
      }
      validateWorkTimes('daily_log', dlm);
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
        const validOutcomes: readonly string[] = DIARY_INSPECTION_OUTCOMES;
        if (!validOutcomes.includes(svm.outcome)) {
          throw new InvalidMetadataError(
            `site_visit outcome must be one of: ${validOutcomes.join(', ')}`,
          );
        }
      }
      validateWorkTimes('site_visit', svm);
      validateSignatures('site_visit', svm.signatures);
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
        const validSeverities: readonly string[] = DIARY_ISSUE_SEVERITIES;
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
      validateSignatures('issue', im.signatures);
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

/** Summaries for display rows, in the given order (repeat/hidden from the display rows). */
export function toDiarySummaries(db: DbType, rows: readonly DisplayRow[]): DiaryEntrySummary[] {
  const displayById = new Map(rows.map((r) => [r.id, r]));

  // Load the page rows with users, then restore the display order
  const pageIds = rows.map((r) => r.id);
  const loadedRows =
    pageIds.length === 0
      ? []
      : db
          .select({
            entry: diaryEntries,
            user: users,
          })
          .from(diaryEntries)
          .leftJoin(users, eq(users.id, diaryEntries.createdBy))
          .where(inArray(diaryEntries.id, pageIds))
          .all();
  const loadedById = new Map(loadedRows.map((row) => [row.entry.id, row]));
  const entryRows = pageIds.flatMap((id) => {
    const row = loadedById.get(id);
    return row ? [row] : [];
  });

  const entryIds = entryRows.map((row) => row.entry.id);

  // Load area map once
  const areaMap = loadAreaMap(db);

  // One photos query for counts, thumbnails and photo areas (#2225)
  const photoExtras = loadDiaryPhotoExtras(db, entryIds, areaMap);

  // Resolve source entity titles and areas for all entries
  const items = entryRows.map((row) => {
    const source = resolveSourceEntity(db, row.entry.sourceEntityType, row.entry.sourceEntityId);
    const sourceEntityArea = resolveSourceEntityArea(
      db,
      row.entry.sourceEntityType,
      row.entry.sourceEntityId,
      areaMap,
    );
    const displayRow = displayById.get(row.entry.id);
    return toDiarySummary(
      row.entry,
      row.user,
      photoExtras.get(row.entry.id)?.photoCount ?? 0,
      source.title,
      sourceEntityArea,
      db,
      {
        sourceEntityExists: source.exists,
        repeat: displayRow?.repeat ?? null,
        hidden: displayRow?.hidden ?? false,
        thumbnails: photoExtras.get(row.entry.id)?.thumbnails ?? [],
        photoAreas: photoExtras.get(row.entry.id)?.photoAreas ?? [],
      },
    );
  });

  return items;
}

/**
 * List diary entries with pagination, filtering, and search.
 */
export function listDiaryEntries(
  db: DbType,
  query: DiaryEntryListQuery,
): { items: DiaryEntrySummary[]; pagination: PaginationMeta; hiddenCount: number } {
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
      // types[0] is defined: length check ensures the array has one element
      conditions.push(eq(diaryEntries.entryType, types[0]!));
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

  if (query.status) {
    conditions.push(eq(diaryEntries.status, query.status));
  }

  if (query.areaId) {
    const areaIds = getDescendantIds(db, query.areaId);
    conditions.push(
      sql`EXISTS (SELECT 1 FROM photos p WHERE p.entity_type = 'diary_entry' AND p.entity_id = ${diaryEntries.id} AND p.area_id IN (${sql.join(
        areaIds.map((areaId) => sql`${areaId}`),
        sql`, `,
      )}))`,
    );
  }

  if (query.vendorId) {
    const vendor = db
      .select({ name: vendors.name })
      .from(vendors)
      .where(eq(vendors.id, query.vendorId))
      .get();
    const dailyLog = sql`(${diaryEntries.entryType} = 'daily_log' AND json_valid(${diaryEntries.metadata}) AND json_extract(${diaryEntries.metadata}, '$.vendorId') = ${query.vendorId})`;
    conditions.push(
      vendor
        ? sql`(${dailyLog} OR (${diaryEntries.entryType} = 'delivery' AND json_valid(${diaryEntries.metadata}) AND fold(json_extract(${diaryEntries.metadata}, '$.vendor')) = fold(${vendor.name})))`
        : dailyLog,
    );
  }

  if (query.q) {
    const pattern = toLikeContainsPattern(query.q);
    conditions.push(
      or(
        sql`LOWER(${diaryEntries.title}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${diaryEntries.body}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Apply the system event display rules (R1/R2, ADR-040 §6) and page the result.
  const display = listDisplayRows(db, {
    where: whereClause,
    showHidden: query.showHidden === true,
    raw: false,
    collapseBatches: false,
    page,
    pageSize,
  });
  const totalItems = display.totalItems;
  const totalPages = Math.ceil(totalItems / pageSize);
  const items = toDiarySummaries(db, display.rows);

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
    hiddenCount: display.hiddenCount,
  };
}

/**
 * Sources of the diary Filters sheet (#2225): manual types in use, areas tagged on diary photos
 * and companies used in entries. Saved manual entries only.
 */
export function getDiaryFilterOptions(db: DbType): DiaryFilterOptions {
  const typeRows = db
    .selectDistinct({ entryType: diaryEntries.entryType })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.isAutomatic, false), eq(diaryEntries.status, 'saved')))
    .all();
  const usedTypes = new Set<string>(typeRows.map((r) => r.entryType));
  const types = MANUAL_DIARY_ENTRY_TYPES.filter((t) => usedTypes.has(t));

  const areaRows = db
    .selectDistinct({ areaId: photos.areaId })
    .from(photos)
    .innerJoin(diaryEntries, eq(diaryEntries.id, photos.entityId))
    .where(
      and(
        eq(photos.entityType, 'diary_entry'),
        sql`${photos.areaId} IS NOT NULL`,
        eq(diaryEntries.isAutomatic, false),
        eq(diaryEntries.status, 'saved'),
      ),
    )
    .all();
  const areas = resolveSortedAreas(
    areaRows.flatMap((r) => (r.areaId ? [r.areaId] : [])),
    loadAreaMap(db),
  );

  const companyRows = db
    .selectDistinct({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(
      sql`EXISTS (
        SELECT 1 FROM diary_entries d
        WHERE d.is_automatic = 0 AND d.status = 'saved' AND json_valid(d.metadata) AND (
          (d.entry_type = 'daily_log' AND json_extract(d.metadata, '$.vendorId') = ${vendors.id})
          OR (d.entry_type = 'delivery' AND fold(json_extract(d.metadata, '$.vendor')) = fold(${vendors.name}))
        )
      )`,
    )
    .orderBy(sql`${vendors.name} COLLATE NOCASE`, vendors.id)
    .all();

  return { types, areas, companies: companyRows.map((r) => ({ id: r.id, name: r.name })) };
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

  const areaMap = loadAreaMap(db);
  const photoExtras = loadDiaryPhotoExtras(db, [id], areaMap).get(id);
  const photoCount = photoExtras?.photoCount ?? 0;

  const source = resolveSourceEntity(db, row.entry.sourceEntityType, row.entry.sourceEntityId);
  const sourceEntityArea = resolveSourceEntityArea(
    db,
    row.entry.sourceEntityType,
    row.entry.sourceEntityId,
    areaMap,
  );

  return toDiarySummary(row.entry, row.user, photoCount, source.title, sourceEntityArea, db, {
    sourceEntityExists: source.exists,
    thumbnails: photoExtras?.thumbnails ?? [],
    photoAreas: photoExtras?.photoAreas ?? [],
  });
}

/**
 * Create a new diary entry.
 * Only manual entry types can be created by users; automatic types are system-generated.
 * When status='draft', validation is relaxed: body and entryDate are optional.
 * When status='saved' or omitted, a title, text or photo is required (#2220).
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

  // Determine if creating a draft or saved entry
  const isDraft = data.status === 'draft';
  const status = data.status ?? 'saved';

  const title = normalizeTitle(data.title);
  const trimmedBody = data.body?.trim() ?? '';
  if (data.entryDate !== undefined) assertValidEntryDate(data.entryDate);
  if (!isDraft) {
    assertHasContent(title, trimmedBody, 0);
  }

  // Validate metadata (both drafts and saved entries enforce type validation)
  validateMetadata(data.entryType, data.metadata, db);

  // Validate metadata size
  if (data.metadata !== null && data.metadata !== undefined) {
    if (JSON.stringify(data.metadata).length > 2_097_152) {
      throw new ValidationError('Metadata must not exceed 2MB when serialized');
    }
  }

  // Determine entry date: required for saved, defaults to today for drafts
  const entryDate =
    data.entryDate ?? (isDraft ? new Date().toISOString().split('T')[0] : undefined);
  if (!isDraft && !entryDate) {
    throw new ValidationError('Entry date is required');
  }

  // Create entry
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(diaryEntries)
    .values({
      id,
      entryType: data.entryType,
      entryDate: entryDate || '',
      title,
      body: trimmedBody,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      status,
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
      entryDate: entryDate || '',
      title,
      body: trimmedBody,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      status,
      isAutomatic: false,
      sourceEntityType: null,
      sourceEntityId: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    },
    user,
    0,
    null,
    null,
    db,
  );
}

/**
 * Update a diary entry.
 * Cannot update automatic entries.
 * Validation rules depend on entry status: drafts have relaxed validation, saved entries need a
 * title, text or photo. `entryType` may change only on drafts (#2220).
 * @throws NotFoundError if entry does not exist
 * @throws ImmutableEntryError if entry is automatic, or saved and signed
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

  // Signatures lock an entry only once it is saved; drafts stay editable until promote (#2124).
  const isSigned = hasDiarySignatures(parseMetadata(entry.metadata));
  if (isDiaryEntrySignatureLocked({ isSigned, status: entry.status })) {
    throw new ImmutableEntryError('Signed diary entries cannot be modified');
  }

  if (data.entryType !== undefined) {
    if (entry.status !== 'draft') {
      throw new ValidationError('Entry type can only change while the entry is a draft', {
        field: 'entryType',
      });
    }
    if (!MANUAL_ENTRY_TYPES.has(data.entryType)) {
      throw new InvalidEntryTypeError(
        'Only manual entry types are allowed: daily_log, site_visit, delivery, issue, general_note',
      );
    }
  }
  const targetType = (data.entryType ?? entry.entryType) as ManualDiaryEntryType;
  const typeChanged = targetType !== entry.entryType;

  if (data.entryDate !== undefined) assertValidEntryDate(data.entryDate);

  // Metadata: on a type change, keep only keys the new type knows, then validate for it
  const metadataTouched = data.metadata !== undefined || typeChanged;
  let nextMetadata: DiaryEntryMetadata | null = null;
  if (metadataTouched) {
    const base = data.metadata !== undefined ? data.metadata : parseMetadata(entry.metadata);
    nextMetadata = typeChanged ? filterMetadataForType(base, targetType) : (base ?? null);
    validateMetadata(targetType, nextMetadata, db);
    if (nextMetadata !== null && JSON.stringify(nextMetadata).length > 2_097_152) {
      throw new ValidationError('Metadata must not exceed 2MB when serialized');
    }
  }

  const nextTitle = data.title !== undefined ? normalizeTitle(data.title) : entry.title;
  const nextBody = data.body !== undefined ? data.body.trim() : entry.body;

  if (entry.status === 'saved') {
    assertHasContent(nextTitle, nextBody, countEntryPhotos(db, id));
  }

  // Update entry (created_by is never touched)
  const now = new Date().toISOString();
  db.update(diaryEntries)
    .set({
      entryType: targetType,
      entryDate: data.entryDate ?? entry.entryDate,
      title: nextTitle,
      body: nextBody,
      metadata: metadataTouched
        ? nextMetadata === null
          ? null
          : JSON.stringify(nextMetadata)
        : entry.metadata,
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

  const areaMap = loadAreaMap(db);
  const photoExtras = loadDiaryPhotoExtras(db, [id], areaMap).get(id);
  const photoCount = photoExtras?.photoCount ?? 0;

  const source = resolveSourceEntity(db, row!.entry.sourceEntityType, row!.entry.sourceEntityId);
  const sourceEntityArea = resolveSourceEntityArea(
    db,
    row!.entry.sourceEntityType,
    row!.entry.sourceEntityId,
    areaMap,
  );

  return toDiarySummary(row!.entry, row!.user, photoCount, source.title, sourceEntityArea, db, {
    sourceEntityExists: source.exists,
    thumbnails: photoExtras?.thumbnails ?? [],
    photoAreas: photoExtras?.photoAreas ?? [],
  });
}

/**
 * Look up manual diary entries (drafts and saved) with the same date and the same title
 * (case- and umlaut-insensitive exact match, contract 5, #2220). At most 5 matches, newest first.
 * @throws ValidationError if entryDate or title is missing/invalid
 */
export function lookupDiaryEntries(
  db: DbType,
  query: DiaryEntryLookupQuery,
): DiaryEntryLookupResponse {
  if (!query.entryDate || !isValidIsoDate(query.entryDate)) {
    throw new ValidationError('entryDate must be a valid date in YYYY-MM-DD format', {
      field: 'entryDate',
    });
  }
  const title = (query.title ?? '').trim();
  const folded = foldSearchText(title);
  if (title === '' || title.length > MAX_LOOKUP_TITLE_LENGTH || folded === '') {
    throw new ValidationError('title must not be blank and at most 1000 characters', {
      field: 'title',
    });
  }

  const conditions: SQL[] = [
    eq(diaryEntries.entryDate, query.entryDate),
    eq(diaryEntries.isAutomatic, false),
    sql`${diaryEntries.title} IS NOT NULL`,
    // SQLite trim() strips spaces only; trim tab/newline/CR as well to agree with JS trim().
    sql`fold(trim(${diaryEntries.title}, ' ' || char(9, 10, 13))) = ${folded}`,
  ];
  if (query.excludeId) {
    conditions.push(sql`${diaryEntries.id} <> ${query.excludeId}`);
  }

  const rows = db
    .select({
      id: diaryEntries.id,
      entryType: diaryEntries.entryType,
      title: diaryEntries.title,
      status: diaryEntries.status,
    })
    .from(diaryEntries)
    .where(and(...conditions))
    .orderBy(desc(diaryEntries.createdAt), desc(diaryEntries.id))
    .limit(LOOKUP_LIMIT)
    .all();

  const ids = rows.map((r) => r.id);
  let countMap = new Map<string, number>();
  if (ids.length > 0) {
    const counts = db
      .select({ entityId: photos.entityId, count: sql<number>`COUNT(*)` })
      .from(photos)
      .where(and(eq(photos.entityType, 'diary_entry'), inArray(photos.entityId, ids)))
      .groupBy(photos.entityId)
      .all();
    countMap = new Map(counts.map((r) => [r.entityId, r.count]));
  }

  const matches: DiaryEntryLookupMatch[] = rows.map((r) => ({
    id: r.id,
    entryType: r.entryType as ManualDiaryEntryType,
    title: r.title as string,
    status: r.status as DiaryEntryStatus,
    photoCount: countMap.get(r.id) ?? 0,
  }));
  return { matches };
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
  entryType: AutomaticDiaryEntryType,
  entryDate: string,
  metadata: SystemEventMetadataV1,
  sourceEntityType: DiarySourceEntityType | null,
  sourceEntityId: string | null,
  createdBy: string | null,
): string {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(diaryEntries)
    .values({
      id,
      entryType,
      entryDate,
      title: null,
      body: '',
      metadata: JSON.stringify(metadata),
      status: 'saved',
      isAutomatic: true,
      sourceEntityType,
      sourceEntityId,
      createdBy,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return id;
}

/**
 * Promote a draft diary entry to saved status.
 * Applies optional field overrides from the request, validates the merged entry,
 * and transitions status to 'saved' atomically.
 * @throws NotFoundError if entry does not exist
 * @throws ImmutableEntryError if entry is automatic
 * @throws AlreadySavedError if entry is already saved
 * @throws ValidationError if validation fails after applying overrides
 */
export function promoteDiaryEntry(
  db: DbType,
  id: string,
  data: PromoteDiaryEntryRequest,
): DiaryEntryDetail {
  // Fetch entry
  const entry = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();

  if (!entry) {
    throw new NotFoundError('Diary entry not found');
  }

  // Cannot promote automatic entries
  if (entry.isAutomatic) {
    throw new ImmutableEntryError('Automatic entries cannot be promoted');
  }

  // Cannot promote entries that are already saved
  if (entry.status === 'saved') {
    throw new AlreadySavedError();
  }

  // Compute final values using overrides from request or current entry values
  const finalEntryDate = data.entryDate ?? entry.entryDate;
  const finalTitle = data.title !== undefined ? normalizeTitle(data.title) : entry.title;
  const finalBody = (data.body ?? entry.body).trim();
  const finalMetadata = data.metadata !== undefined ? data.metadata : parseMetadata(entry.metadata);

  // Validate required fields for saved entry
  if (!finalEntryDate || !isValidIsoDate(finalEntryDate)) {
    throw new ValidationError('Entry date is required and must be in YYYY-MM-DD format', {
      field: 'entryDate',
    });
  }

  assertHasContent(finalTitle, finalBody, countEntryPhotos(db, id));

  // Validate type-specific required metadata
  const entryType = entry.entryType;
  if (entryType === 'site_visit') {
    const svm = finalMetadata as SiteVisitMetadata | null;
    if (!svm || !svm.inspectorName || svm.inspectorName.trim().length === 0) {
      throw new ValidationError('site_visit entries require non-empty inspectorName in metadata');
    }
    if (!svm.outcome || !(DIARY_INSPECTION_OUTCOMES as readonly string[]).includes(svm.outcome)) {
      throw new ValidationError('site_visit entries require outcome in metadata');
    }
  }

  if (entryType === 'issue') {
    const im = finalMetadata as IssueMetadata | null;
    if (
      !im ||
      !im.severity ||
      !(DIARY_ISSUE_SEVERITIES as readonly string[]).includes(im.severity)
    ) {
      throw new ValidationError('issue entries require severity in metadata');
    }
    if (
      !im.resolutionStatus ||
      !['open', 'in_progress', 'resolved'].includes(im.resolutionStatus)
    ) {
      throw new ValidationError('issue entries require resolutionStatus in metadata');
    }
  }

  // Validate merged metadata
  validateMetadata(entryType, finalMetadata, db);

  // Validate metadata size
  if (finalMetadata !== null && finalMetadata !== undefined) {
    if (JSON.stringify(finalMetadata).length > 2_097_152) {
      throw new ValidationError('Metadata must not exceed 2MB when serialized');
    }
  }

  // Update entry atomically to saved status with merged fields
  const now = new Date().toISOString();
  db.update(diaryEntries)
    .set({
      entryDate: finalEntryDate,
      title: finalTitle,
      body: finalBody,
      metadata: finalMetadata ? JSON.stringify(finalMetadata) : null,
      status: 'saved',
      updatedAt: now,
    })
    .where(eq(diaryEntries.id, id))
    .run();

  // Fetch and return the updated entry
  return getDiaryEntry(db, id);
}

/**
 * Find IDs of orphan draft entries older than a specified number of days.
 * Used by the cleanup cron job to identify drafts to delete.
 */
export function findOrphanDraftIds(db: DbType, olderThanDays: number): string[] {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .select({ id: diaryEntries.id })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.status, 'draft'), sql`${diaryEntries.updatedAt} < ${cutoff}`))
    .all();
  return rows.map((r) => r.id);
}

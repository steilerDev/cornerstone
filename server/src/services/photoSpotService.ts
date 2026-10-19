/**
 * Photo spot service — aggregates diary photos per spot (area x orientation).
 *
 * Story #2162: Photo browser
 *
 * Only photos attached to diary entries with status 'saved' are covered. The
 * INNER JOIN to diary_entries also excludes orphaned photos. All dates are the
 * diary entry's entry_date.
 */

import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { photos, diaryEntries, areas, orientations } from '../db/schema.js';
import { NotFoundError } from '../errors/AppError.js';
import { PHOTO_SPOT_ANY, PHOTO_SPOT_NONE, hasDiarySignatures } from '@cornerstone/shared';
import type {
  AreaSummary,
  OrientationSummary,
  PhotoSpotPhoto,
  PhotoSpotPhotosResponse,
  PhotoSpotSummary,
  PhotoSpotsResponse,
} from '@cornerstone/shared';
import { listAreas, loadAreaMap, resolveAreaAncestors } from './areaService.js';
import { listOrientations } from './orientationService.js';
import { buildPhotoAssetUrls } from './photoService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/** Canonical newest-first ordering; total thanks to the photo id tiebreaker. */
const SPOT_ORDER = [
  desc(diaryEntries.entryDate),
  desc(diaryEntries.createdAt),
  asc(photos.sortOrder),
  asc(photos.createdAt),
  asc(photos.id),
];

/** Scope: photos of saved diary entries only (drafts excluded). */
export const DIARY_PHOTO_SCOPE = and(
  eq(photos.entityType, 'diary_entry'),
  eq(diaryEntries.status, 'saved'),
);

/**
 * Aggregate diary photos per spot, plus all areas and orientations.
 */
export function listPhotoSpots(db: DbType): PhotoSpotsResponse {
  const rows = db
    .select({
      photoId: photos.id,
      areaId: photos.areaId,
      orientationId: photos.orientationId,
      annotatedAt: photos.annotatedAt,
      updatedAt: photos.updatedAt,
      entryDate: diaryEntries.entryDate,
    })
    .from(photos)
    .innerJoin(diaryEntries, eq(diaryEntries.id, photos.entityId))
    .where(DIARY_PHOTO_SCOPE)
    .orderBy(...SPOT_ORDER)
    .all();

  const spots = new Map<string, PhotoSpotSummary>();
  for (const row of rows) {
    const key = `${row.areaId ?? PHOTO_SPOT_NONE}\u0000${row.orientationId ?? PHOTO_SPOT_NONE}`;
    const existing = spots.get(key);
    if (existing) {
      existing.photoCount += 1;
      continue;
    }
    spots.set(key, {
      areaId: row.areaId ?? null,
      orientationId: row.orientationId ?? null,
      photoCount: 1,
      latestEntryDate: row.entryDate,
      latestPhotoId: row.photoId,
      latestThumbnailUrl: buildPhotoAssetUrls(row.photoId, row.annotatedAt, row.updatedAt)
        .thumbnailUrl,
    });
  }

  return {
    spots: [...spots.values()],
    areas: listAreas(db),
    orientations: listOrientations(db),
  };
}

/** Whether the entry metadata carries signatures; unparseable metadata fails open (false). */
function isMetadataSigned(metadata: string | null): boolean {
  try {
    return hasDiarySignatures(metadata ? JSON.parse(metadata) : null);
  } catch {
    return false;
  }
}

/**
 * List every diary photo of exactly one spot, newest first.
 * A null id selects photos without an area / orientation; PHOTO_SPOT_ANY as orientation
 * applies no orientation filter (response `orientation` is null).
 *
 * @throws NotFoundError if the area or orientation does not exist
 */
export function listSpotPhotos(
  db: DbType,
  areaId: string | null,
  orientationId: string | null | typeof PHOTO_SPOT_ANY,
): PhotoSpotPhotosResponse {
  let area: AreaSummary | null = null;
  if (areaId !== null) {
    const areaRow = db.select().from(areas).where(eq(areas.id, areaId)).get();
    if (!areaRow) {
      throw new NotFoundError('Area not found');
    }
    area = {
      id: areaRow.id,
      name: areaRow.name,
      color: areaRow.color,
      ancestors: resolveAreaAncestors(areaRow.id, loadAreaMap(db)),
    };
  }

  let orientation: OrientationSummary | null = null;
  if (orientationId !== null && orientationId !== PHOTO_SPOT_ANY) {
    const orientationRow = db
      .select()
      .from(orientations)
      .where(eq(orientations.id, orientationId))
      .get();
    if (!orientationRow) {
      throw new NotFoundError('Orientation not found');
    }
    orientation = {
      id: orientationRow.id,
      name: orientationRow.name,
      description: orientationRow.description,
    };
  }

  const rows = db
    .select({
      id: photos.id,
      caption: photos.caption,
      width: photos.width,
      height: photos.height,
      areaId: photos.areaId,
      orientationId: photos.orientationId,
      annotatedAt: photos.annotatedAt,
      updatedAt: photos.updatedAt,
      orientationName: orientations.name,
      orientationDescription: orientations.description,
      entryMetadata: diaryEntries.metadata,
      entryId: diaryEntries.id,
      entryType: diaryEntries.entryType,
      entryTitle: diaryEntries.title,
      entryDate: diaryEntries.entryDate,
    })
    .from(photos)
    .innerJoin(diaryEntries, eq(diaryEntries.id, photos.entityId))
    .leftJoin(orientations, eq(orientations.id, photos.orientationId))
    .where(
      and(
        DIARY_PHOTO_SCOPE,
        areaId === null ? isNull(photos.areaId) : eq(photos.areaId, areaId),
        orientationId === PHOTO_SPOT_ANY
          ? undefined
          : orientationId === null
            ? isNull(photos.orientationId)
            : eq(photos.orientationId, orientationId),
      ),
    )
    .orderBy(...SPOT_ORDER)
    .all();

  const spotPhotos: PhotoSpotPhoto[] = rows.map((row) => {
    const urls = buildPhotoAssetUrls(row.id, row.annotatedAt, row.updatedAt);
    return {
      id: row.id,
      caption: row.caption,
      width: row.width,
      height: row.height,
      fileUrl: urls.fileUrl,
      thumbnailUrl: urls.thumbnailUrl,
      areaId: row.areaId,
      orientationId: row.orientationId,
      orientation:
        row.orientationId && row.orientationName !== null
          ? {
              id: row.orientationId,
              name: row.orientationName,
              description: row.orientationDescription,
            }
          : null,
      annotatedAt: row.annotatedAt,
      diaryEntry: {
        id: row.entryId,
        entryType: row.entryType,
        title: row.entryTitle,
        entryDate: row.entryDate,
        isSigned: isMetadataSigned(row.entryMetadata),
      },
    };
  });

  return { area, orientation, photos: spotPhotos };
}

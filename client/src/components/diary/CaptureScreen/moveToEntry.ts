import type { DiaryEntryLookupMatch, Photo } from '@cornerstone/shared';
import type { CaptureUploadsApi } from '../../../capture/captureTypes.js';
import { clearStickyTags } from '../../../capture/stickyTags.js';
import { ApiClientError } from '../../../lib/apiClient.js';
import { deleteDiaryEntry, getDiaryEntry, updateDiaryEntry } from '../../../lib/diaryApi.js';
import { fetchPhotoBlob, uploadAnnotation, uploadPhoto } from '../../../lib/photoApi.js';

export type MoveResult = { status: 'done' } | { status: 'signed' } | { status: 'failed' };

/** What a previous attempt already moved, so a retry never repeats a step. */
export interface MoveProgress {
  /** Capture items that were handed to the match; null until the first attempt. */
  itemIds: readonly string[] | null;
  /** Ids of server photos that were uploaded to the match. */
  photoIds: Set<string>;
  textDone: boolean;
}

export function newMoveProgress(): MoveProgress {
  return { itemIds: null, photoIds: new Set(), textDone: false };
}

export interface MoveToEntryArgs {
  draftId: string;
  match: Pick<DiaryEntryLookupMatch, 'id'>;
  body: string;
  serverPhotos: readonly Photo[];
  api: Pick<CaptureUploadsApi, 'reassign' | 'whenSettled'>;
  progress: MoveProgress;
}

function isSigned(err: unknown): boolean {
  return err instanceof ApiClientError && err.statusCode === 403;
}

/**
 * "Add to that entry instead": the draft's photos and text move to the match, then the draft is
 * deleted. The draft is deleted only after everything reached the match; on any failure nothing
 * is deleted and the same `progress` can be passed to try again.
 *
 * A move is client-side: the original is fetched and uploaded to the match, and an annotation is
 * fetched in its baked form and stored on the new photo.
 */
export async function moveToEntry({
  draftId,
  match,
  body,
  serverPhotos,
  api,
  progress,
}: MoveToEntryArgs): Promise<MoveResult> {
  try {
    // 1. Photos still waiting on this device go to the match.
    progress.itemIds ??= api.reassign(draftId, match.id);
    if (progress.itemIds.length > 0) {
      const { failedIds } = await api.whenSettled(progress.itemIds);
      if (failedIds.length > 0) return { status: 'failed' };
    }

    // 2. Photos already on the server are copied over, one by one.
    for (const photo of serverPhotos) {
      if (progress.photoIds.has(photo.id)) continue;
      const original = await fetchPhotoBlob(photo, 'original');
      const file = new File([original], photo.originalFilename, { type: original.type });
      const moved = await uploadPhoto(
        'diary_entry',
        match.id,
        file,
        photo.caption ?? undefined,
        null,
        photo.areaId,
        photo.orientationId,
      );
      if (photo.annotatedAt) {
        const annotated = await fetchPhotoBlob(photo, 'annotated');
        await uploadAnnotation(moved.id, annotated);
      }
      progress.photoIds.add(photo.id);
    }

    // 3. The text is appended to the match's text.
    if (!progress.textDone && body.trim()) {
      const existing = (await getDiaryEntry(match.id)).body.trim();
      await updateDiaryEntry(match.id, {
        body: existing ? `${existing}\n\n${body.trim()}` : body.trim(),
      });
    }
    progress.textDone = true;

    // 4. Only now is the draft removed.
    await deleteDiaryEntry(draftId);
    clearStickyTags(draftId);
    return { status: 'done' };
  } catch (err) {
    return isSigned(err) ? { status: 'signed' } : { status: 'failed' };
  }
}

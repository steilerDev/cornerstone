import type { Photo } from '@cornerstone/shared';

export type CaptureSource = 'camera' | 'library' | 'cameraApp' | 'drop';
/** Decision 13 provenance, per dimension. Only null and 'retro' values are re-tagged by a chip change. */
export type TagProvenance = 'live' | 'added' | 'retro' | 'hand';
/** blocked = 403 (the entry is signed). */
export type CaptureItemState = 'waiting' | 'uploading' | 'failed' | 'blocked';

export interface CaptureTags {
  areaId: string | null;
  orientationId: string | null;
  areaSource: TagProvenance | null;
  orientationSource: TagProvenance | null;
  caption: string | null;
}

export interface CaptureRecord extends CaptureTags {
  id: string;
  userId: string;
  /** Provider instance id; tells crash orphans from this session's in-flight items. */
  sessionId: string;
  draftId: string | null;
  source: CaptureSource;
  blob: Blob;
  /** Camera shots: `capture-${Date.now()}.jpg`. */
  name: string;
  type: string;
  size: number;
  state: 'waiting' | 'failed' | 'blocked';
  attempts: number;
  createdAt: string;
}

export interface CaptureItem extends CaptureTags {
  id: string;
  draftId: string | null;
  source: CaptureSource;
  name: string;
  /** Object URL, revoked by the provider when the item goes away. */
  previewUrl: string;
  state: CaptureItemState;
  /** 0-100 while uploading. */
  progress: number | null;
  /** false = memory-only: "Not saved on this device". */
  persisted: boolean;
  createdAt: string;
}

export interface CaptureUploadedEvent {
  itemId: string;
  draftId: string;
  photo: Photo;
}

export interface CaptureUploadsApi {
  /** 'pending' until the store opened; then where new items are kept. */
  readonly storage: 'pending' | 'persistent' | 'memory';
  /** The signed-in user's items, oldest first (orphans included). */
  readonly items: readonly CaptureItem[];
  /** Crash survivors: draftId null and another sessionId. */
  readonly orphans: readonly CaptureItem[];
  /** Persist first, then show; uploads start once the item has a draftId. Resolves with the new ids. */
  add(
    files: readonly File[],
    init: { draftId: string | null; source: CaptureSource; tags: CaptureTags },
  ): Promise<readonly string[]>;
  /** Give items created before the draft existed their draft id (and start their uploads). */
  assignDraft(itemIds: readonly string[], draftId: string): void;
  /** Move every item of one draft to another draft id; returns the moved ids. */
  reassign(fromDraftId: string, toDraftId: string): readonly string[];
  updateTags(itemId: string, patch: Partial<CaptureTags>): void;
  /** Abort if uploading, delete the record. If the upload had already succeeded server-side, DELETE that photo. */
  remove(itemId: string): void;
  /** Retry all failed items of a draft now (resets the auto-retry backoff). */
  retry(draftId: string): void;
  /** Abort and delete every item of the draft (used by Discard). */
  discardDraft(draftId: string): Promise<void>;
  adoptOrphans(draftId: string): void;
  discardOrphans(): Promise<void>;
  /** Called once per successful upload, after the record was deleted. */
  subscribe(listener: (event: CaptureUploadedEvent) => void): () => void;
  /** Resolves when every listed item has uploaded or failed (failed/blocked after its automatic retries). */
  whenSettled(
    itemIds: readonly string[],
  ): Promise<{ uploaded: readonly Photo[]; failedIds: readonly string[] }>;
}

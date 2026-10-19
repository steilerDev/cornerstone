import { createContext } from 'react';
import type { RefObject } from 'react';
import type { AreaResponse, Photo, UndoToken } from '@cornerstone/shared';

export interface AnnotatablePhoto {
  id: string;
  width: number | null;
  height: number | null;
}

export interface BulkTagRequest {
  photoIds: string[];
  areas: AreaResponse[];
  returnFocusRef: RefObject<HTMLElement | null>;
}

export interface BulkTagResult {
  /** undefined: left as is. */
  areaId?: string | null;
  orientationId?: string | null;
  updated: number;
  undo: UndoToken;
}

export interface PhotoDialogsContextValue {
  /** Resolves with the saved Photo, or null when cancelled. */
  annotate(req: {
    photo: AnnotatablePhoto;
    returnFocusRef: RefObject<HTMLElement | null>;
  }): Promise<Photo | null>;
  /** The dialog performs `PATCH /api/photos/tags` itself; resolves with the result, or null when cancelled. */
  bulkTag(req: BulkTagRequest): Promise<BulkTagResult | null>;
}

function missing(): never {
  throw new Error('PhotoDialogsProvider missing');
}

export const PhotoDialogsContext = createContext<PhotoDialogsContextValue>({
  annotate: missing,
  bulkTag: missing,
});

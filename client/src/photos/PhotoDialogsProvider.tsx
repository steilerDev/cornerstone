import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Photo } from '@cornerstone/shared';
import { PhotoAnnotateDialog } from '../components/photos/PhotoStrip/PhotoAnnotateDialog.js';
import { PhotoBulkTagSheet } from '../components/photos/PhotoStrip/PhotoBulkTagSheet.js';
import { useRealLocationKey } from '../navigation/realLocation.js';
import { PhotoDialogsContext } from './photoDialogsContext.js';
import type {
  BulkTagRequest,
  BulkTagResult,
  PhotoDialogsContextValue,
} from './photoDialogsContext.js';

type OpenDialog =
  | {
      kind: 'annotate';
      key: string;
      req: Parameters<PhotoDialogsContextValue['annotate']>[0];
      resolve: (photo: Photo | null) => void;
    }
  | {
      kind: 'bulk';
      key: string;
      req: BulkTagRequest;
      resolve: (result: BulkTagResult | null) => void;
    };

/**
 * Hosts the Annotate and bulk Set tags dialogs for pages (spot viewer, Photos page). Imported only
 * by `App.tsx`, so `PhotoAnnotator` and the bulk dialog stay out of page closures; pages use
 * `usePhotoDialogs`. A second request while one is open resolves the first with null.
 */
export function PhotoDialogsProvider({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState<OpenDialog | null>(null);
  const openRef = useRef<OpenDialog | null>(null);
  const realKey = useRealLocationKey();
  const realKeyRef = useRef(realKey);
  realKeyRef.current = realKey;

  // Navigating away (Back, a link) drops the dialog: it belongs to the location it was opened on.
  if (open !== null && open.key !== realKey) {
    openRef.current = null;
    (open.resolve as (value: null) => void)(null);
    setOpen(null);
  }

  const show = useCallback((next: OpenDialog | null) => {
    const current = openRef.current;
    openRef.current = next;
    if (current) (current.resolve as (value: null) => void)(null);
    setOpen(next);
  }, []);

  const value = useMemo<PhotoDialogsContextValue>(
    () => ({
      annotate: (req) =>
        new Promise<Photo | null>((resolve) =>
          show({ kind: 'annotate', key: realKeyRef.current, req, resolve }),
        ),
      bulkTag: (req) =>
        new Promise<BulkTagResult | null>((resolve) =>
          show({ kind: 'bulk', key: realKeyRef.current, req, resolve }),
        ),
    }),
    [show],
  );

  const finish = <T,>(resolve: (value: T | null) => void, result: T | null) => {
    openRef.current = null;
    setOpen(null);
    resolve(result);
  };

  return (
    <PhotoDialogsContext value={value}>
      {children}
      {open?.kind === 'annotate' && (
        <PhotoAnnotateDialog
          photo={open.req.photo}
          returnFocusRef={open.req.returnFocusRef}
          onSaved={(photo) => finish(open.resolve, photo)}
          onClose={() => finish(open.resolve, null)}
        />
      )}
      {open?.kind === 'bulk' && (
        <PhotoBulkTagSheet
          photoIds={open.req.photoIds}
          areas={open.req.areas}
          returnFocusRef={open.req.returnFocusRef}
          onSaved={(result) => finish(open.resolve, result)}
          onCancel={() => finish(open.resolve, null)}
        />
      )}
    </PhotoDialogsContext>
  );
}

export default PhotoDialogsProvider;

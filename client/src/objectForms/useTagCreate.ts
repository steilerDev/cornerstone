import { use, useCallback, useRef, useState } from 'react';
import { TagCreateContext } from './tagCreateContext.js';
import type { RequestTagCreate } from './tagCreateContext.js';

export interface TagCreate {
  /** undefined outside a TagCreateProvider (unit tests): callers then hide the "New" chip. */
  readonly request: RequestTagCreate | undefined;
  /** True while the create dialog is open. */
  readonly isCreating: boolean;
}

/**
 * Opens the New area / New orientation form in place through `TagCreateProvider`; this module
 * never imports ObjectForm.
 */
export function useTagCreate(): TagCreate {
  const provided = use(TagCreateContext);
  const [isCreating, setIsCreating] = useState(false);
  const providedRef = useRef(provided);
  providedRef.current = provided;

  const request = useCallback<RequestTagCreate>(async (kind, returnFocus) => {
    const open = providedRef.current;
    if (open === null) return null;
    setIsCreating(true);
    try {
      return await open(kind, returnFocus);
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { request: provided === null ? undefined : request, isCreating };
}

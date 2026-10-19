import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCreatePrefill } from '../components/CreateMenu/CreateMenuContext.js';
import { CREATE_TARGETS, createHref, quickLogHref } from './createEntries.js';
import type { CreateEntryId } from './createEntries.js';
import type { CreatePrefill, QuickLogMode } from './createQuery.js';
import { backgroundStateFor } from './dialogRoutes.js';
import type { BackgroundLocation } from './dialogRoutes.js';
import { originStateFor } from './origin.js';

export interface CreateOpenOptions {
  /** The dialog was opened from the New menu or sheet, whose row unmounts: focus falls back to the trigger. */
  readonly createOpener?: boolean;
}

export interface CreateLink {
  readonly to: string;
  readonly state: unknown;
}

/** URL and router state of a create target opened from `location` (the page on screen). */
export function createLinkFor(
  id: CreateEntryId,
  prefill: CreatePrefill,
  location: BackgroundLocation,
  options?: CreateOpenOptions,
): CreateLink {
  const target = CREATE_TARGETS[id];
  return {
    to: createHref(id, prefill),
    state: {
      ...originStateFor(location),
      ...(target.dialog ? backgroundStateFor(location) : {}),
      ...(options?.createOpener ? { createOpener: true } : {}),
    },
  };
}

/**
 * Navigates (push) to a create target with origin, the page's pre-fill and, for dialog targets,
 * the page you are on as the background. Openers use this, never a bare
 * `navigate(routeUrl('…New'))`. Works outside a CreateMenuProvider (no pre-fill).
 */
export function useOpenCreate(): (id: CreateEntryId, options?: CreateOpenOptions) => void {
  const navigate = useNavigate();
  const { pathname, search, hash, state, key } = useLocation();
  const prefill = useCreatePrefill();
  return useCallback(
    (id, options) => {
      const link = createLinkFor(id, prefill, { pathname, search, hash, state, key }, options);
      void navigate(link.to, { state: link.state });
    },
    [navigate, pathname, search, hash, state, key, prefill],
  );
}

/** `{ to, state }` for anchors and links, built by the same rules as `useOpenCreate`. */
export function useCreateEntryLink(id: CreateEntryId, options?: CreateOpenOptions): CreateLink {
  const { pathname, search, hash, state, key } = useLocation();
  const prefill = useCreatePrefill();
  const createOpener = options?.createOpener === true;
  return useMemo(
    () => createLinkFor(id, prefill, { pathname, search, hash, state, key }, { createOpener }),
    [id, prefill, pathname, search, hash, state, key, createOpener],
  );
}

/** `{ to, state }` of a Log now tile: the capture screen with the page's area and the origin. */
export function useQuickLogLink(mode: QuickLogMode): CreateLink {
  const { pathname, search, hash } = useLocation();
  const prefill = useCreatePrefill();
  return useMemo(
    () => ({
      to: quickLogHref(mode, prefill),
      state: originStateFor({ pathname, search, hash }),
    }),
    [mode, prefill, pathname, search, hash],
  );
}

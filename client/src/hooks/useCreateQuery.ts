import { useEffect, useEffectEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CREATE_KIND_PARAM, CREATE_PARAM, prefillFromSearch } from '../navigation/createQuery.js';
import type { CreatePrefill, CreatePrefillKey } from '../navigation/createQuery.js';

export interface CreateRequest {
  readonly kind: string | null;
  readonly prefill: CreatePrefill;
}

export interface UseCreateQueryOptions {
  /** Hold the request until the page can open its create UI (default true). */
  readonly ready?: boolean;
  /** Pre-fill keys this page consumes; they are removed from the URL with `create`. */
  readonly prefillKeys?: readonly CreatePrefillKey[];
  readonly onOpen: (request: CreateRequest) => void;
}

const NO_KEYS: readonly CreatePrefillKey[] = [];

/** Stable reserved-param list for `useTableState`: `['create', 'kind', ...prefillKeys]`. Call at module level. */
export function createReservedParams(prefillKeys: readonly CreatePrefillKey[] = NO_KEYS): string[] {
  return [CREATE_PARAM, CREATE_KIND_PARAM, ...prefillKeys];
}

/**
 * Opens a list page's own create UI for `?create=1` (also when the page is already mounted), once
 * per occurrence and when `ready`, then removes `create`, `kind` and the prefill keys from the URL
 * with replace (other params are kept). Never writes when the URL is already clean.
 */
export function useCreateQuery({ ready = true, prefillKeys, onOpen }: UseCreateQueryOptions): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(CREATE_PARAM) === '1';

  const open = useEffectEvent(() => {
    const params = new URLSearchParams(searchParams);
    onOpen({ kind: params.get(CREATE_KIND_PARAM), prefill: prefillFromSearch(params) });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(CREATE_PARAM);
        next.delete(CREATE_KIND_PARAM);
        for (const key of prefillKeys ?? NO_KEYS) next.delete(key);
        return next;
      },
      { replace: true },
    );
  });

  useEffect(() => {
    if (!requested || !ready) return;
    open();
  }, [requested, ready]);
}

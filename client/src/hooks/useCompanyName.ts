import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../lib/apiClient.js';
import { fetchVendor } from '../lib/vendorsApi.js';

export interface KnownCompany {
  readonly id: string;
  readonly name: string;
}

export interface UseCompanyNameOptions {
  /** A company whose name the caller already has (e.g. line.vendor); used only when its id equals `id`. */
  readonly known?: KnownCompany | null;
  /** Called once when `id` does not exist (404). Callers drop the id; not called on other errors. */
  readonly onUnknown?: () => void;
}

export interface CompanyName {
  /** Name for SearchPicker `initialTitle`; undefined while unknown, resolving or failed. */
  readonly name: string | undefined;
  /** True while `id` is being looked up. Hosts may disable the picker and Save meanwhile. */
  readonly isResolving: boolean;
  /** Pass as SearchPicker `onSelectItem`: a picked or created company needs no lookup. */
  readonly remember: (item: { id: string; label: string }) => void;
}

interface Lookup {
  readonly names: ReadonlyMap<string, string>;
  readonly failed: ReadonlySet<string>;
}

const EMPTY_LOOKUP: Lookup = { names: new Map(), failed: new Set() };

/**
 * Resolves the display name of a preselected company id (a saved company outside the first
 * page of a list still shows its name). A 404 id calls `onUnknown` so the caller can drop it.
 */
export function useCompanyName(id: string, options?: UseCompanyNameOptions): CompanyName {
  const known = options?.known ?? null;
  const [lookup, setLookup] = useState<Lookup>(EMPTY_LOOKUP);
  const onUnknownRef = useRef(options?.onUnknown);
  useEffect(() => {
    onUnknownRef.current = options?.onUnknown;
  });

  const isKnown = id !== '' && known?.id === id;
  const cachedName = lookup.names.get(id);
  const needsLookup = id !== '' && !isKnown && cachedName === undefined && !lookup.failed.has(id);

  useEffect(() => {
    if (!needsLookup) return;
    let cancelled = false;
    fetchVendor(id)
      .then((vendor) => {
        if (cancelled) return;
        setLookup((prev) => ({ ...prev, names: new Map(prev.names).set(id, vendor.name) }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLookup((prev) => ({ ...prev, failed: new Set(prev.failed).add(id) }));
        if (err instanceof ApiClientError && err.statusCode === 404) {
          onUnknownRef.current?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, needsLookup]);

  const remember = useCallback((item: { id: string; label: string }) => {
    setLookup((prev) => ({ ...prev, names: new Map(prev.names).set(item.id, item.label) }));
  }, []);

  let name: string | undefined;
  if (id === '') name = undefined;
  else if (isKnown) name = known?.name;
  else name = cachedName;

  return { name, isResolving: needsLookup, remember };
}

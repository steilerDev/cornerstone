import { createContext, use, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext.js';
import { fetchHouseholdSettings } from '../lib/settingsApi.js';

export interface HouseNameContextValue {
  readonly houseName: string | null;
  readonly setHouseName: (name: string | null) => void;
}

const DEFAULT_VALUE: HouseNameContextValue = { houseName: null, setHouseName: () => {} };

const HouseNameContext = createContext<HouseNameContextValue>(DEFAULT_VALUE);

function clean(name: string | null | undefined): string | null {
  return name?.trim() || null;
}

interface StoredName {
  readonly userId: string;
  readonly name: string | null;
}

/** Holds the house name for the browser title. Fetches once per signed-in user; idle when signed out. */
export function HouseNameProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [stored, setStored] = useState<StoredName | null>(null);

  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    fetchHouseholdSettings()
      .then((settings) => {
        if (!cancelled) setStored({ userId, name: clean(settings.householdName) });
      })
      .catch(() => {
        if (!cancelled) setStored({ userId, name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // A stored name only counts for the user it was loaded for (signed out = no house name).
  const houseName = userId !== null && stored?.userId === userId ? stored.name : null;

  const value = useMemo<HouseNameContextValue>(
    () => ({
      houseName,
      setHouseName: (name) => {
        if (userId !== null) setStored({ userId, name: clean(name) });
      },
    }),
    [houseName, userId],
  );

  return <HouseNameContext value={value}>{children}</HouseNameContext>;
}

export function useHouseName(): HouseNameContextValue {
  return use(HouseNameContext);
}

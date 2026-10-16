import { createContext, use, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext.js';
import { ENTRIES_LANGUAGES } from '@cornerstone/shared';
import type { EntriesLanguage } from '@cornerstone/shared';
import { fetchHouseholdSettings } from '../lib/settingsApi.js';

export interface HouseNameContextValue {
  readonly houseName: string | null;
  readonly setHouseName: (name: string | null) => void;
  /**
   * Language of the household's own entries; consumers set `lang` on user-entered text for
   * hyphenation (AC4). No consumer in #2215. Null until loaded, when signed out or on failure.
   */
  readonly entriesLanguage: EntriesLanguage | null;
  readonly setEntriesLanguage: (language: EntriesLanguage) => void;
}

const DEFAULT_VALUE: HouseNameContextValue = {
  houseName: null,
  setHouseName: () => {},
  entriesLanguage: null,
  setEntriesLanguage: () => {},
};

/** Tolerates mocked settings responses that omit the field. */
function toEntriesLanguage(value: unknown): EntriesLanguage | null {
  return ENTRIES_LANGUAGES.find((language) => language === value) ?? null;
}

const HouseNameContext = createContext<HouseNameContextValue>(DEFAULT_VALUE);

function clean(name: string | null | undefined): string | null {
  return name?.trim() || null;
}

interface StoredName {
  readonly userId: string;
  readonly name: string | null;
  readonly entriesLanguage: EntriesLanguage | null;
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
        if (!cancelled) {
          setStored({
            userId,
            name: clean(settings.householdName),
            entriesLanguage: toEntriesLanguage(settings.entriesLanguage),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setStored({ userId, name: null, entriesLanguage: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // A stored name only counts for the user it was loaded for (signed out = no house name).
  const own = userId !== null && stored?.userId === userId ? stored : null;
  const houseName = own?.name ?? null;
  const entriesLanguage = own?.entriesLanguage ?? null;

  const value = useMemo<HouseNameContextValue>(
    () => ({
      houseName,
      setHouseName: (name) => {
        if (userId !== null) {
          setStored((prev) => ({
            userId,
            name: clean(name),
            entriesLanguage: prev?.userId === userId ? prev.entriesLanguage : null,
          }));
        }
      },
      entriesLanguage,
      setEntriesLanguage: (language) => {
        if (userId !== null) {
          setStored((prev) => ({
            userId,
            name: prev?.userId === userId ? prev.name : null,
            entriesLanguage: language,
          }));
        }
      },
    }),
    [houseName, entriesLanguage, userId],
  );

  return <HouseNameContext value={value}>{children}</HouseNameContext>;
}

export function useHouseName(): HouseNameContextValue {
  return use(HouseNameContext);
}

/** Language of the household's own entries (null while unknown). */
export function useEntriesLanguage(): EntriesLanguage | null {
  return use(HouseNameContext).entriesLanguage;
}

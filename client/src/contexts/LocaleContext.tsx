import {
  createContext,
  use,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import i18n from '../i18n/index.js';
import { listPreferences, upsertPreference } from '../lib/preferencesApi.js';
import { fetchConfig } from '../lib/configApi.js';

export type LocalePreference = 'en' | 'de' | 'system';
export type ResolvedLocale = 'en' | 'de';

export interface LocaleContextValue {
  /** The user's explicit preference: 'en', 'de', or 'system' */
  locale: LocalePreference;
  /** The actual applied locale after resolving 'system' against browser preference */
  resolvedLocale: ResolvedLocale;
  /** The currency code from server config (e.g. 'EUR') */
  currency: string;
  /** Update the user's locale preference */
  setLocale: (locale: LocalePreference) => void;
  /** Sync locale preference with server (called when user authenticates) */
  syncWithServer: (userId: string) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const STORAGE_KEY = 'locale';

function detectBrowserLocale(): ResolvedLocale {
  const lang = navigator.language ?? navigator.languages?.[0] ?? 'en';
  if (lang.startsWith('de')) return 'de';
  return 'en';
}

function resolveLocale(preference: LocalePreference): ResolvedLocale {
  if (preference === 'system') return detectBrowserLocale();
  return preference;
}

function readStoredPreference(): LocalePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'de' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 'system';
}

interface LocaleProviderProps {
  children: ReactNode;
}

export function LocaleProvider({ children }: LocaleProviderProps) {
  const initialPreference = readStoredPreference();
  const [locale, setLocaleState] = useState<LocalePreference>(initialPreference);
  const [resolvedLocale, setResolvedLocale] = useState<ResolvedLocale>(() =>
    resolveLocale(initialPreference),
  );
  const [currency, setCurrency] = useState<string>('EUR');

  // Track authenticated user ID to avoid syncing with server for unauthenticated users
  const authenticatedUserIdRef = useRef<string | null>(null);

  // Apply the resolved locale to <html lang="..."> and sync i18next
  useEffect(() => {
    document.documentElement.setAttribute('lang', resolvedLocale);
    void i18n.changeLanguage(resolvedLocale);
  }, [resolvedLocale]);

  // Fetch config on mount to set currency (fire-and-forget)
  useEffect(() => {
    void fetchConfig()
      .then((config) => {
        setCurrency(config.currency ?? 'EUR');
      })
      .catch(() => {
        // Silently fail - currency stays at default EUR
      });
  }, []);

  const setLocale = useCallback((preference: LocalePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Ignore storage errors
    }
    setLocaleState(preference);
    setResolvedLocale(resolveLocale(preference));

    // Sync to server if authenticated (fire-and-forget)
    if (authenticatedUserIdRef.current) {
      void upsertPreference('locale', preference).catch(() => {
        // Silently fail - locale stays applied locally
      });
    }
  }, []);

  const syncWithServer = useCallback(async (userId: string) => {
    authenticatedUserIdRef.current = userId;

    try {
      const preferences = await listPreferences();
      const serverLocale = preferences.find((p) => p.key === 'locale');

      if (
        serverLocale &&
        (serverLocale.value === 'en' ||
          serverLocale.value === 'de' ||
          serverLocale.value === 'system')
      ) {
        // Server has a valid locale preference - apply it and clear localStorage
        setLocaleState(serverLocale.value as LocalePreference);
        setResolvedLocale(resolveLocale(serverLocale.value as LocalePreference));
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Ignore storage errors
        }
      } else {
        // Server has no locale preference - migrate localStorage to server if present
        const localLocale = readStoredPreference();
        if (localLocale !== 'system') {
          // Only migrate if user explicitly set something (not the default 'system')
          await upsertPreference('locale', localLocale).catch(() => {
            // Silently fail - keep local preference
          });
        }
      }
    } catch {
      // Network error - silently fall back, keep current locale from localStorage
    }
  }, []);

  return (
    <LocaleContext value={{ locale, resolvedLocale, currency, setLocale, syncWithServer }}>
      {children}
    </LocaleContext>
  );
}

export function useLocale(): LocaleContextValue {
  const context = use(LocaleContext);
  if (context === undefined) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}

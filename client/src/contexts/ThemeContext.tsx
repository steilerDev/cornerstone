import {
  createContext,
  use,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { listPreferences, upsertPreference } from '../lib/preferencesApi.js';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  /** The user's explicit preference: 'light', 'dark', or 'system' */
  theme: ThemePreference;
  /** The actual applied theme after resolving 'system' against OS preference */
  resolvedTheme: ResolvedTheme;
  /** Update the user's theme preference */
  setTheme: (theme: ThemePreference) => void;
  /** Sync theme preference with server (called when user authenticates) */
  syncWithServer: (userId: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'theme';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return getSystemTheme();
  return preference;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (e.g., private browsing with strict settings)
  }
  return 'system';
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // Read localStorage once, derive both initial states from the single value.
  const initialPreference = readStoredPreference();
  const [theme, setThemeState] = useState<ThemePreference>(initialPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(initialPreference),
  );

  // Track authenticated user ID to avoid syncing with server for unauthenticated users
  const authenticatedUserIdRef = useRef<string | null>(null);

  // Apply the resolved theme to <html data-theme="..."> and set color-scheme
  // so the browser renders native widgets (date inputs, selects, scrollbars)
  // in the appropriate color scheme.
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Listen for OS-level dark mode changes when preference is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? 'dark' : 'light');
    };

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = useCallback((preference: ThemePreference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Ignore storage errors
    }
    setThemeState(preference);
    setResolvedTheme(resolveTheme(preference));

    // Sync to server if authenticated (fire-and-forget)
    if (authenticatedUserIdRef.current) {
      void upsertPreference('theme', preference).catch(() => {
        // Silently fail - theme stays applied locally
      });
    }
  }, []);

  const syncWithServer = useCallback(async (userId: string) => {
    authenticatedUserIdRef.current = userId;

    try {
      const preferences = await listPreferences();
      const serverTheme = preferences.find((p) => p.key === 'theme');

      if (
        serverTheme &&
        (serverTheme.value === 'light' ||
          serverTheme.value === 'dark' ||
          serverTheme.value === 'system')
      ) {
        // Server has a valid theme preference - apply it and clear localStorage
        setThemeState(serverTheme.value as ThemePreference);
        setResolvedTheme(resolveTheme(serverTheme.value as ThemePreference));
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // Ignore storage errors
        }
      } else {
        // Server has no theme preference - migrate localStorage to server if present
        const localTheme = readStoredPreference();
        if (localTheme !== 'system') {
          // Only migrate if user explicitly set something (not the default 'system')
          await upsertPreference('theme', localTheme).catch(() => {
            // Silently fail - keep local preference
          });
        }
      }
    } catch {
      // Network error - silently fall back, keep current theme from localStorage
    }
  }, []);

  return (
    <ThemeContext value={{ theme, resolvedTheme, setTheme, syncWithServer }}>
      {children}
    </ThemeContext>
  );
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

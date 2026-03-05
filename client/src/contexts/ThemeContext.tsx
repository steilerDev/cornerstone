import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext.js';
import { getPreferences, upsertPreference } from '../lib/preferencesApi.js';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  /** The user's explicit preference: 'light', 'dark', or 'system' */
  theme: ThemePreference;
  /** The actual applied theme after resolving 'system' against OS preference */
  resolvedTheme: ResolvedTheme;
  /** Update the user's theme preference */
  setTheme: (theme: ThemePreference) => void;
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
  const { user } = useAuth();
  const serverPreferenceLoaded = useRef(false);

  // Read localStorage once, derive both initial states from the single value.
  const initialPreference = readStoredPreference();
  const [theme, setThemeState] = useState<ThemePreference>(initialPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(initialPreference),
  );

  // Load server preferences when user authenticates
  useEffect(() => {
    if (!user) {
      serverPreferenceLoaded.current = false;
      return;
    }

    if (serverPreferenceLoaded.current) return;

    const loadServerPreferences = async () => {
      try {
        const response = await getPreferences();
        const themePreference = response.preferences.find((p) => p.key === 'theme');

        if (themePreference) {
          // Server has a theme preference — use it
          const serverTheme = themePreference.value as ThemePreference;
          setThemeState(serverTheme);
          setResolvedTheme(resolveTheme(serverTheme));
          try {
            localStorage.setItem(STORAGE_KEY, serverTheme);
          } catch {
            // Ignore storage errors
          }
        } else {
          // Server has no theme preference
          const localStoredPreference = readStoredPreference();
          if (localStoredPreference !== 'system') {
            // Migrate non-default local preference to server
            try {
              await upsertPreference({ key: 'theme', value: localStoredPreference });
            } catch {
              // Non-fatal — continue using local preference
            }
          }
        }
      } catch {
        // Non-fatal — continue using local preference
      } finally {
        serverPreferenceLoaded.current = true;
      }
    };

    void loadServerPreferences();
  }, [user]);

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

  const setTheme = useCallback(
    (preference: ThemePreference) => {
      try {
        localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        // Ignore storage errors
      }
      setThemeState(preference);
      setResolvedTheme(resolveTheme(preference));

      // Fire-and-forget server sync if user is authenticated
      if (user) {
        try {
          void upsertPreference({ key: 'theme', value: preference });
        } catch {
          // Non-fatal — continue using local preference
        }
      }
    },
    [user],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

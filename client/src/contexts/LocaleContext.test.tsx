/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as PreferencesApiModule from '../lib/preferencesApi.js';
import type * as ConfigApiModule from '../lib/configApi.js';
import type * as LocaleContextModule from './LocaleContext.js';

// ─── Mocks (must be registered BEFORE dynamic import) ─────────────────────────

const mockListPreferences = jest.fn<typeof PreferencesApiModule.listPreferences>();
const mockUpsertPreference = jest.fn<typeof PreferencesApiModule.upsertPreference>();
const mockDeletePreference = jest.fn<typeof PreferencesApiModule.deletePreference>();

jest.unstable_mockModule('../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  upsertPreference: mockUpsertPreference,
  deletePreference: mockDeletePreference,
}));

const mockFetchConfig = jest.fn<typeof ConfigApiModule.fetchConfig>();

jest.unstable_mockModule('../lib/configApi.js', () => ({
  fetchConfig: mockFetchConfig,
}));

// Mock i18n.changeLanguage to avoid actual i18next initialization in tests
const mockChangeLanguage = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../i18n/index.js', () => ({
  default: {
    changeLanguage: mockChangeLanguage,
  },
}));

// ─── Dynamic imports (resolved once after mocks) ──────────────────────────────

let LocaleProvider: typeof LocaleContextModule.LocaleProvider;
let useLocale: typeof LocaleContextModule.useLocale;

beforeEach(async () => {
  if (!LocaleProvider) {
    const mod = await import('./LocaleContext.js');
    LocaleProvider = mod.LocaleProvider;
    useLocale = mod.useLocale;
  }

  mockListPreferences.mockReset();
  mockUpsertPreference.mockReset();
  mockDeletePreference.mockReset();
  mockFetchConfig.mockReset();
  mockChangeLanguage.mockReset();
  mockChangeLanguage.mockResolvedValue(undefined);

  // Default: fetchConfig returns EUR
  mockFetchConfig.mockResolvedValue({ currency: 'EUR' });

  try {
    localStorage.clear();
  } catch {
    // ignore
  }

  // Reset html lang attribute
  document.documentElement.removeAttribute('lang');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Test component ────────────────────────────────────────────────────────────

function TestComponent() {
  const { locale, resolvedLocale, currency, setLocale, syncWithServer } = useLocale();
  return (
    <div>
      <div data-testid="locale">{locale}</div>
      <div data-testid="resolved-locale">{resolvedLocale}</div>
      <div data-testid="currency">{currency}</div>
      <button onClick={() => setLocale('en')}>Set English</button>
      <button onClick={() => setLocale('de')}>Set German</button>
      <button onClick={() => setLocale('system')}>Set System</button>
      <button onClick={() => void syncWithServer('user-001')}>Sync</button>
    </div>
  );
}

function renderWithProvider(children: ReactNode = <TestComponent />) {
  return render(<LocaleProvider>{children}</LocaleProvider>);
}

// ─── Initial state ─────────────────────────────────────────────────────────────

describe('LocaleProvider', () => {
  describe('initial state', () => {
    it('defaults to system locale when localStorage is empty', () => {
      renderWithProvider();
      expect(screen.getByTestId('locale').textContent).toBe('system');
    });

    it('resolvedLocale is "en" when browser language is English (default jsdom)', () => {
      renderWithProvider();
      // jsdom default navigator.language is 'en' or unset → resolves to 'en'
      expect(screen.getByTestId('resolved-locale').textContent).toBe('en');
    });

    it('reads stored locale from localStorage on mount', () => {
      localStorage.setItem('locale', 'de');
      renderWithProvider();
      expect(screen.getByTestId('locale').textContent).toBe('de');
    });

    it('resolvedLocale is "de" when localStorage has locale=de', () => {
      localStorage.setItem('locale', 'de');
      renderWithProvider();
      expect(screen.getByTestId('resolved-locale').textContent).toBe('de');
    });

    it('reads stored locale "en" from localStorage on mount', () => {
      localStorage.setItem('locale', 'en');
      renderWithProvider();
      expect(screen.getByTestId('locale').textContent).toBe('en');
      expect(screen.getByTestId('resolved-locale').textContent).toBe('en');
    });

    it('falls back to system if localStorage has an invalid value', () => {
      localStorage.setItem('locale', 'fr'); // fr is not a valid option
      renderWithProvider();
      expect(screen.getByTestId('locale').textContent).toBe('system');
    });

    it('currency defaults to EUR before config is fetched', () => {
      // Suppress the fetchConfig so it never resolves
      mockFetchConfig.mockReturnValue(new Promise(() => undefined));
      renderWithProvider();
      expect(screen.getByTestId('currency').textContent).toBe('EUR');
    });

    it('applies resolvedLocale to document.documentElement lang attribute', () => {
      localStorage.setItem('locale', 'de');
      renderWithProvider();
      expect(document.documentElement.getAttribute('lang')).toBe('de');
    });

    it('sets html lang="en" when resolved locale is English', () => {
      renderWithProvider();
      expect(document.documentElement.getAttribute('lang')).toBe('en');
    });
  });

  // ─── fetchConfig on mount ──────────────────────────────────────────────────

  describe('fetchConfig on mount', () => {
    it('calls fetchConfig once on mount', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(mockFetchConfig).toHaveBeenCalledTimes(1);
      });
    });

    it('updates currency from fetchConfig response', async () => {
      mockFetchConfig.mockResolvedValue({ currency: 'CHF' });

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('currency').textContent).toBe('CHF');
      });
    });

    it('keeps EUR when fetchConfig fails', async () => {
      mockFetchConfig.mockRejectedValue(new Error('Network error'));

      renderWithProvider();

      // Wait for async failure to settle
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(screen.getByTestId('currency').textContent).toBe('EUR');
    });

    it('keeps EUR when fetchConfig returns a config with no currency field', async () => {
      mockFetchConfig.mockResolvedValue({ currency: undefined as unknown as string });

      renderWithProvider();

      await waitFor(() => {
        // undefined ?? 'EUR' → 'EUR'
        expect(screen.getByTestId('currency').textContent).toBe('EUR');
      });
    });
  });

  // ─── setLocale() ──────────────────────────────────────────────────────────

  describe('setLocale()', () => {
    it('updates locale state when setLocale is called with "de"', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set German').click();
      });

      expect(screen.getByTestId('locale').textContent).toBe('de');
    });

    it('updates locale state when setLocale is called with "en"', () => {
      localStorage.setItem('locale', 'de');
      renderWithProvider();

      act(() => {
        screen.getByText('Set English').click();
      });

      expect(screen.getByTestId('locale').textContent).toBe('en');
    });

    it('updates resolvedLocale to "de" when locale is set to "de"', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set German').click();
      });

      expect(screen.getByTestId('resolved-locale').textContent).toBe('de');
    });

    it('updates resolvedLocale to "en" when locale is set to "en"', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set English').click();
      });

      expect(screen.getByTestId('resolved-locale').textContent).toBe('en');
    });

    it('updates localStorage when setLocale is called', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set German').click();
      });

      expect(localStorage.getItem('locale')).toBe('de');
    });

    it('resolves "system" via browser language (defaults to en in jsdom)', () => {
      localStorage.setItem('locale', 'de');
      renderWithProvider();

      act(() => {
        screen.getByText('Set System').click();
      });

      expect(screen.getByTestId('locale').textContent).toBe('system');
      // jsdom navigator.language defaults to 'en'
      expect(screen.getByTestId('resolved-locale').textContent).toBe('en');
    });

    it('updates html lang attribute when locale changes', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set German').click();
      });

      expect(document.documentElement.getAttribute('lang')).toBe('de');
    });

    it('does NOT call upsertPreference before user is authenticated', async () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set German').click();
      });

      // Brief wait to ensure any potential async calls would have fired
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('calls upsertPreference when authenticated user changes locale', async () => {
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockResolvedValue({
        key: 'locale',
        value: 'de',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      renderWithProvider();

      // First authenticate
      await act(async () => {
        screen.getByText('Sync').click();
      });

      act(() => {
        screen.getByText('Set German').click();
      });

      await waitFor(() => {
        expect(mockUpsertPreference).toHaveBeenCalledWith('locale', 'de');
      });
    });

    it('silently ignores upsertPreference errors after setLocale', async () => {
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockRejectedValue(new Error('Network failure'));

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      // Should not throw
      expect(() => {
        act(() => {
          screen.getByText('Set German').click();
        });
      }).not.toThrow();

      expect(screen.getByTestId('locale').textContent).toBe('de');
    });
  });

  // ─── syncWithServer() ─────────────────────────────────────────────────────

  describe('syncWithServer()', () => {
    it('applies server locale when server has a valid "de" locale preference', async () => {
      mockListPreferences.mockResolvedValueOnce([
        { key: 'locale', value: 'de', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('locale').textContent).toBe('de');
        expect(screen.getByTestId('resolved-locale').textContent).toBe('de');
      });
    });

    it('applies server locale when server has "en" preference', async () => {
      localStorage.setItem('locale', 'de');
      mockListPreferences.mockResolvedValueOnce([
        { key: 'locale', value: 'en', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('locale').textContent).toBe('en');
      });
    });

    it('removes localStorage when server locale is applied', async () => {
      localStorage.setItem('locale', 'en');
      mockListPreferences.mockResolvedValueOnce([
        { key: 'locale', value: 'de', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(localStorage.getItem('locale')).toBeNull();
      });
    });

    it('migrates localStorage locale to server when server has no locale preference', async () => {
      localStorage.setItem('locale', 'en');
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockResolvedValueOnce({
        key: 'locale',
        value: 'en',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(mockUpsertPreference).toHaveBeenCalledWith('locale', 'en');
      });
    });

    it('does NOT migrate to server when localStorage has default "system" value', async () => {
      // 'system' is the default — no explicit migration needed
      mockListPreferences.mockResolvedValueOnce([]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('handles network errors silently and keeps current locale from localStorage', async () => {
      localStorage.setItem('locale', 'de');
      mockListPreferences.mockRejectedValueOnce(new Error('Network failure'));

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      expect(screen.getByTestId('locale').textContent).toBe('de');
    });

    it('silently handles upsert failure during migration', async () => {
      localStorage.setItem('locale', 'de');
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockRejectedValueOnce(new Error('Network failure'));

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      // Should not throw, locale stays applied locally
      expect(screen.getByTestId('locale').textContent).toBe('de');
    });

    it('ignores server locale with invalid value', async () => {
      mockListPreferences.mockResolvedValueOnce([
        { key: 'locale', value: 'fr', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Locale stays at default 'system' since 'fr' is invalid
      expect(screen.getByTestId('locale').textContent).toBe('system');
    });
  });

  // ─── useLocale outside provider ───────────────────────────────────────────

  describe('useLocale()', () => {
    it('throws when used outside LocaleProvider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      function BadComponent() {
        useLocale();
        return null;
      }

      expect(() => {
        render(<BadComponent />);
      }).toThrow('useLocale must be used within a LocaleProvider');

      consoleSpy.mockRestore();
    });
  });
});

/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as PreferencesApiModule from '../lib/preferencesApi.js';
import type * as ThemeContextModule from './ThemeContext.js';

// Must mock BEFORE dynamic import of the component
const mockListPreferences = jest.fn<typeof PreferencesApiModule.listPreferences>();
const mockUpsertPreference = jest.fn<typeof PreferencesApiModule.upsertPreference>();
const mockDeletePreference = jest.fn<typeof PreferencesApiModule.deletePreference>();

jest.unstable_mockModule('../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  upsertPreference: mockUpsertPreference,
  deletePreference: mockDeletePreference,
}));

// Dynamic imports — resolved once and cached
let ThemeProvider: typeof ThemeContextModule.ThemeProvider;
let useTheme: typeof ThemeContextModule.useTheme;

beforeEach(async () => {
  if (!ThemeProvider) {
    const mod = await import('./ThemeContext.js');
    ThemeProvider = mod.ThemeProvider;
    useTheme = mod.useTheme;
  }
  mockListPreferences.mockReset();
  mockUpsertPreference.mockReset();
  mockDeletePreference.mockReset();

  // Clean localStorage before each test
  try {
    localStorage.clear();
  } catch {
    // ignore
  }

  // Restore document attributes
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Test component ───────────────────────────────────────────────────────────

function TestComponent() {
  const { theme, resolvedTheme, setTheme, syncWithServer } = useTheme();
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="resolved-theme">{resolvedTheme}</div>
      <button
        onClick={() => {
          setTheme('dark');
        }}
      >
        Set Dark
      </button>
      <button
        onClick={() => {
          setTheme('light');
        }}
      >
        Set Light
      </button>
      <button
        onClick={() => {
          setTheme('system');
        }}
      >
        Set System
      </button>
      <button
        onClick={() => {
          void syncWithServer('user-001');
        }}
      >
        Sync
      </button>
    </div>
  );
}

function renderWithProvider(children: ReactNode = <TestComponent />) {
  return render(<ThemeProvider>{children}</ThemeProvider>);
}

// ─── Initial state ────────────────────────────────────────────────────────────

describe('ThemeProvider', () => {
  describe('initial state', () => {
    it('defaults to system theme when localStorage is empty', () => {
      renderWithProvider();

      expect(screen.getByTestId('theme').textContent).toBe('system');
    });

    it('reads stored theme from localStorage on mount', () => {
      localStorage.setItem('theme', 'dark');

      renderWithProvider();

      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });

    it('falls back to system if localStorage has an invalid value', () => {
      localStorage.setItem('theme', 'invalid');

      renderWithProvider();

      expect(screen.getByTestId('theme').textContent).toBe('system');
    });

    it('applies the resolved theme to html data-theme attribute', () => {
      localStorage.setItem('theme', 'dark');

      renderWithProvider();

      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  // ─── setTheme() ─────────────────────────────────────────────────────────────

  describe('setTheme()', () => {
    it('updates theme state when setTheme is called', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set Dark').click();
      });

      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });

    it('sets resolvedTheme to dark when theme is set to dark', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set Dark').click();
      });

      expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    });

    it('sets resolvedTheme to light when theme is set to light', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set Light').click();
      });

      expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    });

    it('updates localStorage when setTheme is called', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set Dark').click();
      });

      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('updates html data-theme attribute when theme changes', () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set Dark').click();
      });

      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('calls upsertPreference when authenticated user sets theme', async () => {
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockResolvedValue({
        key: 'theme',
        value: 'light',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      renderWithProvider();

      // First authenticate (set the ref)
      await act(async () => {
        screen.getByText('Sync').click();
      });

      act(() => {
        screen.getByText('Set Light').click();
      });

      await waitFor(() => {
        expect(mockUpsertPreference).toHaveBeenCalledWith('theme', 'light');
      });
    });

    it('does NOT call upsertPreference before user is authenticated', async () => {
      renderWithProvider();

      act(() => {
        screen.getByText('Set Dark').click();
      });

      // Brief wait to ensure any potential async calls would have fired
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('silently ignores upsertPreference errors after setTheme', async () => {
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockRejectedValue(new Error('Network failure'));

      renderWithProvider();

      // Authenticate first
      await act(async () => {
        screen.getByText('Sync').click();
      });

      // Should not throw even if upsert fails
      expect(() => {
        act(() => {
          screen.getByText('Set Dark').click();
        });
      }).not.toThrow();

      // Theme should still be applied locally
      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });
  });

  // ─── syncWithServer() ────────────────────────────────────────────────────────

  describe('syncWithServer()', () => {
    it('applies server theme when server has a valid theme preference', async () => {
      mockListPreferences.mockResolvedValueOnce([
        { key: 'theme', value: 'dark', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('theme').textContent).toBe('dark');
      });
    });

    it('removes localStorage when server theme is applied', async () => {
      localStorage.setItem('theme', 'light');
      mockListPreferences.mockResolvedValueOnce([
        { key: 'theme', value: 'dark', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(localStorage.getItem('theme')).toBeNull();
      });
    });

    it('migrates localStorage theme to server when server has no theme preference', async () => {
      localStorage.setItem('theme', 'dark');
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockResolvedValueOnce({
        key: 'theme',
        value: 'dark',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(mockUpsertPreference).toHaveBeenCalledWith('theme', 'dark');
      });
    });

    it('does NOT migrate to server when localStorage has default system value', async () => {
      // 'system' is the default, so no explicit migration needed
      mockListPreferences.mockResolvedValueOnce([]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockUpsertPreference).not.toHaveBeenCalled();
    });

    it('handles network errors silently and keeps current theme from localStorage', async () => {
      localStorage.setItem('theme', 'light');
      mockListPreferences.mockRejectedValueOnce(new Error('Network failure'));

      renderWithProvider();

      // Should not throw
      await act(async () => {
        screen.getByText('Sync').click();
      });

      // Theme stays as loaded from localStorage
      expect(screen.getByTestId('theme').textContent).toBe('light');
    });

    it('silently handles upsert failure during migration', async () => {
      localStorage.setItem('theme', 'dark');
      mockListPreferences.mockResolvedValueOnce([]);
      mockUpsertPreference.mockRejectedValueOnce(new Error('Network failure'));

      renderWithProvider();

      // Should not throw
      await act(async () => {
        screen.getByText('Sync').click();
      });

      // Theme stays applied locally
      expect(screen.getByTestId('theme').textContent).toBe('dark');
    });

    it('sets resolvedTheme to the server theme value', async () => {
      mockListPreferences.mockResolvedValueOnce([
        { key: 'theme', value: 'light', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
      });
    });

    it('ignores server theme with invalid value', async () => {
      // Server returns an invalid value — should not apply it
      mockListPreferences.mockResolvedValueOnce([
        { key: 'theme', value: 'invalid-value', updatedAt: '2026-01-01T00:00:00Z' },
      ]);

      renderWithProvider();

      await act(async () => {
        screen.getByText('Sync').click();
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Theme stays as the default from localStorage (system)
      expect(screen.getByTestId('theme').textContent).toBe('system');
    });
  });

  // ─── useTheme outside provider ────────────────────────────────────────────────

  describe('useTheme()', () => {
    it('throws when used outside ThemeProvider', () => {
      // Suppress React's error boundary output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      function BadComponent() {
        useTheme();
        return null;
      }

      expect(() => {
        render(<BadComponent />);
      }).toThrow('useTheme must be used within a ThemeProvider');

      consoleSpy.mockRestore();
    });
  });
});

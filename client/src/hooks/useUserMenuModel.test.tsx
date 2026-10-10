/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type React from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GITHUB_URL, HELP_URL } from '../lib/externalLinks.js';
import { ShortcutRegistryProvider } from './shortcutRegistry.js';
import { useKeyboardShortcuts } from './useKeyboardShortcuts.js';
import type * as ModelTypes from './useUserMenuModel.js';

type Role = 'admin' | 'member';
let mockUser: { id: string; email: string; displayName: string; role: Role } | null;
let mockTheme: 'light' | 'dark' | 'system';
let mockLocale: 'en' | 'de';
const mockLogout = jest.fn<() => Promise<void>>();
const mockSetTheme = jest.fn<(theme: string) => void>();
const mockSetLocale = jest.fn<(locale: string) => void>();

jest.unstable_mockModule('../contexts/AuthContext.js', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));
jest.unstable_mockModule('../contexts/ThemeContext.js', () => ({
  useTheme: () => ({ theme: mockTheme, resolvedTheme: 'light', setTheme: mockSetTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.unstable_mockModule('../contexts/LocaleContext.js', () => ({
  useLocale: () => ({ resolvedLocale: mockLocale, setLocale: mockSetLocale }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('useUserMenuModel', () => {
  let mod: typeof ModelTypes;

  beforeEach(async () => {
    if (!mod) mod = await import('./useUserMenuModel.js');
    mockUser = { id: 'u1', email: 'sam@example.test', displayName: 'Sam Example', role: 'admin' };
    mockTheme = 'system';
    mockLocale = 'en';
    mockLogout.mockReset().mockResolvedValue(undefined);
    mockSetTheme.mockReset();
    mockSetLocale.mockReset();
  });

  function setup(withRegistry = true) {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter>
        {withRegistry ? <ShortcutRegistryProvider>{children}</ShortcutRegistryProvider> : children}
      </MemoryRouter>
    );
    return renderHook(() => mod.useUserMenuModel(), { wrapper });
  }

  it('returns user null when signed out', () => {
    mockUser = null;
    expect(setup().result.current.user).toBeNull();
  });

  it('describes the signed-in user with name, role label and initials', () => {
    expect(setup().result.current.user).toEqual({
      name: 'Sam Example',
      roleLabel: 'Administrator',
      initials: 'SE',
    });
  });

  it('uses the e-mail address when the display name is blank, and the Member label', () => {
    mockUser = { id: 'u', email: 'quinn@example.test', displayName: '   ', role: 'member' };
    const { user } = setup().result.current;
    expect(user).toEqual({ name: 'quinn@example.test', roleLabel: 'Member', initials: 'Q' });
  });

  it('builds the account link from the settingsProfile route', () => {
    expect(setup().result.current.account.href).toBe('/settings/profile');
  });

  it('offers light, dark and system themes in order and marks the current one', () => {
    mockTheme = 'dark';
    const { theme } = setup().result.current;
    expect(theme.value).toBe('dark');
    expect(theme.options.map((o) => [o.value, o.label])).toEqual([
      ['light', 'Light'],
      ['dark', 'Dark'],
      ['system', 'System'],
    ]);
  });

  it('theme.set forwards a known value and ignores an unknown one', () => {
    const { theme } = setup().result.current;
    theme.set('dark');
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
    theme.set('sepia');
    expect(mockSetTheme).toHaveBeenCalledTimes(1);
  });

  it('offers the locales as endonyms tagged with their lang', () => {
    mockLocale = 'de';
    const { language } = setup().result.current;
    expect(language.value).toBe('de');
    expect(language.options).toEqual([
      { value: 'en', label: 'English', lang: 'en' },
      { value: 'de', label: 'Deutsch', lang: 'de' },
    ]);
  });

  it('language.set forwards a known locale and ignores an unknown one', () => {
    const { language } = setup().result.current;
    language.set('de');
    expect(mockSetLocale).toHaveBeenCalledWith('de');
    language.set('fr');
    expect(mockSetLocale).toHaveBeenCalledTimes(1);
  });

  it('exposes the help and GitHub URLs and the version label', () => {
    const model = setup().result.current;
    expect(model.helpUrl).toBe(HELP_URL);
    expect(model.githubUrl).toBe(GITHUB_URL);
    expect(model.versionLabel).toBe('v0.0.0-test');
  });

  it('logOut sets the pending flag and calls logout once', () => {
    const { result } = setup();
    expect(result.current.loggingOut).toBe(false);
    act(() => result.current.logOut());
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(result.current.loggingOut).toBe(true);
  });

  describe('shortcutsSnapshot', () => {
    it('is empty without a registry', () => {
      expect(setup(false).result.current.shortcutsSnapshot()).toEqual([]);
    });

    it('lists what the current page registered', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <MemoryRouter>
          <ShortcutRegistryProvider>{children}</ShortcutRegistryProvider>
        </MemoryRouter>
      );
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts([
            { key: 'n', handler: () => {}, description: 'New synthetic task' },
          ]);
          return mod.useUserMenuModel();
        },
        { wrapper },
      );
      expect(result.current.shortcutsSnapshot().map((s) => s.description)).toEqual([
        'New synthetic task',
      ]);
    });
  });
});

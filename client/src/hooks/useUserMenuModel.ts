import { useState } from 'react';
import type { MouseEvent } from 'react';
import { routeUrl } from '@cornerstone/shared';
import { useHref, useLinkClickHandler } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext.js';
import { RESOLVED_LOCALES, useLocale } from '../contexts/LocaleContext.js';
import { useTheme } from '../contexts/ThemeContext.js';
import type { ResolvedLocale } from '../contexts/LocaleContext.js';
import type { ThemePreference } from '../contexts/ThemeContext.js';
import { GITHUB_URL, HELP_URL } from '../lib/externalLinks.js';
import { initialsOf } from '../lib/initials.js';
import { useShortcutRegistry } from './shortcutRegistry.js';
import type { KeyboardShortcut } from './useKeyboardShortcuts.js';

const LOCALE_LABELS: Record<ResolvedLocale, string> = { en: 'English', de: 'Deutsch' };
const THEME_ORDER: readonly ThemePreference[] = ['light', 'dark', 'system'];

export interface UserMenuChoice<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly lang?: string;
}

export interface UserMenuModel {
  readonly user: {
    readonly name: string;
    readonly roleLabel: string;
    readonly initials: string;
  } | null;
  readonly account: {
    readonly href: string;
    readonly onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  };
  readonly theme: {
    readonly value: ThemePreference;
    readonly options: readonly UserMenuChoice<ThemePreference>[];
    readonly set: (value: string) => void;
  };
  readonly language: {
    readonly value: ResolvedLocale;
    readonly options: readonly UserMenuChoice<ResolvedLocale>[];
    readonly set: (value: string) => void;
  };
  readonly helpUrl: string;
  readonly githubUrl: string;
  readonly versionLabel: string;
  readonly loggingOut: boolean;
  readonly logOut: () => void;
  readonly shortcutsSnapshot: () => KeyboardShortcut[];
}

/**
 * Everything the account controls need (identity, theme, language, links, log out), shared by
 * the desktop user menu and the phone More sheet so both offer exactly the same actions.
 */
export function useUserMenuModel(): UserMenuModel {
  const { t } = useTranslation(['common', 'settings']);
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { resolvedLocale, setLocale } = useLocale();
  const registry = useShortcutRegistry();
  const [pending, setPending] = useState(false);
  const accountUrl = routeUrl('settingsProfile');
  const accountHref = useHref(accountUrl);
  const handleAccountClick = useLinkClickHandler<HTMLAnchorElement>(accountUrl);

  const name = user ? user.displayName.trim() || user.email : '';
  const themeLabel: Record<ThemePreference, string> = {
    light: t('theme.light'),
    dark: t('theme.dark'),
    system: t('theme.system'),
  };

  return {
    user: user
      ? {
          name,
          roleLabel:
            user.role === 'admin'
              ? t('settings:userManagement.roles.admin')
              : t('settings:userManagement.roles.member'),
          initials: initialsOf(user.displayName, user.email),
        }
      : null,
    account: { href: accountHref, onClick: handleAccountClick },
    theme: {
      value: theme,
      options: THEME_ORDER.map((value) => ({ value, label: themeLabel[value] })),
      set: (value) => {
        const next = THEME_ORDER.find((option) => option === value);
        if (next) setTheme(next);
      },
    },
    language: {
      value: resolvedLocale,
      options: RESOLVED_LOCALES.map((value) => ({
        value,
        label: LOCALE_LABELS[value],
        lang: value,
      })),
      set: (value) => {
        const next = RESOLVED_LOCALES.find((locale) => locale === value);
        if (next) setLocale(next);
      },
    },
    helpUrl: HELP_URL,
    githubUrl: GITHUB_URL,
    versionLabel: t('userMenu.version', { version: __APP_VERSION__ }),
    loggingOut: pending,
    logOut: () => {
      setPending(true);
      void logout();
    },
    shortcutsSnapshot: () => registry?.snapshot() ?? [],
  };
}

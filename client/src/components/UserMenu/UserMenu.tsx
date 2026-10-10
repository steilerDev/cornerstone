import { useRef, useState } from 'react';
import type { UserRole } from '@cornerstone/shared';
import { routeUrl } from '@cornerstone/shared';
import { useHref, useLinkClickHandler, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext.js';
import { RESOLVED_LOCALES, useLocale } from '../../contexts/LocaleContext.js';
import { useTheme } from '../../contexts/ThemeContext.js';
import type { ResolvedLocale } from '../../contexts/LocaleContext.js';
import type { ThemePreference } from '../../contexts/ThemeContext.js';
import { useShortcutRegistry } from '../../hooks/shortcutRegistry.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { GITHUB_URL, HELP_URL } from '../../lib/externalLinks.js';
import { initialsOf } from '../../lib/initials.js';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { OverflowMenu } from '../OverflowMenu/OverflowMenu.js';
import type { OverflowMenuEntry } from '../OverflowMenu/OverflowMenu.js';
import styles from './UserMenu.module.css';

const LOCALE_LABELS: Record<ResolvedLocale, string> = { en: 'English', de: 'Deutsch' };
const THEME_ORDER: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** Avatar button with the account menu: account, theme, language, help, about and log out. */
export function UserMenu() {
  const { t } = useTranslation(['common', 'settings']);
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { resolvedLocale, setLocale } = useLocale();
  const location = useLocation();
  const registry = useShortcutRegistry();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[] | null>(null);
  const accountUrl = routeUrl('settingsProfile');
  const accountHref = useHref(accountUrl);
  const handleAccountClick = useLinkClickHandler<HTMLAnchorElement>(accountUrl);

  if (!user) return null;

  const name = user.displayName.trim() || user.email;
  const roleLabel: Record<UserRole, string> = {
    admin: t('settings:userManagement.roles.admin'),
    member: t('settings:userManagement.roles.member'),
  };
  const themeLabel: Record<ThemePreference, string> = {
    light: t('theme.light'),
    dark: t('theme.dark'),
    system: t('theme.system'),
  };
  const opensInNewTab = t('userMenu.opensInNewTab');

  const entries: OverflowMenuEntry[] = [
    {
      kind: 'link',
      id: 'account',
      label: t('userMenu.account'),
      href: accountHref,
      onClick: handleAccountClick,
      testId: 'user-menu-account',
    },
    { kind: 'separator', id: 'sep-account' },
    {
      kind: 'choice',
      id: 'theme',
      label: t('userMenu.theme'),
      value: theme,
      options: THEME_ORDER.map((value) => ({
        value,
        label: themeLabel[value],
        testId: `user-menu-theme-${value}`,
      })),
      onChange: (value) => {
        const next = THEME_ORDER.find((option) => option === value);
        if (next) setTheme(next);
      },
    },
    {
      kind: 'choice',
      id: 'language',
      label: t('userMenu.language'),
      value: resolvedLocale,
      options: RESOLVED_LOCALES.map((value) => ({
        value,
        label: LOCALE_LABELS[value],
        lang: value,
        testId: `user-menu-language-${value}`,
      })),
      onChange: (value) => {
        const next = RESOLVED_LOCALES.find((locale) => locale === value);
        if (next) setLocale(next);
      },
    },
    { kind: 'separator', id: 'sep-help' },
    {
      id: 'shortcuts',
      label: t('userMenu.shortcuts'),
      onClick: () => setShortcuts(registry?.snapshot() ?? []),
      testId: 'user-menu-shortcuts',
    },
    {
      kind: 'link',
      id: 'help',
      label: t('userMenu.help'),
      href: HELP_URL,
      newTab: true,
      srSuffix: opensInNewTab,
      testId: 'user-menu-help',
    },
    {
      kind: 'group',
      id: 'about',
      label: t('userMenu.about'),
      meta: t('userMenu.version', { version: __APP_VERSION__ }),
      items: [
        {
          kind: 'link',
          id: 'github',
          label: t('userMenu.github'),
          href: GITHUB_URL,
          newTab: true,
          srSuffix: opensInNewTab,
          testId: 'user-menu-github',
        },
      ],
    },
    { kind: 'separator', id: 'sep-logout' },
    {
      id: 'logout',
      label: pending ? t('userMenu.loggingOut') : t('userMenu.logOut'),
      keepOpen: true,
      ariaDisabled: pending,
      onClick: () => {
        setPending(true);
        void logout();
      },
      testId: 'user-menu-logout',
    },
  ];

  return (
    <>
      <OverflowMenu
        items={entries}
        triggerAriaLabel={t('topBar.accountMenu', { name })}
        triggerIcon={<span aria-hidden="true">{initialsOf(user.displayName, user.email)}</span>}
        triggerClassName={styles.avatar}
        menuClassName={styles.panel}
        header={
          <>
            <p className={styles.name}>{name}</p>
            <p className={styles.role}>{roleLabel[user.role]}</p>
          </>
        }
        closeSignal={location.key}
        triggerRef={triggerRef}
        data-testid="user-menu-trigger"
        menuTestId="user-menu"
      />
      {shortcuts && (
        <KeyboardShortcutsHelp
          shortcuts={shortcuts}
          emptyMessage={t('keyboardShortcuts.noPageShortcuts')}
          onClose={() => {
            setShortcuts(null);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

export default UserMenu;

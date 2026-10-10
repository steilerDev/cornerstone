import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useUserMenuModel } from '../../hooks/useUserMenuModel.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { OverflowMenu } from '../OverflowMenu/OverflowMenu.js';
import type { OverflowMenuEntry } from '../OverflowMenu/OverflowMenu.js';
import styles from './UserMenu.module.css';

/** Avatar button with the account menu: account, theme, language, help, about and log out. */
export function UserMenu() {
  const { t } = useTranslation('common');
  const model = useUserMenuModel();
  const location = useLocation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[] | null>(null);

  const { user } = model;
  if (!user) return null;

  const opensInNewTab = t('userMenu.opensInNewTab');

  const entries: OverflowMenuEntry[] = [
    {
      kind: 'link',
      id: 'account',
      label: t('userMenu.account'),
      href: model.account.href,
      onClick: model.account.onClick,
      testId: 'user-menu-account',
    },
    { kind: 'separator', id: 'sep-account' },
    {
      kind: 'choice',
      id: 'theme',
      label: t('userMenu.theme'),
      value: model.theme.value,
      options: model.theme.options.map((option) => ({
        ...option,
        testId: `user-menu-theme-${option.value}`,
      })),
      onChange: model.theme.set,
    },
    {
      kind: 'choice',
      id: 'language',
      label: t('userMenu.language'),
      value: model.language.value,
      options: model.language.options.map((option) => ({
        ...option,
        testId: `user-menu-language-${option.value}`,
      })),
      onChange: model.language.set,
    },
    { kind: 'separator', id: 'sep-help' },
    {
      id: 'shortcuts',
      label: t('userMenu.shortcuts'),
      onClick: () => setShortcuts(model.shortcutsSnapshot()),
      testId: 'user-menu-shortcuts',
    },
    {
      kind: 'link',
      id: 'help',
      label: t('userMenu.help'),
      href: model.helpUrl,
      newTab: true,
      srSuffix: opensInNewTab,
      testId: 'user-menu-help',
    },
    {
      kind: 'group',
      id: 'about',
      label: t('userMenu.about'),
      meta: model.versionLabel,
      items: [
        {
          kind: 'link',
          id: 'github',
          label: t('userMenu.github'),
          href: model.githubUrl,
          newTab: true,
          srSuffix: opensInNewTab,
          testId: 'user-menu-github',
        },
      ],
    },
    { kind: 'separator', id: 'sep-logout' },
    {
      id: 'logout',
      label: model.loggingOut ? t('userMenu.loggingOut') : t('userMenu.logOut'),
      keepOpen: true,
      ariaDisabled: model.loggingOut,
      onClick: model.logOut,
      testId: 'user-menu-logout',
    },
  ];

  return (
    <>
      <OverflowMenu
        items={entries}
        triggerAriaLabel={t('topBar.accountMenu', { name: user.name })}
        triggerIcon={<span aria-hidden="true">{user.initials}</span>}
        triggerClassName={styles.avatar}
        menuClassName={styles.panel}
        header={
          <>
            <p className={styles.name}>{user.name}</p>
            <p className={styles.role}>{user.roleLabel}</p>
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

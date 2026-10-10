import { useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { useHardwareKeyboard } from '../../hooks/useHardwareKeyboard.js';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { useUserMenuModel } from '../../hooks/useUserMenuModel.js';
import type { UserMenuChoice } from '../../hooks/useUserMenuModel.js';
import { navHref } from '../../navigation/navActive.js';
import type { NavActive } from '../../navigation/navActive.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { MORE_SHEET } from '../../navigation/navConfig.js';
import type { NavSection } from '../../navigation/navConfig.js';
import sharedStyles from '../../styles/shared.module.css';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp/KeyboardShortcutsHelp.js';
import { Sheet } from '../Modal/Sheet.js';
import styles from './MoreSheet.module.css';

export interface MoreSheetProps {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sections: readonly NavSection[];
  readonly active: NavActive | null;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

interface ChoiceFieldProps<T extends string> {
  readonly name: string;
  readonly legend: string;
  readonly value: T;
  readonly options: readonly UserMenuChoice<T>[];
  readonly onChange: (value: string) => void;
  readonly testIdPrefix: string;
}

/** Radio group styled as the user menu's segmented choice. Selecting keeps the sheet open. */
function ChoiceField<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  testIdPrefix,
}: ChoiceFieldProps<T>) {
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(styles.option, selected && styles.optionSelected)}
              lang={option.lang}
              data-testid={`${testIdPrefix}-${option.value}`}
            >
              <input
                type="radio"
                className={styles.radio}
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              {selected && <span aria-hidden="true">✓ </span>}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Content of the phone/tablet "More" sheet: remaining sections, then the account block. */
export function MoreSheet({ id, open, onClose, sections, active, returnFocusRef }: MoreSheetProps) {
  const { t } = useTranslation('common');
  const model = useUserMenuModel();
  const hardwareKeyboard = useHardwareKeyboard();
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[] | null>(null);
  const opensInNewTab = t('userMenu.opensInNewTab');

  const groups = MORE_SHEET.map((ids) =>
    ids
      .map((sectionId) => sections.find((s) => s.id === sectionId))
      .filter((s): s is NavSection => s !== undefined),
  ).filter((group) => group.length > 0);

  return (
    <>
      <Sheet
        id={id}
        open={open}
        onClose={onClose}
        title={t('navigation.more')}
        returnFocusRef={returnFocusRef}
        testId="more-sheet"
      >
        <nav aria-label={t('navigation.more')}>
          {groups.map((group) => (
            <ul key={group.map((s) => s.id).join('-')} className={styles.group}>
              {group.map((section) => {
                const isCurrent = active?.sectionId === section.id;
                return (
                  <li key={section.id}>
                    <NavAnchor
                      to={navHref(section.route)}
                      replace={isCurrent && active.exact}
                      onNavigate={onClose}
                      className={cx(styles.row, isCurrent && styles.rowCurrent)}
                      aria-current={isCurrent ? 'page' : undefined}
                      data-testid={`more-sheet-section-${section.id}`}
                    >
                      {t(section.labelKey)}
                    </NavAnchor>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>
        {model.user && (
          <div className={styles.userBlock} data-testid="more-sheet-user">
            <p className={styles.userName}>{model.user.name}</p>
            <p className={styles.userRole}>{model.user.roleLabel}</p>
            <NavAnchor
              to={routeUrl('settingsProfile')}
              onNavigate={onClose}
              className={styles.row}
              data-testid="more-sheet-account"
            >
              {t('userMenu.account')}
            </NavAnchor>
            <ChoiceField
              name={`${id}-theme`}
              legend={t('userMenu.theme')}
              value={model.theme.value}
              options={model.theme.options}
              onChange={model.theme.set}
              testIdPrefix="more-sheet-theme"
            />
            <ChoiceField
              name={`${id}-language`}
              legend={t('userMenu.language')}
              value={model.language.value}
              options={model.language.options}
              onChange={model.language.set}
              testIdPrefix="more-sheet-language"
            />
            <a
              href={model.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.row}
              data-testid="more-sheet-help"
            >
              {t('userMenu.help')}
              <span aria-hidden="true" className={styles.external}>
                ↗
              </span>
              <span className={sharedStyles.srOnly}>{opensInNewTab}</span>
            </a>
            <div className={styles.about} data-testid="more-sheet-about">
              <span className={styles.aboutLabel}>{t('userMenu.about')}</span>
              <span className={styles.aboutVersion}>
                {t('appName')} {model.versionLabel}
              </span>
            </div>
            <a
              href={model.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.row}
              data-testid="more-sheet-github"
            >
              {t('userMenu.github')}
              <span aria-hidden="true" className={styles.external}>
                ↗
              </span>
              <span className={sharedStyles.srOnly}>{opensInNewTab}</span>
            </a>
            {hardwareKeyboard && (
              <button
                type="button"
                className={styles.row}
                data-testid="more-sheet-shortcuts"
                onClick={() => {
                  const snapshot = model.shortcutsSnapshot();
                  onClose();
                  setShortcuts(snapshot);
                }}
              >
                {t('userMenu.shortcuts')}
              </button>
            )}
            <button
              type="button"
              className={styles.row}
              aria-disabled={model.loggingOut ? 'true' : undefined}
              onClick={() => {
                if (!model.loggingOut) model.logOut();
              }}
              data-testid="more-sheet-logout"
            >
              {model.loggingOut ? t('userMenu.loggingOut') : t('userMenu.logOut')}
            </button>
          </div>
        )}
      </Sheet>
      {shortcuts && (
        <KeyboardShortcutsHelp
          shortcuts={shortcuts}
          emptyMessage={t('keyboardShortcuts.noPageShortcuts')}
          onClose={() => {
            setShortcuts(null);
            returnFocusRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

export default MoreSheet;

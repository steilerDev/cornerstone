import { Fragment, useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { RegisteredShortcut } from '../../hooks/shortcutRegistry.js';
import { isSingleKeyShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { isApplePlatform } from '../../lib/platform.js';
import sharedStyles from '../../styles/shared.module.css';
import { Badge } from '../Badge/Badge.js';
import type { BadgeVariantMap } from '../Badge/Badge.js';
import badgeStyles from '../Badge/Badge.module.css';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { Modal } from '../Modal/Modal.js';
import { groupShortcuts, keyCapsFor } from './keyCaps.js';
import styles from './KeyboardShortcutsHelp.module.css';

export interface KeyboardShortcutsHelpProps {
  readonly shortcuts: readonly RegisteredShortcut[];
  readonly singleKeyEnabled: boolean;
  readonly onSingleKeyEnabledChange: (enabled: boolean) => void;
  readonly onClose: () => void;
}

export function KeyboardShortcutsHelp({
  shortcuts,
  singleKeyEnabled,
  onSingleKeyEnabledChange,
  onClose,
}: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation('common');
  const baseId = useId();
  const groups = groupShortcuts(shortcuts);
  const apple = isApplePlatform();
  const offVariants: BadgeVariantMap = {
    off: { label: t('keyboardShortcuts.turnedOff'), className: badgeStyles.neutral! },
  };

  const renderTable = (rows: readonly RegisteredShortcut[], headingId: string) => (
    <table className={styles.shortcutsTable} aria-labelledby={headingId}>
      <colgroup>
        <col className={styles.keyColumn} />
        <col className={styles.descriptionColumn} />
      </colgroup>
      <tbody>
        {rows.map((shortcut) => {
          const off = !singleKeyEnabled && isSingleKeyShortcut(shortcut.key);
          const caps = keyCapsFor(shortcut.key, t, apple);
          return (
            <tr
              key={shortcut.key}
              data-testid="keyboard-shortcut-row"
              data-key={shortcut.key}
              data-off={off || undefined}
              className={off ? styles.rowOff : undefined}
            >
              <td className={styles.keyCell}>
                {caps.map((cap, index) => (
                  <Fragment key={cap.text}>
                    {index > 0 && (
                      <span className={styles.then}>{t('keyboardShortcuts.then')}</span>
                    )}
                    <kbd className={styles.kbd}>
                      {cap.spoken ? (
                        <>
                          <span aria-hidden="true">{cap.text}</span>
                          <span className={sharedStyles.srOnly}>{cap.spoken}</span>
                        </>
                      ) : (
                        cap.text
                      )}
                    </kbd>
                  </Fragment>
                ))}
              </td>
              <td className={styles.descriptionCell}>
                {shortcut.description}
                {off && (
                  <Badge
                    variants={offVariants}
                    value="off"
                    className={styles.offBadge}
                    testId="keyboard-shortcut-off"
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const pageId = `${baseId}-page`;
  const globalId = `${baseId}-global`;
  const goToId = `${baseId}-goto`;

  return (
    <Modal
      title={t('keyboardShortcuts.title')}
      onClose={onClose}
      footer={
        <label className={styles.switchLabel}>
          <input
            type="checkbox"
            role="switch"
            className={styles.switchInput}
            checked={singleKeyEnabled}
            onChange={(event) => onSingleKeyEnabledChange(event.target.checked)}
            data-testid="keyboard-shortcuts-single-key-switch"
          />
          {t('keyboardShortcuts.singleKeySwitch')}
        </label>
      }
    >
      <h3 id={pageId} className={styles.sectionHeading}>
        {t('keyboardShortcuts.groupPage')}
      </h3>
      {groups.page.length === 0 ? (
        <EmptyState message={t('keyboardShortcuts.noPageShortcuts')} />
      ) : (
        renderTable(groups.page, pageId)
      )}
      {groups.global.length > 0 && (
        <>
          <h3 id={globalId} className={styles.sectionHeading}>
            {t('keyboardShortcuts.everywhere')}
          </h3>
          {renderTable(groups.global, globalId)}
        </>
      )}
      {groups.goTo.length > 0 && (
        <>
          <h3 id={goToId} className={styles.sectionHeading}>
            {t('keyboardShortcuts.groupGoTo')}
          </h3>
          {renderTable(groups.goTo, goToId)}
        </>
      )}
    </Modal>
  );
}

export default KeyboardShortcutsHelp;

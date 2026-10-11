import { useTranslation } from 'react-i18next';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { isApplePlatform } from '../../lib/platform.js';
import { EmptyState } from '../EmptyState/EmptyState.js';
import { Modal } from '../Modal/Modal.js';
import styles from './KeyboardShortcutsHelp.module.css';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
  /** Shown instead of the table when there is nothing to list. */
  emptyMessage?: string;
}

export function KeyboardShortcutsHelp({
  shortcuts,
  onClose,
  emptyMessage,
}: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation('common');
  const listed = shortcuts.filter((shortcut) => shortcut.description);
  return (
    <Modal title={t('keyboardShortcuts.title')} onClose={onClose}>
      {listed.length === 0 && emptyMessage ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <table className={styles.shortcutsTable}>
          <thead>
            <tr>
              <th className={styles.keyColumn}>{t('keyboardShortcuts.keyColumn')}</th>
              <th className={styles.descriptionColumn}>{t('keyboardShortcuts.actionColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((shortcut) => (
              <tr key={shortcut.key}>
                <td className={styles.keyCell}>
                  <kbd className={styles.kbd}>{shortcut.key}</kbd>
                </td>
                <td className={styles.descriptionCell}>{shortcut.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className={styles.sectionHeading}>{t('keyboardShortcuts.everywhere')}</h3>
      <table className={styles.shortcutsTable}>
        <tbody>
          <tr>
            <td className={styles.keyCell}>
              <kbd className={styles.kbd}>
                {isApplePlatform()
                  ? t('undoToast.shortcutKeyApple')
                  : t('undoToast.shortcutKeyOther')}
              </kbd>
            </td>
            <td className={styles.descriptionCell}>{t('undoToast.shortcutHelp')}</td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}

export default KeyboardShortcutsHelp;

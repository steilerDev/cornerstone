import { useTranslation } from 'react-i18next';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import { Modal } from '../Modal/Modal.js';
import styles from './KeyboardShortcutsHelp.module.css';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ shortcuts, onClose }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation('common');
  return (
    <Modal title={t('keyboardShortcuts.title')} onClose={onClose}>
      <table className={styles.shortcutsTable}>
        <thead>
          <tr>
            <th className={styles.keyColumn}>{t('keyboardShortcuts.keyColumn')}</th>
            <th className={styles.descriptionColumn}>{t('keyboardShortcuts.actionColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {shortcuts
            .filter((shortcut) => shortcut.description)
            .map((shortcut) => (
              <tr key={shortcut.key}>
                <td className={styles.keyCell}>
                  <kbd className={styles.kbd}>{shortcut.key}</kbd>
                </td>
                <td className={styles.descriptionCell}>{shortcut.description}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </Modal>
  );
}

export default KeyboardShortcutsHelp;

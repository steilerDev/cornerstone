import { useTranslation } from 'react-i18next';
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import styles from './KeyboardShortcutsHelp.module.css';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ shortcuts, onClose }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation('common');
  return (
    <div className={styles.modal} role="dialog" aria-modal="true">
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t('keyboardShortcuts.title')}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t('keyboardShortcuts.closeAriaLabel')}>
            ×
          </button>
        </div>
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
      </div>
    </div>
  );
}

export default KeyboardShortcutsHelp;

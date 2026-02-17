import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts.js';
import styles from './KeyboardShortcutsHelp.module.css';

interface KeyboardShortcutsHelpProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ shortcuts, onClose }: KeyboardShortcutsHelpProps) {
  return (
    <div className={styles.modal} role="dialog" aria-modal="true">
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Keyboard Shortcuts</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <table className={styles.shortcutsTable}>
          <thead>
            <tr>
              <th className={styles.keyColumn}>Key</th>
              <th className={styles.descriptionColumn}>Action</th>
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

import styles from '../../pages/WorkItemDetailPage/WorkItemDetailPage.module.css';

export type AutosaveState = 'idle' | 'saving' | 'success' | 'error';

interface AutosaveIndicatorProps {
  state: AutosaveState;
}

/**
 * Small inline indicator shown next to autosaved fields.
 * Renders nothing when state is 'idle'.
 * Shows a spinner character while saving, a checkmark on success, and an X on error.
 */
export function AutosaveIndicator({ state }: AutosaveIndicatorProps) {
  if (state === 'idle') return null;
  return (
    <span
      className={`${styles.autosaveIndicator} ${
        state === 'saving'
          ? styles.autosaveSaving
          : state === 'success'
            ? styles.autosaveSuccess
            : styles.autosaveError
      }`}
      aria-live="polite"
    >
      {state === 'saving' ? '…' : state === 'success' ? '✓' : '✗'}
    </span>
  );
}

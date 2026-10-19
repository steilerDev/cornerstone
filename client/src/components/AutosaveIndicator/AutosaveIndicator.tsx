import styles from './AutosaveIndicator.module.css';

export type AutosaveState = 'idle' | 'saving' | 'success' | 'error';

interface AutosaveIndicatorProps {
  state: AutosaveState;
  /** `icon` (default): spinner/check/cross glyph. `text`: the `label` words. */
  variant?: 'icon' | 'text';
  /** Text variant only: the visible words, e.g. "Saved 14:32" (rendered aria-hidden). */
  label?: string;
}

/**
 * Small inline indicator shown next to autosaved fields.
 * Renders nothing when state is 'idle'.
 * Icon variant: spinner character while saving, checkmark on success, X on error.
 * Text variant: the supplied label (announcing it is the host's job).
 */
export function AutosaveIndicator({ state, variant = 'icon', label }: AutosaveIndicatorProps) {
  if (state === 'idle') return null;
  const stateClass =
    state === 'saving'
      ? styles.autosaveSaving
      : state === 'success'
        ? styles.autosaveSuccess
        : styles.autosaveError;
  if (variant === 'text') {
    if (!label) return null;
    return (
      <span aria-hidden="true" className={`${styles.text} ${stateClass}`}>
        {label}
      </span>
    );
  }
  return (
    <span className={`${styles.autosaveIndicator} ${stateClass}`} aria-live="polite">
      {state === 'saving' ? '…' : state === 'success' ? '✓' : '✗'}
    </span>
  );
}

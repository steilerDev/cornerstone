import { useEffect, useRef } from 'react';
import styles from './TriStateCheckbox.module.css';

export interface TriStateCheckboxProps {
  id?: string;
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  /** Keeps `label` as the accessible name only; no visible text. */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TriStateCheckbox({
  id,
  checked,
  indeterminate,
  onChange,
  label,
  hideLabel = false,
  disabled = false,
  className,
}: TriStateCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current!.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label className={`${styles.label} ${hideLabel ? styles.labelHidden : ''} ${className || ''}`}>
      <input
        ref={inputRef}
        id={id}
        type="checkbox"
        className={styles.checkbox}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      {label && !hideLabel && <span className={styles.text}>{label}</span>}
    </label>
  );
}

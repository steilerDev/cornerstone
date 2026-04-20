import { useEffect, useRef } from 'react';
import styles from './TriStateCheckbox.module.css';

export interface TriStateCheckboxProps {
  id?: string;
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function TriStateCheckbox({
  id,
  checked,
  indeterminate,
  onChange,
  label,
  disabled = false,
  className,
}: TriStateCheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className={`${styles.label} ${className || ''}`}>
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
      {label && <span className={styles.text}>{label}</span>}
    </label>
  );
}

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Filter.module.css';

export interface StringFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Text input filter for DataTable
 * Auto-applies on input change
 */
export function StringFilter({ value, onChange, placeholder = 'Filter...' }: StringFilterProps) {
  const { t } = useTranslation('common');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Auto-apply on every keystroke
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className={styles.filterContent}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={styles.filterInput}
        autoFocus
      />
    </div>
  );
}

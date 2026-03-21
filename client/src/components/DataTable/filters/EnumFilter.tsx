import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnumOption } from '../DataTable.js';
import styles from './Filter.module.css';

export interface EnumFilterProps {
  value: string;
  onChange: (value: string) => void;
  options: EnumOption[];
}

/**
 * Checkbox list filter for enum/select values
 * Stores as comma-separated values
 * Auto-applies on checkbox change
 */
export function EnumFilter({ value, onChange, options }: EnumFilterProps) {
  const { t } = useTranslation('common');

  const parseValue = (v: string) => new Set(v ? v.split(',') : []);
  const [selected, setSelected] = useState(parseValue(value));

  const handleToggle = useCallback(
    (optionValue: string) => {
      setSelected((prev) => {
        const updated = new Set(prev);
        if (updated.has(optionValue)) {
          updated.delete(optionValue);
        } else {
          updated.add(optionValue);
        }
        // Auto-apply by calling onChange immediately
        const joined = Array.from(updated).join(',');
        onChange(joined);
        return updated;
      });
    },
    [onChange],
  );

  const handleSelectAll = useCallback(() => {
    const allValues = options.map((opt) => opt.value);
    setSelected(new Set(allValues));
    onChange(allValues.join(','));
  }, [options, onChange]);

  const handleSelectNone = useCallback(() => {
    setSelected(new Set());
    onChange('');
  }, [onChange]);

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterQuickActions}>
        <button type="button" className={styles.filterQuickActionButton} onClick={handleSelectAll}>
          {t('dataTable.filter.selectAll')}
        </button>
        <button type="button" className={styles.filterQuickActionButton} onClick={handleSelectNone}>
          {t('dataTable.filter.selectNone')}
        </button>
      </div>
      <div className={styles.filterCheckboxGroup}>
        {options.map((option) => (
          <label
            key={option.value}
            className={styles.filterCheckboxItem}
            htmlFor={`enum-${option.value}`}
          >
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => handleToggle(option.value)}
              className={styles.filterCheckbox}
              id={`enum-${option.value}`}
            />
            <span className={styles.filterCheckboxLabel}>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

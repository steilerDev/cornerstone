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
        return updated;
      });
    },
    [],
  );

  const handleApply = useCallback(() => {
    const joined = Array.from(selected).join(',');
    onChange(joined);
  }, [selected, onChange]);

  const handleClear = useCallback(() => {
    setSelected(new Set());
    onChange('');
  }, [onChange]);

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterCheckboxGroup}>
        {options.map((option) => (
          <div
            key={option.value}
            className={styles.filterCheckboxItem}
            onClick={() => handleToggle(option.value)}
          >
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => {}}
              className={styles.filterCheckbox}
              id={`enum-${option.value}`}
            />
            <label htmlFor={`enum-${option.value}`} className={styles.filterCheckboxLabel}>
              {option.label}
            </label>
          </div>
        ))}
      </div>
      <div className={styles.filterActions}>
        <button
          type="button"
          className={styles.filterButton}
          onClick={handleApply}
        >
          {t('dataTable.filter.applyFilter')}
        </button>
        {value && (
          <button
            type="button"
            className={styles.filterButtonSecondary}
            onClick={handleClear}
          >
            {t('dataTable.filter.clearFilter')}
          </button>
        )}
      </div>
    </div>
  );
}

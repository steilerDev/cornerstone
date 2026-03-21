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
 */
export function StringFilter({
  value,
  onChange,
  placeholder = 'Filter...',
}: StringFilterProps) {
  const { t } = useTranslation('common');
  const [input, setInput] = useState(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
    },
    [],
  );

  const handleApply = useCallback(() => {
    onChange(input);
  }, [input, onChange]);

  const handleClear = useCallback(() => {
    setInput('');
    onChange('');
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleApply();
      }
    },
    [handleApply],
  );

  return (
    <div className={styles.filterContent}>
      <input
        type="text"
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={styles.filterInput}
        autoFocus
      />
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

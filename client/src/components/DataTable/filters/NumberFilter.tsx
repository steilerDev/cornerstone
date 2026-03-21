import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Filter.module.css';

export interface NumberFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Min/max number range filter for DataTable
 * Stores as "min:X,max:Y" format
 */
export function NumberFilter({ value, onChange }: NumberFilterProps) {
  const { t } = useTranslation('common');

  const parseValue = (v: string) => {
    const min = v.match(/min:(\d+)/)?.[1] || '';
    const max = v.match(/max:(\d+)/)?.[1] || '';
    return { min, max };
  };

  const { min, max } = parseValue(value);
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);

  const handleApply = useCallback(() => {
    const parts = [];
    if (localMin) parts.push(`min:${localMin}`);
    if (localMax) parts.push(`max:${localMax}`);
    onChange(parts.join(','));
  }, [localMin, localMax, onChange]);

  const handleClear = useCallback(() => {
    setLocalMin('');
    setLocalMax('');
    onChange('');
  }, [onChange]);

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.min')}</label>
        <input
          type="number"
          value={localMin}
          onChange={(e) => setLocalMin(e.target.value)}
          placeholder="0"
          className={styles.filterRangeInput}
          autoFocus
        />
      </div>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.max')}</label>
        <input
          type="number"
          value={localMax}
          onChange={(e) => setLocalMax(e.target.value)}
          placeholder="999999"
          className={styles.filterRangeInput}
        />
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

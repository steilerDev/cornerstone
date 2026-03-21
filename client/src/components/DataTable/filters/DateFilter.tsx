import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Filter.module.css';

export interface DateFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * From/to date range filter for DataTable
 * Stores as "from:YYYY-MM-DD,to:YYYY-MM-DD" format
 */
export function DateFilter({ value, onChange }: DateFilterProps) {
  const { t } = useTranslation('common');

  const parseValue = (v: string) => {
    const from = v.match(/from:([\d-]+)/)?.[1] || '';
    const to = v.match(/to:([\d-]+)/)?.[1] || '';
    return { from, to };
  };

  const { from, to } = parseValue(value);
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);

  const handleApply = useCallback(() => {
    const parts = [];
    if (localFrom) parts.push(`from:${localFrom}`);
    if (localTo) parts.push(`to:${localTo}`);
    onChange(parts.join(','));
  }, [localFrom, localTo, onChange]);

  const handleClear = useCallback(() => {
    setLocalFrom('');
    setLocalTo('');
    onChange('');
  }, [onChange]);

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.from')}</label>
        <input
          type="date"
          value={localFrom}
          onChange={(e) => setLocalFrom(e.target.value)}
          className={styles.filterDateInput}
          autoFocus
        />
      </div>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.to')}</label>
        <input
          type="date"
          value={localTo}
          onChange={(e) => setLocalTo(e.target.value)}
          className={styles.filterDateInput}
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

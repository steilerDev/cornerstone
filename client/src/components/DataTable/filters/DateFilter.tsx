import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Filter.module.css';

export interface DateFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * From/to date range filter for DataTable
 * Stores as "from:YYYY-MM-DD,to:YYYY-MM-DD" format
 * Auto-applies on date input change
 */
export function DateFilter({ value, onChange }: DateFilterProps) {
  const { t } = useTranslation('common');
  const toInputRef = useRef<HTMLInputElement>(null);

  const parseValue = (v: string) => {
    const from = v.match(/from:([\d-]+)/)?.[1] || '';
    const to = v.match(/to:([\d-]+)/)?.[1] || '';
    return { from, to };
  };

  const { from, to } = parseValue(value);
  const [localFrom, setLocalFrom] = useState(from);
  const [localTo, setLocalTo] = useState(to);

  const fromConfirmed = localFrom !== '';

  const emitChange = useCallback(
    (newFrom: string, newTo: string) => {
      const parts = [];
      if (newFrom) parts.push(`from:${newFrom}`);
      if (newTo) parts.push(`to:${newTo}`);
      onChange(parts.join(','));
    },
    [onChange],
  );

  const handleFromChange = useCallback(
    (newFrom: string) => {
      setLocalFrom(newFrom);
      emitChange(newFrom, localTo);
      if (newFrom) {
        setTimeout(() => toInputRef.current?.focus(), 0);
      }
    },
    [localTo, emitChange],
  );

  const handleToChange = useCallback(
    (newTo: string) => {
      setLocalTo(newTo);
      emitChange(localFrom, newTo);
    },
    [localFrom, emitChange],
  );

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.from')}</label>
        <input
          type="date"
          value={localFrom}
          onChange={(e) => handleFromChange(e.target.value)}
          className={`${styles.filterDateInput} ${fromConfirmed ? styles.filterDateInputConfirmed : ''}`}
          autoFocus
        />
      </div>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.to')}</label>
        <input
          type="date"
          value={localTo}
          onChange={(e) => handleToChange(e.target.value)}
          className={styles.filterDateInput}
          ref={toInputRef}
        />
      </div>
    </div>
  );
}

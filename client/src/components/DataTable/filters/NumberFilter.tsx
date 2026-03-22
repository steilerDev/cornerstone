import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Filter.module.css';

export interface NumberFilterProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Min/max number range filter for DataTable
 * Stores as "min:X,max:Y" format
 * Auto-applies on input/slider change
 */
export function NumberFilter({ value, onChange, min: minBound, max: maxBound, step }: NumberFilterProps) {
  const { t } = useTranslation('common');

  const parseValue = (v: string) => {
    const min = v.match(/min:(\d+)/)?.[1] || '';
    const max = v.match(/max:(\d+)/)?.[1] || '';
    return { min, max };
  };

  const { min, max } = parseValue(value);
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);

  const emitChange = useCallback(
    (newMin: string, newMax: string) => {
      const parts = [];
      if (newMin) parts.push(`min:${newMin}`);
      if (newMax) parts.push(`max:${newMax}`);
      onChange(parts.join(','));
    },
    [onChange],
  );

  const handleMinChange = useCallback(
    (newMin: string) => {
      setLocalMin(newMin);
      emitChange(newMin, localMax);
    },
    [localMax, emitChange],
  );

  const handleMaxChange = useCallback(
    (newMax: string) => {
      setLocalMax(newMax);
      emitChange(localMin, newMax);
    },
    [localMin, emitChange],
  );

  const defaultMin = minBound ?? 0;
  const defaultMax = maxBound ?? 999999;
  const defaultStep = step ?? 1;

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.min')}</label>
        <input
          type="number"
          value={localMin}
          onChange={(e) => handleMinChange(e.target.value)}
          placeholder={String(defaultMin)}
          className={styles.filterRangeInput}
          min={defaultMin}
          max={defaultMax}
          step={defaultStep}
          autoFocus
        />
      </div>
      <input
        type="range"
        value={localMin || String(defaultMin)}
        onChange={(e) => handleMinChange(e.target.value)}
        className={styles.filterRangeSlider}
        min={defaultMin}
        max={defaultMax}
        step={defaultStep}
        aria-label={t('dataTable.filter.min')}
      />
      <div className={styles.filterRangeRow}>
        <label className={styles.filterRangeLabel}>{t('dataTable.filter.max')}</label>
        <input
          type="number"
          value={localMax}
          onChange={(e) => handleMaxChange(e.target.value)}
          placeholder={String(defaultMax)}
          className={styles.filterRangeInput}
          min={defaultMin}
          max={defaultMax}
          step={defaultStep}
        />
      </div>
      <input
        type="range"
        value={localMax || String(defaultMax)}
        onChange={(e) => handleMaxChange(e.target.value)}
        className={styles.filterRangeSlider}
        min={defaultMin}
        max={defaultMax}
        step={defaultStep}
        aria-label={t('dataTable.filter.max')}
      />
    </div>
  );
}

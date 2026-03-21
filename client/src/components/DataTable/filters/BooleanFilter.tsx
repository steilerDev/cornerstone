import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Filter.module.css';

export interface BooleanFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 3-button segmented control for boolean filtering
 * Values: '' (all), 'true' (yes), 'false' (no)
 */
export function BooleanFilter({ value, onChange }: BooleanFilterProps) {
  const { t } = useTranslation('common');

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  return (
    <div className={styles.filterContent}>
      <div className={styles.filterSegmentedControl} role="group" aria-label={t('dataTable.filter.booleanAriaLabel')}>
        <button
          type="button"
          className={`${styles.filterSegmentedButton} ${
            value === '' ? styles.filterSegmentedButtonActive : ''
          }`}
          onClick={() => handleSelect('')}
          aria-pressed={value === ''}
        >
          {t('dataTable.filter.all')}
        </button>
        <button
          type="button"
          className={`${styles.filterSegmentedButton} ${
            value === 'true' ? styles.filterSegmentedButtonActive : ''
          }`}
          onClick={() => handleSelect('true')}
          aria-pressed={value === 'true'}
        >
          {t('dataTable.filter.yes')}
        </button>
        <button
          type="button"
          className={`${styles.filterSegmentedButton} ${
            value === 'false' ? styles.filterSegmentedButtonActive : ''
          }`}
          onClick={() => handleSelect('false')}
          aria-pressed={value === 'false'}
        >
          {t('dataTable.filter.no')}
        </button>
      </div>
    </div>
  );
}

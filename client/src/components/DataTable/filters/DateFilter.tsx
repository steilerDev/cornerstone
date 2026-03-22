import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DateRangePicker } from '../../DateRangePicker/index.js';
import styles from './Filter.module.css';

export interface DateFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * From/to date range filter for DataTable
 * Stores as "from:YYYY-MM-DD,to:YYYY-MM-DD" format
 * Auto-applies on date selection change
 */
export function DateFilter({ value, onChange }: DateFilterProps) {
  const { t } = useTranslation('common');

  const from = value.match(/from:(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  const to = value.match(/to:(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';

  const handleChange = useCallback(
    (newFrom: string, newTo: string) => {
      const parts: string[] = [];
      if (newFrom) parts.push(`from:${newFrom}`);
      if (newTo) parts.push(`to:${newTo}`);
      onChange(parts.join(','));
    },
    [onChange],
  );

  return (
    <div className={styles.filterContent}>
      <DateRangePicker
        startDate={from}
        endDate={to}
        onChange={handleChange}
        ariaLabel={t('dataTable.filter.dateRangeAriaLabel')}
      />
    </div>
  );
}

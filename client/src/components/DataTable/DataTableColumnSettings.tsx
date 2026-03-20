import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

interface DataTableColumnSettingsProps<T> {
  columns: ColumnDef<T>[];
  visibleColumns: string[];
  onToggleColumn: (key: string) => void;
}

export function DataTableColumnSettings<T>({
  columns,
  visibleColumns,
  onToggleColumn,
}: DataTableColumnSettingsProps<T>) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={styles.columnSettings} ref={containerRef}>
      <button
        type="button"
        className={styles.columnSettingsButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label={t('dataTable.columns.toggleAriaLabel')}
        data-testid="column-settings-button"
      >
        {t('dataTable.columns.button')}
      </button>
      {isOpen && (
        <div className={styles.columnSettingsDropdown} role="menu" data-testid="column-settings-dropdown">
          {columns.map((column) => (
            <label key={column.key} className={styles.columnSettingsItem} role="menuitemcheckbox">
              <input
                type="checkbox"
                checked={visibleColumns.includes(column.key)}
                onChange={() => onToggleColumn(column.key)}
                className={styles.columnSettingsCheckbox}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default DataTableColumnSettings;

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

export interface DataTableColumnSettingsProps<T> {
  columns: ColumnDef<T>[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  onResetToDefaults: () => void;
}

/**
 * Column visibility settings popover
 * Gear icon + checkbox list, desktop-only (hidden on mobile)
 * Uses position:fixed with getBoundingClientRect
 */
export function DataTableColumnSettings<T>({
  columns,
  visibleColumns,
  onToggleColumn,
  onResetToDefaults,
}: DataTableColumnSettingsProps<T>) {
  const { t } = useTranslation('common');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // Position popover when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        right: `${window.innerWidth - rect.right}px`,
        maxWidth: '250px',
        zIndex: 1000,
      });
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.columnSettingsButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('dataTable.columnSettings.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        ⚙️
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={styles.columnSettingsPopover}
          style={popoverStyle}
          role="dialog"
          aria-label={t('dataTable.columnSettings.title')}
        >
          <div className={styles.columnSettingsContent}>
            <h3 className={styles.columnSettingsTitle}>{t('dataTable.columnSettings.title')}</h3>
            <div className={styles.columnCheckboxGroup}>
              {columns.map((col) => (
                <div key={col.key} className={styles.columnCheckboxItem}>
                  <input
                    type="checkbox"
                    id={`col-${col.key}`}
                    checked={visibleColumns.has(col.key)}
                    onChange={() => onToggleColumn(col.key)}
                    className={styles.columnCheckbox}
                  />
                  <label htmlFor={`col-${col.key}`} className={styles.columnCheckboxLabel}>
                    {col.label}
                  </label>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={styles.columnSettingsResetButton}
              onClick={onResetToDefaults}
            >
              {t('dataTable.columnSettings.resetToDefaults')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

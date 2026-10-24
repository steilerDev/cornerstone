import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '../../hooks/useClickOutside.js';
import type { ColumnDef } from './DataTable.js';
import { ColumnSettingsList } from './ColumnSettingsList.js';
import styles from './DataTable.module.css';

export interface DataTableColumnSettingsProps<T> {
  columns: ColumnDef<T>[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  onMoveColumn: (from: number, to: number) => void;
  onResetToDefaults: () => void;
}

/**
 * Column visibility and ordering settings popover
 * Gear icon + checkbox list with drag-and-drop reordering, desktop-only (hidden on mobile)
 * Uses position:fixed with getBoundingClientRect
 */
export function DataTableColumnSettings<T>({
  columns,
  visibleColumns,
  onToggleColumn,
  onMoveColumn,
  onResetToDefaults,
}: DataTableColumnSettingsProps<T>) {
  const { t } = useTranslation('common');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // Close on outside click
  useClickOutside([popoverRef, triggerRef], () => setIsOpen(false), isOpen);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.columnSettingsButton}
        onClick={() => {
          if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPopoverStyle({
              position: 'fixed',
              top: `${rect.bottom + 4}px`,
              right: `${window.innerWidth - rect.right}px`,
              maxWidth: '250px',
              zIndex: 1000,
            });
          }
          setIsOpen(!isOpen);
        }}
        aria-label={t('dataTable.columnSettings.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="1" y="2" width="12" height="2" rx="1" />
          <rect x="1" y="6" width="12" height="2" rx="1" />
          <rect x="1" y="10" width="12" height="2" rx="1" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={styles.columnSettingsPopover}
          style={popoverStyle}
          role="dialog"
          aria-label={t('dataTable.columnSettings.title')}
        >
          <ColumnSettingsList
            title={t('dataTable.columnSettings.title')}
            columns={columns}
            visibleColumns={visibleColumns}
            onToggleColumn={onToggleColumn}
            onMoveColumn={onMoveColumn}
            onResetToDefaults={onResetToDefaults}
          />
        </div>
      )}
    </>
  );
}

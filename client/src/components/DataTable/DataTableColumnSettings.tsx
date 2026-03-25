import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from './DataTable.js';
import styles from './DataTable.module.css';

interface DragOverState {
  index: number;
  position: 'above' | 'below';
}

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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverState, setDragOverState] = useState<DragOverState | null>(null);

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
          <div className={styles.columnSettingsContent}>
            <h3 className={styles.columnSettingsTitle}>{t('dataTable.columnSettings.title')}</h3>
            <div className={styles.columnCheckboxGroup}>
              {columns.map((col, index) => (
                <div
                  key={col.key}
                  className={`${styles.columnCheckboxItem} ${draggedIndex === index ? styles.columnCheckboxItemDragging : ''} ${dragOverState?.index === index && dragOverState.position === 'above' ? styles.columnCheckboxItemDropAbove : ''} ${dragOverState?.index === index && dragOverState.position === 'below' ? styles.columnCheckboxItemDropBelow : ''}`}
                  draggable={index > 0}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggedIndex(index);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (index > 0) {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const position = e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
                      setDragOverState({ index, position });
                    }
                  }}
                  onDragLeave={() => setDragOverState(null)}
                  onDrop={() => {
                    if (
                      draggedIndex !== null &&
                      dragOverState !== null &&
                      dragOverState.index !== draggedIndex &&
                      dragOverState.index > 0
                    ) {
                      onMoveColumn(draggedIndex, dragOverState.index);
                    }
                    setDraggedIndex(null);
                    setDragOverState(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverState(null);
                  }}
                >
                  {index > 0 && (
                    <button
                      type="button"
                      className={styles.columnDragHandle}
                      aria-label={t('dataTable.columnSettings.dragHandleAriaLabel', {
                        column: col.label,
                      })}
                      tabIndex={-1}
                    >
                      ⠿
                    </button>
                  )}
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

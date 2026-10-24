import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './DataTable.module.css';

interface DragOverState {
  index: number;
  position: 'above' | 'below';
}

export interface ColumnSettingsListProps {
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  readonly visibleColumns: ReadonlySet<string>;
  readonly onToggleColumn: (key: string) => void;
  readonly onMoveColumn: (from: number, to: number) => void;
  readonly onResetToDefaults: () => void;
  /** Rendered as the h3 above the list; omit inside a dialog that has its own title. */
  readonly title?: string;
  /** Prefix for checkbox ids (default 'col'); ObjectList passes its listKey. */
  readonly idPrefix?: string;
}

/**
 * The body of the column settings: a checkbox list with drag reordering (the first column is
 * fixed) and a reset button. Used by the DataTable popover and the ObjectList Columns dialog.
 * Imports nothing from DataTable.tsx.
 */
export function ColumnSettingsList({
  columns,
  visibleColumns,
  onToggleColumn,
  onMoveColumn,
  onResetToDefaults,
  title,
  idPrefix = 'col',
}: ColumnSettingsListProps) {
  const { t } = useTranslation('common');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverState, setDragOverState] = useState<DragOverState | null>(null);

  return (
    <div className={styles.columnSettingsContent}>
      {title ? <h3 className={styles.columnSettingsTitle}>{title}</h3> : null}
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
              id={`${idPrefix}-${col.key}`}
              checked={visibleColumns.has(col.key)}
              onChange={() => onToggleColumn(col.key)}
              className={styles.columnCheckbox}
            />
            <label htmlFor={`${idPrefix}-${col.key}`} className={styles.columnCheckboxLabel}>
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
  );
}

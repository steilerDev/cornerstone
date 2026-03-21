import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef, FilterType } from './DataTable.js';
import { StringFilter } from './filters/StringFilter.js';
import { NumberFilter } from './filters/NumberFilter.js';
import { DateFilter } from './filters/DateFilter.js';
import { EnumFilter } from './filters/EnumFilter.js';
import { BooleanFilter } from './filters/BooleanFilter.js';
import { EntityFilter } from './filters/EntityFilter.js';
import styles from './DataTable.module.css';

export interface DataTableFilterPopoverProps<T> {
  column: ColumnDef<T>;
  value: string;
  onApply: (value: string) => void;
  triggerRect: DOMRect;
}

/**
 * Filter popover for a single column
 * Uses position:fixed to avoid clipping inside table container
 */
export function DataTableFilterPopover<T>({
  column,
  value,
  onApply,
  triggerRect,
}: DataTableFilterPopoverProps<T>) {
  const { t } = useTranslation('common');
  const popoverRef = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(value);

  // Position the popover using getBoundingClientRect
  const popoverStyle = {
    position: 'fixed' as const,
    top: `${triggerRect.bottom + 4}px`,
    left: `${Math.max(16, triggerRect.left)}px`,
    maxWidth: '300px',
    zIndex: 1000,
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onApply(localValue);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onApply(localValue);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [localValue, onApply]);

  const renderFilterComponent = () => {
    const filterType = column.filterType as FilterType;

    switch (filterType) {
      case 'string':
        return (
          <StringFilter
            value={localValue}
            onChange={setLocalValue}
            placeholder={t('dataTable.filter.textPlaceholder')}
          />
        );
      case 'number':
        return <NumberFilter value={localValue} onChange={setLocalValue} />;
      case 'date':
        return <DateFilter value={localValue} onChange={setLocalValue} />;
      case 'enum':
        return (
          column.enumOptions && (
            <EnumFilter value={localValue} onChange={setLocalValue} options={column.enumOptions} />
          )
        );
      case 'boolean':
        return <BooleanFilter value={localValue} onChange={setLocalValue} />;
      case 'entity':
        return (
          column.entitySearchFn &&
          column.entityRenderItem && (
            <EntityFilter
              value={localValue}
              onChange={setLocalValue}
              searchFn={column.entitySearchFn}
              renderItem={column.entityRenderItem}
              placeholder={column.entityPlaceholder}
            />
          )
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={popoverRef}
      className={styles.filterPopover}
      style={popoverStyle}
      role="dialog"
      aria-label={t('dataTable.filter.filterByColumn', { column: column.label })}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {renderFilterComponent()}
    </div>
  );
}

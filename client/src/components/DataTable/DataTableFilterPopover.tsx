import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterMeta } from '@cornerstone/shared';
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
  filterMeta?: FilterMeta;
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
  filterMeta,
}: DataTableFilterPopoverProps<T>) {
  const { t } = useTranslation('common');
  const popoverRef = useRef<HTMLDivElement>(null);

  // Auto-apply: pass onApply directly to filter components as onChange
  // No local state needed — filters propagate immediately
  const handleChange = onApply;

  // Position the popover using getBoundingClientRect
  const popoverStyle = {
    position: 'fixed' as const,
    top: `${triggerRect.bottom + 4}px`,
    left: `${Math.max(16, triggerRect.left)}px`,
    maxWidth: '300px',
    zIndex: 1000,
  };

  const renderFilterComponent = () => {
    const filterType = column.filterType as FilterType;

    switch (filterType) {
      case 'string':
        return (
          <StringFilter
            value={value}
            onChange={handleChange}
            placeholder={t('dataTable.filter.textPlaceholder')}
          />
        );
      case 'number': {
        const apiMeta = filterMeta?.[column.key];
        const effectiveMin = apiMeta?.min ?? column.numberMin;
        const effectiveMax = apiMeta?.max ?? column.numberMax;
        return (
          <NumberFilter
            value={value}
            onChange={handleChange}
            min={effectiveMin}
            max={effectiveMax}
            step={column.numberStep}
          />
        );
      }
      case 'date':
        return <DateFilter value={value} onChange={handleChange} />;
      case 'enum':
        return (
          column.enumOptions && (
            <EnumFilter
              value={value}
              onChange={handleChange}
              options={column.enumOptions}
              hierarchy={column.enumHierarchy}
            />
          )
        );
      case 'boolean':
        return <BooleanFilter value={value} onChange={handleChange} />;
      case 'entity':
        return (
          column.entitySearchFn &&
          column.entityRenderItem && (
            <EntityFilter
              value={value}
              onChange={handleChange}
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

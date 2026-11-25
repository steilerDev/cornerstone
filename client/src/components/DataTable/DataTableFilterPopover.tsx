import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterMeta } from '@cornerstone/shared';
import type { ColumnDef, FilterType } from './DataTable.js';
import { StringFilter } from './filters/StringFilter.js';
import { NumberFilter } from './filters/NumberFilter.js';
import { DateFilter } from './filters/DateFilter.js';
import { EnumFilter } from './filters/EnumFilter.js';
import { BooleanFilter } from './filters/BooleanFilter.js';
import { EntityFilter } from './filters/EntityFilter.js';
import { AnchoredPanel } from '../Modal/AnchoredPanel.js';
import type { AnchoredPanelDismissReason } from '../Modal/AnchoredPanel.js';
import styles from './DataTable.module.css';

export interface DataTableFilterPopoverProps<T> {
  column: ColumnDef<T>;
  value: string;
  onApply: (value: string) => void;
  filterMeta?: FilterMeta;
  anchorRef: RefObject<HTMLElement | null>;
  id: string;
  onDismiss: (reason: AnchoredPanelDismissReason) => void;
}

/**
 * Filter popover for a single column
 * An `AnchoredPanel` (portaled, so the table container never clips it)
 */
export function DataTableFilterPopover<T>({
  column,
  value,
  onApply,
  filterMeta,
  anchorRef,
  id,
  onDismiss,
}: DataTableFilterPopoverProps<T>) {
  const { t } = useTranslation('common');

  // Auto-apply: pass onApply directly to filter components as onChange
  // No local state needed — filters propagate immediately
  const handleChange = onApply;

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
              enumIncludeNone={column.enumIncludeNone}
              enumNoneLabel={column.enumNoneLabel}
              enumNoneDescription={column.enumNoneDescription}
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
              selectedLabel={column.entitySelectedLabel}
            />
          )
        );
      default:
        return null;
    }
  };

  return (
    <AnchoredPanel
      open
      anchorRef={anchorRef}
      role="dialog"
      id={id}
      ariaLabel={t('dataTable.filter.filterByColumn', { column: column.label })}
      trapFocus
      onDismiss={onDismiss}
      testId={`data-table-filter-panel-${column.key}`}
    >
      {/* Portals bubble synthetic events through the React tree: keep a click from sorting the column. */}
      <div
        className={styles.filterPopover}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {renderFilterComponent()}
      </div>
    </AnchoredPanel>
  );
}

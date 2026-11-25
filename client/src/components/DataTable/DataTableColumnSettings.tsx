import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnchoredPanel } from '../Modal/AnchoredPanel.js';
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
 * The popover is an `AnchoredPanel` (non-modal dialog) anchored to the gear button
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
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.columnSettingsButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t('dataTable.columnSettings.ariaLabel')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={panelId}
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

      <AnchoredPanel
        open={isOpen}
        anchorRef={triggerRef}
        role="dialog"
        id={panelId}
        ariaLabel={t('dataTable.columnSettings.title')}
        trapFocus
        focusFirstOnOpen
        placement="bottom-end"
        onDismiss={(reason) => {
          setIsOpen(false);
          if (reason === 'escape') triggerRef.current?.focus();
        }}
        testId="data-table-column-settings-panel"
      >
        <div className={styles.columnSettingsPopover}>
          <ColumnSettingsList
            title={t('dataTable.columnSettings.title')}
            columns={columns}
            visibleColumns={visibleColumns}
            onToggleColumn={onToggleColumn}
            onMoveColumn={onMoveColumn}
            onResetToDefaults={onResetToDefaults}
          />
        </div>
      </AnchoredPanel>
    </>
  );
}

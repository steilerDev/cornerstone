import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ColumnSettingsList } from '../DataTable/ColumnSettingsList.js';
import { Modal } from '../Modal/Modal.js';
import shared from '../../styles/shared.module.css';

export interface ObjectListColumnsDialogProps {
  readonly listKey: string;
  /** Columns in the stored order. */
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  readonly visibleColumns: ReadonlySet<string>;
  readonly onToggleColumn: (key: string) => void;
  readonly onMoveColumn: (from: number, to: number) => void;
  readonly onResetToDefaults: () => void;
  readonly onClose: () => void;
  /** The page ⋯ trigger: focus returns there. */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

/** ⋯ › Columns…: the column checkboxes and order of the table surface. */
export function ObjectListColumnsDialog({
  listKey,
  columns,
  visibleColumns,
  onToggleColumn,
  onMoveColumn,
  onResetToDefaults,
  onClose,
  returnFocusRef,
}: ObjectListColumnsDialogProps) {
  const { t } = useTranslation('common');
  return (
    <Modal
      title={t('objectList.columns.title')}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      footer={
        <button type="button" className={shared.btnSecondary} onClick={onClose}>
          {t('objectList.filters.done')}
        </button>
      }
    >
      <ColumnSettingsList
        columns={columns}
        visibleColumns={visibleColumns}
        onToggleColumn={onToggleColumn}
        onMoveColumn={onMoveColumn}
        onResetToDefaults={onResetToDefaults}
        idPrefix={listKey}
      />
    </Modal>
  );
}

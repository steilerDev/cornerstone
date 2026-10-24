import { useId, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import sharedStyles from '../../styles/shared.module.css';
import { Modal } from '../Modal/Modal.js';
import { Sheet } from '../Modal/Sheet.js';
import { OBJECT_FORM_MEDIA_QUERY } from '../ObjectForm/ObjectForm.js';
import { applyMapping } from './pasteRows.js';
import type { MappedPasteRow, NumberLocale, PasteColumn } from './pasteRows.js';
import styles from './CostLineGrid.module.css';

/** Rows shown in the preview table. */
const PREVIEW_ROWS = 5;

const COLUMN_CHOICES: readonly PasteColumn[] = [
  'description',
  'quantity',
  'unit',
  'unitPrice',
  'ignore',
];

export interface PastePreviewDialogProps {
  readonly table: readonly (readonly string[])[];
  readonly columnCount: number;
  readonly mapping: readonly PasteColumn[];
  readonly locale: NumberLocale;
  readonly onInsert: (rows: readonly MappedPasteRow[]) => void;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * "Check pasted rows": shown only when a paste needs a decision (the column count is not 2 or 4, or
 * a number cell is unclear). A select above each column maps it to Description, Quantity, Unit,
 * Unit price or Ignore; Insert adds the rows to the grid.
 */
export function PastePreviewDialog({
  table,
  columnCount,
  mapping: initialMapping,
  locale,
  onInsert,
  onClose,
  returnFocusRef,
}: PastePreviewDialogProps) {
  const { t } = useTranslation('costLines');
  const { t: tc } = useTranslation('common');
  const wide = useMediaQuery(OBJECT_FORM_MEDIA_QUERY);
  const sheetId = useId();
  const [mapping, setMapping] = useState<readonly PasteColumn[]>(initialMapping);
  const { rows, problems } = applyMapping(table, mapping, locale);

  const previewRows = table
    .slice(0, PREVIEW_ROWS)
    .map((cells, position) => ({ id: `preview-row-${position + 1}`, cells }));

  const label = (column: PasteColumn) =>
    ({
      description: t('paste.mapDescription'),
      quantity: t('paste.mapQuantity'),
      unit: t('paste.mapUnit'),
      unitPrice: t('paste.mapUnitPrice'),
      ignore: t('paste.mapIgnore'),
    })[column];

  const body = (
    <div className={styles.previewBody}>
      <p role="status" className={styles.previewStatus} data-testid="paste-preview-status">
        {t('paste.status', {
          count: rows.length,
          problems: t('paste.problems', { count: problems }),
        })}
      </p>
      <div className={styles.previewScroll}>
        <table className={styles.previewTable}>
          <caption className={sharedStyles.srOnly}>{t('paste.previewCaption')}</caption>
          <thead>
            <tr>
              {Array.from({ length: columnCount }, (_unused, column) => (
                <th key={column} scope="col">
                  <select
                    className={styles.select}
                    value={mapping[column] ?? 'ignore'}
                    aria-label={t('paste.columnLabel', { column: column + 1 })}
                    onChange={(event) =>
                      setMapping((previous) =>
                        previous.map((choice, at) =>
                          at === column ? (event.target.value as PasteColumn) : choice,
                        ),
                      )
                    }
                    data-testid={`paste-preview-column-${column}`}
                  >
                    {COLUMN_CHOICES.map((choice) => (
                      <option key={choice} value={choice}>
                        {label(choice)}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map(({ id, cells }) => (
              <tr key={id}>
                {Array.from({ length: columnCount }, (_unused, column) => (
                  <td key={column}>{cells[column] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const footer = (
    <>
      <button type="button" className={sharedStyles.btnSecondary} onClick={onClose}>
        {tc('button.cancel')}
      </button>
      <button
        type="button"
        className={sharedStyles.btnPrimary}
        onClick={() => onInsert(rows)}
        data-testid="paste-preview-insert"
      >
        {t('paste.insert', { count: rows.length })}
      </button>
    </>
  );

  if (wide) {
    return (
      <Modal
        title={t('paste.title')}
        onClose={onClose}
        footer={footer}
        className={styles.previewDialog}
        returnFocusRef={returnFocusRef}
      >
        {body}
      </Modal>
    );
  }
  return (
    <Sheet
      id={sheetId}
      open
      variant="fullScreen"
      title={t('paste.title')}
      onClose={onClose}
      footer={footer}
      returnFocusRef={returnFocusRef}
      restoreFocusOnUnmount
    >
      {body}
    </Sheet>
  );
}

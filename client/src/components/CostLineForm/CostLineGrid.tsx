import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useFormatters } from '../../lib/formatters.js';
import { roundMoney } from '../../lib/money.js';
import sharedStyles from '../../styles/shared.module.css';
import { FilterChipGroup } from '../FilterChipGroup/FilterChipGroup.js';
import { FormError } from '../FormError/FormError.js';
import { isEscapeHandled } from '../Modal/useFocusTrap.js';
import { useToast } from '../Toast/ToastContext.js';
import { remainingState } from '../CostLineTable/costLineRows.js';
import { CostLineEstimatePicker } from './CostLineEstimatePicker.js';
import { CostLineGridRowView } from './CostLineGridRow.js';
import type { GridColumn } from './CostLineGridRow.js';
import { CostLineTargetPicker } from './CostLineTargetPicker.js';
import { PastePreviewDialog } from './PastePreviewDialog.js';
import {
  blankGridRow,
  duplicateRow,
  gridRowGross,
  isBlankRow,
  nextRowId,
  rowsToSave,
  validateGridRows,
  withTrailingBlank,
} from './costLineGridModel.js';
import { gridKeyIntent } from './gridKeyboard.js';
import type { GridCellKind } from './gridKeyboard.js';
import { isTabular, numberToText, parseClipboard } from './pasteRows.js';
import type { ClipboardResult, MappedPasteRow, NumberLocale } from './pasteRows.js';
import type {
  CostLineExistingRef,
  CostLineGridField,
  CostLineGridProps,
  CostLineGridRow,
  CostLineGridRowErrors,
} from './types.js';
import styles from './CostLineGrid.module.css';

const NO_OPTIONS: readonly never[] = [];
const FOCUSABLE = 'input:not([type="checkbox"]), select, button';

type PendingFocus = { readonly rowId: string; readonly col: GridColumn; readonly select?: boolean };

interface PastePreview {
  readonly rowId: string;
  readonly result: Extract<ClipboardResult, { kind: 'rows' }>;
}

/**
 * The editable cost line grid: a native table of text inputs (not `role="grid"`: every cell is an
 * ordinary control, so Tab and typing keep working), keyboard rows, Ctrl/⌘+D duplicate and
 * spreadsheet paste. Rows are controlled by the host; one blank row is always kept at the end.
 * On phones each row is a stacked card with the same inputs in the same order (CSS only).
 */
export function CostLineGrid({
  rows,
  onRowsChange,
  options,
  assignAll,
  onAssignAllChange,
  remainingAmount,
  categoryOptions = NO_OPTIONS,
  sourceOptions = NO_OPTIONS,
  showAllErrors,
  serverErrors,
  onSaveShortcut,
  onEscape,
  onAnnounce,
  selectedRowIds,
  onToggleSelect,
  selectLinkedReason,
  onNoticeAction,
  renderRowExtra,
  testIdPrefix = 'cost-line-grid',
  autoFocus = false,
  firstDescriptionRef,
}: CostLineGridProps) {
  const { t } = useTranslation('costLines');
  const { resolvedLocale, vatRate } = useLocale();
  const { formatCurrency } = useFormatters();
  const { showUndoToast } = useToast();
  const gridId = useId();
  const locale: NumberLocale = resolvedLocale === 'de' ? 'de' : 'en';

  const tableRef = useRef<HTMLTableElement>(null);
  const innerFirstRef = useRef<HTMLInputElement>(null);
  const firstRef = firstDescriptionRef ?? innerFirstRef;
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const pickerReturnRef = useRef<HTMLElement | null>(null);
  // What a row held before it was linked to an existing line, so unlinking brings it back.
  const preLinkRef = useRef(
    new Map<string, Pick<CostLineGridRow, 'quantity' | 'unit' | 'unitPrice'>>(),
  );

  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [ambiguous, setAmbiguous] = useState<ReadonlySet<string>>(() => new Set());
  const [defaultIncludesVat, setDefaultIncludesVat] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PastePreview | null>(null);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);

  const blankDefaults = { includesVat: defaultIncludesVat };

  const commit = (next: readonly CostLineGridRow[]) => {
    onRowsChange(withTrailingBlank(next, nextRowId, blankDefaults));
  };

  // One blank row is always kept at the end.
  const lastRow = rows[rows.length - 1];
  const needsBlank = lastRow === undefined || !isBlankRow(lastRow);
  useEffect(() => {
    if (needsBlank) onRowsChange(withTrailingBlank(rowsRef.current, nextRowId, blankDefaults));
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- appends once per missing blank row
  }, [needsBlank]);

  useEffect(() => {
    if (autoFocus) firstRef.current?.focus();
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- mount only
  }, []);

  const focusCell = (target: PendingFocus) => {
    const rowEl = Array.from(tableRef.current!.querySelectorAll<HTMLElement>('tr[data-row]')).find(
      (el) => el.dataset.row === target.rowId,
    );
    const cell = rowEl?.querySelector<HTMLElement>(`[data-col="${target.col}"]`);
    const control =
      cell?.querySelector<HTMLElement>(FOCUSABLE) ?? rowEl?.querySelector<HTMLElement>(FOCUSABLE);
    if (!control) return;
    control.focus();
    if (target.select && control instanceof HTMLInputElement) control.select();
  };

  // Focus requested by a handler, once the commit that shows the row has landed.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    focusCell(target);
  });

  const messages = {
    description: t('form.errorDescription'),
    quantity: t('form.errorQuantity'),
    unitPrice: t('form.errorUnitPrice'),
    number: t('grid.errorNumber'),
    amountPositive: t('form.errorAmountPositive'),
    belongsTo: t('form.errorBelongsTo'),
  };
  const validation = useMemo(
    () => validateGridRows(rows, options, assignAll, { locale, vatRate }, messages),
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- messages change only with the language
    [rows, options, assignAll, locale, vatRate, t],
  );

  const errorsFor = (rowId: string): CostLineGridRowErrors => {
    const found: Partial<Record<CostLineGridField, string>> = {};
    for (const [field, text] of Object.entries(validation.get(rowId) ?? {})) {
      if (showAllErrors || touched.has(`${rowId}:${field}`)) {
        found[field as CostLineGridField] = text;
      }
    }
    return { ...found, ...serverErrors?.get(rowId) };
  };

  const updateRow = (rowId: string, patch: Partial<CostLineGridRow>) => {
    commit(rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
    if ('quantity' in patch || 'unitPrice' in patch) {
      setAmbiguous((previous) => {
        const next = new Set(previous);
        next.delete(`${rowId}:quantity`);
        next.delete(`${rowId}:unitPrice`);
        return next;
      });
    }
  };

  const blurField = (rowId: string, field: CostLineGridField) => {
    setTouched((previous) => new Set(previous).add(`${rowId}:${field}`));
  };

  const duplicate = (rowId: string) => {
    const index = rows.findIndex((row) => row.rowId === rowId);
    const copy = duplicateRow(rows[index]!, nextRowId());
    commit([...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)]);
    pendingFocusRef.current = { rowId: copy.rowId, col: 'description', select: true };
  };

  const remove = (rowId: string) => {
    const index = rows.findIndex((row) => row.rowId === rowId);
    if (rows.length <= 1) return;
    const removed = rows[index]!;
    const next = withTrailingBlank(
      rows.filter((row) => row.rowId !== rowId),
      nextRowId,
      blankDefaults,
    );
    onRowsChange(next);
    pendingFocusRef.current = {
      rowId: next[Math.min(index, next.length - 1)]!.rowId,
      col: 'description',
    };
    const message = t('grid.rowRemoved', { row: index + 1 });
    onAnnounce(message);
    showUndoToast({
      message,
      dedupeKey: `${testIdPrefix}-removed-${removed.rowId}`,
      onUndo: async () => {
        const current = rowsRef.current;
        const at = Math.min(index, current.length);
        onRowsChange(
          withTrailingBlank(
            [...current.slice(0, at), removed, ...current.slice(at)],
            nextRowId,
            blankDefaults,
          ),
        );
        pendingFocusRef.current = { rowId: removed.rowId, col: 'description' };
      },
    });
  };

  const insertPasted = (startRowId: string, pasted: readonly MappedPasteRow[]) => {
    const index = rows.findIndex((row) => row.rowId === startRowId);
    const replace = isBlankRow(rows[index]!);
    const inserted = pasted.map((cells) => ({
      ...blankGridRow(nextRowId(), blankDefaults),
      description: cells.description,
      quantity: cells.quantity,
      unit: cells.unit,
      unitPrice: cells.unitPrice,
    }));
    const before = rows.slice(0, replace ? index : index + 1);
    const after = rows.slice(index + 1);
    commit([...before, ...inserted, ...after]);
    const flagged = new Set(ambiguous);
    pasted.forEach((cells, at) => {
      for (const field of cells.ambiguous) flagged.add(`${inserted[at]!.rowId}:${field}`);
    });
    setAmbiguous(flagged);
    pendingFocusRef.current = { rowId: inserted[inserted.length - 1]!.rowId, col: 'description' };
    const attention = pasted.filter((cells) => cells.problem).length;
    onAnnounce(
      t('grid.pasted', {
        count: pasted.length,
        attention:
          attention === 0
            ? t('grid.noneNeedAttention')
            : t('grid.needAttention', { count: attention }),
      }),
    );
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>, rowId: string) => {
    const text = event.clipboardData.getData('text/plain');
    if (!isTabular(text)) return;
    event.preventDefault();
    setPasteError(null);
    const result = parseClipboard(text, locale);
    if (result.kind === 'tooMany') {
      setPasteError(t('grid.pasteTooMany'));
      return;
    }
    if (result.rows.length === 0) return;
    if (result.needsMapping) setPreview({ rowId, result });
    else insertPasted(rowId, result.rows);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    // Events of a portaled picker list bubble through React; only the table's own cells count.
    if (!tableRef.current!.contains(target)) return;
    // Buttons of a notice row sit in a cell without a column.
    const cell = target.closest<HTMLElement>('[data-col]');
    const rowEl = target.closest<HTMLElement>('tr[data-row]');
    if (!cell || !rowEl) return;
    const rowId = rowEl.dataset.row as string;
    const col = cell.dataset.col as GridColumn;
    const index = rows.findIndex((row) => row.rowId === rowId);
    const row = rows[index]!;

    // Tab from the last control of the last row adds a row and enters it.
    if (event.key === 'Tab' && !event.shiftKey && index === rows.length - 1) {
      const controls = Array.from(rowEl.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (controls[controls.length - 1] === target) {
        event.preventDefault();
        const added = blankGridRow(nextRowId(), blankDefaults);
        onRowsChange([...rows, added]);
        pendingFocusRef.current = { rowId: added.rowId, col: 'description' };
        return;
      }
    }

    if (event.defaultPrevented || isEscapeHandled(event.nativeEvent)) return;
    const kind = cell.dataset.kind as GridCellKind;
    const intent = gridKeyIntent(event, kind, isBlankRow(row));
    if (intent === null) return;

    const moveTo = (offset: number, appendMissing: boolean) => {
      const neighbour = rows[index + offset];
      if (neighbour) {
        focusCell({ rowId: neighbour.rowId, col });
        return;
      }
      if (appendMissing) {
        const added = blankGridRow(nextRowId(), blankDefaults);
        onRowsChange([...rows, added]);
        pendingFocusRef.current = { rowId: added.rowId, col };
      }
    };

    switch (intent) {
      case 'nextRow':
        event.preventDefault();
        moveTo(1, true);
        break;
      case 'prevRow':
        event.preventDefault();
        moveTo(-1, false);
        break;
      case 'down':
        event.preventDefault();
        moveTo(1, false);
        break;
      case 'up':
        event.preventDefault();
        moveTo(-1, false);
        break;
      case 'duplicate':
        event.preventDefault();
        duplicate(rowId);
        break;
      case 'removeRow':
        event.preventDefault();
        remove(rowId);
        break;
      case 'save':
        event.preventDefault();
        onSaveShortcut?.();
        break;
      case 'escape':
        onEscape?.();
        break;
    }
  };

  const enteredModes = new Set(
    rows.filter((row) => row.existingLine === null).map((r) => r.includesVat),
  );
  const enteredAll = enteredModes.size === 1 ? (enteredModes.has(true) ? 'gross' : 'net') : '';
  const setEnteredAll = (value: string) => {
    const includesVat = value === 'gross';
    setDefaultIncludesVat(includesVat);
    commit(rows.map((row) => (row.existingLine === null ? { ...row, includesVat } : row)));
  };

  const columns = options.columns ?? [];
  // Row number, Description, Quantity, Unit, Unit price, Entered as, Gross and the actions.
  const columnCount =
    8 +
    (options.include ? 1 : 0) +
    (options.select ? 1 : 0) +
    (options.targets ? 1 : 0) +
    columns.length;
  const toSave = rowsToSave(rows, options);
  const total = roundMoney(
    toSave.reduce((sum, row) => {
      const gross = gridRowGross(row, vatRate, locale);
      return Number.isFinite(gross) ? sum + gross : sum;
    }, 0),
  );
  const remainder = remainingAmount === undefined ? 0 : roundMoney(remainingAmount - total);
  const remainderState = remainingAmount === undefined ? 'none' : remainingState(remainder);
  const clearExisting = (rowId: string) => {
    const saved = preLinkRef.current.get(rowId);
    preLinkRef.current.delete(rowId);
    updateRow(rowId, {
      existingLine: null,
      quantity: saved?.quantity ?? '',
      unit: saved?.unit ?? '',
      unitPrice: saved?.unitPrice ?? '',
    });
    pendingFocusRef.current = { rowId, col: 'description' };
  };
  const pickExisting = (pickerRowId: string, line: CostLineExistingRef) => {
    const before = rows.find((row) => row.rowId === pickerRowId)!;
    preLinkRef.current.set(pickerRowId, {
      quantity: before.quantity,
      unit: before.unit,
      unitPrice: before.unitPrice,
    });
    updateRow(pickerRowId, {
      existingLine: line,
      quantity: '',
      unit: '',
      unitPrice: numberToText(line.gross, locale),
    });
    pendingFocusRef.current = { rowId: pickerRowId, col: 'unitPrice', select: true };
    setPickerRowId(null);
  };

  const th = (key: string, label: string, hidden = false) => (
    <th role="columnheader" scope="col" key={key} className={styles.th} data-col={key}>
      {hidden ? <span className={sharedStyles.srOnly}>{label}</span> : label}
    </th>
  );

  return (
    <div className={styles.grid} data-testid={testIdPrefix}>
      {options.targets && (
        <div className={styles.bulkRow}>
          <div className={styles.bulkField}>
            <label htmlFor={`${gridId}-assign-all`} className={styles.bulkLabel}>
              {t('grid.assignAll')}
            </label>
            <CostLineTargetPicker
              id={`${gridId}-assign-all`}
              value={assignAll}
              onChange={onAssignAllChange}
              testId={`${testIdPrefix}-assign-all`}
            />
          </div>
          <div className={styles.bulkField}>
            <span id={`${gridId}-entered-all`} className={styles.bulkLabel}>
              {t('grid.enteredAsAll')}
            </span>
            <FilterChipGroup
              labelledBy={`${gridId}-entered-all`}
              layout="wrap"
              value={enteredAll}
              onChange={setEnteredAll}
              testIdPrefix={`${testIdPrefix}-entered-all`}
              options={[
                { value: 'net', label: t('entered.net') },
                { value: 'gross', label: t('entered.gross') },
              ]}
            />
          </div>
        </div>
      )}
      <p className={styles.pasteHint}>{t('grid.pasteHint')}</p>
      <FormError message={pasteError} />
      <table
        ref={tableRef}
        role="table"
        className={styles.table}
        onKeyDown={handleKeyDown}
        data-testid={`${testIdPrefix}-table`}
      >
        <caption className={sharedStyles.srOnly}>{t('grid.caption')}</caption>
        <thead role="rowgroup" className={styles.thead}>
          <tr role="row">
            {th('rowNumber', t('grid.colRow'), true)}
            {options.include && th('include', t('grid.colIncluded'))}
            {options.select && th('select', t('grid.colSelect'), true)}
            {th('description', t('table.colDescription'))}
            {th('quantity', t('form.quantity'))}
            {th('unit', t('form.unit'))}
            {th('unitPrice', t('form.unitPrice'))}
            {th('enteredAs', t('table.colEnteredAs'))}
            {th('gross', t('table.colGross'))}
            {options.targets && th('target', t('table.colBelongsTo'))}
            {columns.includes('category') && th('category', t('form.category'))}
            {columns.includes('fundingSource') && th('source', t('form.fundingSource'))}
            {th('actions', t('table.colActions'), true)}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, index) => (
            <CostLineGridRowView
              key={row.rowId}
              row={row}
              index={index}
              prefix={testIdPrefix}
              options={options}
              categoryOptions={categoryOptions}
              sourceOptions={sourceOptions}
              assignAll={assignAll}
              errors={errorsFor(row.rowId)}
              ambiguous={
                new Set(
                  (['quantity', 'unitPrice'] as const).filter((field) =>
                    ambiguous.has(`${row.rowId}:${field}`),
                  ),
                )
              }
              gross={gridRowGross(row, vatRate, locale)}
              selected={selectedRowIds?.has(row.rowId) ?? false}
              canRemove={rows.length > 1}
              onChange={updateRow}
              onBlurField={blurField}
              onDuplicate={duplicate}
              onRemove={remove}
              onUseExisting={(rowId, trigger) => {
                pickerReturnRef.current = trigger;
                setPickerRowId(rowId);
              }}
              onPaste={handlePaste}
              onToggleSelect={onToggleSelect}
              selectLinkedReason={selectLinkedReason}
              onClearExisting={clearExisting}
              onNoticeAction={onNoticeAction}
              renderRowExtra={renderRowExtra}
              firstDescriptionRef={index === 0 ? firstRef : undefined}
            />
          ))}
        </tbody>
        {remainingAmount !== undefined && (
          <tfoot role="rowgroup" className={styles.tfoot}>
            <tr role="row">
              <td role="cell" colSpan={columnCount} className={styles.footCell}>
                <span>{t('table.total')}</span>{' '}
                <strong data-testid={`${testIdPrefix}-total`}>{formatCurrency(total)}</strong>
              </td>
            </tr>
            {remainderState !== 'none' && (
              <tr role="row">
                <td
                  role="cell"
                  colSpan={columnCount}
                  className={remainderState === 'over' ? styles.footOver : styles.footRest}
                  data-testid={`${testIdPrefix}-remainder`}
                >
                  {remainderState === 'over'
                    ? t('table.over', { amount: formatCurrency(Math.abs(remainder)) })
                    : t('table.notYetSplit', { amount: formatCurrency(remainder) })}
                </td>
              </tr>
            )}
          </tfoot>
        )}
      </table>
      {preview && (
        <PastePreviewDialog
          table={preview.result.table}
          columnCount={preview.result.columnCount}
          mapping={preview.result.mapping}
          locale={locale}
          returnFocusRef={firstRef}
          onClose={() => setPreview(null)}
          onInsert={(pasted) => {
            insertPasted(preview.rowId, pasted);
            setPreview(null);
          }}
        />
      )}
      {pickerRowId !== null && (
        <CostLineEstimatePicker
          target={rows.find((row) => row.rowId === pickerRowId)!.target ?? assignAll}
          takenIds={new Set(rows.flatMap((row) => (row.existingLine ? [row.existingLine.id] : [])))}
          onPick={(line) => pickExisting(pickerRowId, line)}
          onClose={() => setPickerRowId(null)}
          returnFocusRef={pickerReturnRef}
        />
      )}
    </div>
  );
}

export default CostLineGrid;

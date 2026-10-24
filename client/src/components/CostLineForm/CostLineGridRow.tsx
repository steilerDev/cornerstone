import type { ClipboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../lib/formatters.js';
import { useUserText } from '../../hooks/useUserText.js';
import type { CostLineTarget } from '../CostLineTable/types.js';
import { CostLineTargetPicker } from './CostLineTargetPicker.js';
import type {
  CostLineGridField,
  CostLineGridOption,
  CostLineGridOptions,
  CostLineGridRow,
  CostLineGridRowErrors,
} from './types.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './CostLineGrid.module.css';

/** Column keys; `data-col` on each cell carries one, the keyboard map moves along a column. */
export type GridColumn =
  | 'include'
  | 'select'
  | 'description'
  | 'quantity'
  | 'unit'
  | 'unitPrice'
  | 'enteredAs'
  | 'gross'
  | 'target'
  | 'category'
  | 'source'
  | 'actions';

export interface CostLineGridRowViewProps {
  readonly row: CostLineGridRow;
  /** 0-based position among all rows. */
  readonly index: number;
  readonly prefix: string;
  readonly options: CostLineGridOptions;
  readonly categoryOptions: readonly CostLineGridOption[];
  readonly sourceOptions: readonly CostLineGridOption[];
  readonly assignAll: CostLineTarget | null;
  /** Errors to show now (blurred cells, a failed save, the server). */
  readonly errors: CostLineGridRowErrors;
  /** Fields whose pasted number reads two ways. */
  readonly ambiguous: ReadonlySet<string>;
  readonly gross: number;
  readonly selected: boolean;
  readonly canRemove: boolean;
  readonly onChange: (rowId: string, patch: Partial<CostLineGridRow>) => void;
  readonly onBlurField: (rowId: string, field: CostLineGridField) => void;
  readonly onDuplicate: (rowId: string) => void;
  readonly onRemove: (rowId: string) => void;
  readonly onUseExisting: (rowId: string, trigger: HTMLElement) => void;
  readonly onPaste: (event: ClipboardEvent<HTMLInputElement>, rowId: string) => void;
  readonly onToggleSelect?: (rowId: string) => void;
  readonly selectLinkedReason?: string;
  readonly onClearExisting: (rowId: string) => void;
  readonly onNoticeAction?: (rowId: string, actionId: string) => void;
  readonly renderRowExtra?: (row: CostLineGridRow) => ReactNode;
  readonly firstDescriptionRef?: RefObject<HTMLInputElement | null>;
}

function cx(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** One editable row: a table row on wide screens, a stacked card below 768px (CSS only). */
export function CostLineGridRowView({
  row,
  index,
  prefix,
  options,
  categoryOptions,
  sourceOptions,
  assignAll,
  errors,
  ambiguous,
  gross,
  selected,
  canRemove,
  onChange,
  onBlurField,
  onDuplicate,
  onRemove,
  onUseExisting,
  onPaste,
  onToggleSelect,
  selectLinkedReason,
  onClearExisting,
  onNoticeAction,
  renderRowExtra,
  firstDescriptionRef,
}: CostLineGridRowViewProps) {
  const { t } = useTranslation('costLines');
  const { formatCurrency } = useFormatters();
  const userText = useUserText();
  const number = index + 1;
  const rowKey = `${prefix}-${row.rowId}`;
  const columns = options.columns ?? [];
  const label = (column: string) => t('grid.cellLabel', { column, row: number });

  if (row.notice) {
    const { notice } = row;
    return (
      <tr
        role="row"
        className={cx(styles.row, styles.noticeRow)}
        data-testid={`${prefix}-row-${row.rowId}`}
        data-row={row.rowId}
      >
        <td role="cell" className={styles.noticeCell} colSpan={99}>
          <span aria-hidden="true" className={styles.rowNumber}>
            {number}
          </span>{' '}
          <span
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={notice.tone === 'error' ? styles.noticeError : styles.noticeBusy}
          >
            {notice.text}
          </span>
          {notice.actions?.map((action) => (
            <button
              key={action.id}
              type="button"
              className={styles.rowButton}
              onClick={() => onNoticeAction?.(row.rowId, action.id)}
              data-testid={`${prefix}-notice-${action.id}-${row.rowId}`}
            >
              {action.label}
            </button>
          ))}
        </td>
      </tr>
    );
  }

  const fieldError = (field: CostLineGridField): string | undefined =>
    errors[field] ?? (ambiguous.has(field) ? t('grid.errorAmbiguousNumber') : undefined);

  const input = (
    field: 'description' | 'quantity' | 'unit' | 'unitPrice',
    columnLabel: string,
    extra: { numeric?: boolean; maxLength?: number; ref?: RefObject<HTMLInputElement | null> },
  ) => {
    const error = fieldError(field);
    const errorId = error ? `${rowKey}-${field}-error` : undefined;
    return (
      <>
        <input
          ref={extra.ref}
          type="text"
          inputMode={extra.numeric ? 'decimal' : undefined}
          className={cx(styles.input, extra.numeric && styles.numeric, error && styles.inputError)}
          value={row[field]}
          maxLength={extra.maxLength}
          aria-label={label(columnLabel)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          onChange={(event) => onChange(row.rowId, { [field]: event.target.value })}
          onBlur={() => onBlurField(row.rowId, field)}
          onPaste={field === 'description' ? (event) => onPaste(event, row.rowId) : undefined}
          data-testid={`${prefix}-${field}-${row.rowId}`}
        />
        {error && (
          <span id={errorId} className={styles.cellError}>
            {t('grid.errorPrefix', { message: error })}
          </span>
        )}
      </>
    );
  };

  const linked = row.existingLine !== null;
  const colDescription = t('table.colDescription');
  const colPrice = t('form.unitPrice');

  return (
    <tr
      role="row"
      className={cx(styles.row, options.include && !row.included && styles.rowExcluded)}
      data-testid={`${prefix}-row-${row.rowId}`}
      data-row={row.rowId}
    >
      <td role="cell" className={styles.numberCell} data-col="rowNumber">
        <span aria-hidden="true" className={styles.rowNumber}>
          {number}
        </span>
      </td>
      {options.include && (
        <td role="cell" className={styles.checkCell} data-col="include" data-kind="button">
          <input
            type="checkbox"
            className={styles.check}
            checked={row.included}
            aria-label={label(t('grid.colIncluded'))}
            onChange={(event) => onChange(row.rowId, { included: event.target.checked })}
            data-testid={`${prefix}-include-${row.rowId}`}
          />
        </td>
      )}
      {options.select && (
        <td role="cell" className={styles.checkCell} data-col="select" data-kind="button">
          {row.existingLine !== null ? (
            // Linked to an existing cost line: it cannot be merged, so the box says so instead of
            // looking clickable.
            <>
              <input
                type="checkbox"
                className={cx(styles.check, styles.checkDisabled)}
                checked={false}
                readOnly
                aria-disabled="true"
                aria-label={label(t('grid.colSelect'))}
                aria-describedby={selectLinkedReason ? `${rowKey}-select-reason` : undefined}
                onChange={() => undefined}
                onClick={(event) => event.preventDefault()}
                data-testid={`${prefix}-select-${row.rowId}`}
              />
              {selectLinkedReason && (
                <span id={`${rowKey}-select-reason`} className={sharedStyles.srOnly}>
                  {selectLinkedReason}
                </span>
              )}
            </>
          ) : (
            <input
              type="checkbox"
              className={styles.check}
              checked={selected}
              aria-label={label(t('grid.colSelect'))}
              onChange={() => onToggleSelect?.(row.rowId)}
              data-testid={`${prefix}-select-${row.rowId}`}
            />
          )}
        </td>
      )}
      <td
        role="cell"
        className={styles.descriptionCell}
        data-col="description"
        data-kind={linked ? 'button' : 'text'}
        data-label={colDescription}
      >
        {row.existingLine ? (
          <>
            <span className={styles.existingLabel}>
              <span {...userText()}>
                {t('grid.existingLabel', {
                  description: row.existingLine.description ?? t('table.noDescription'),
                })}
              </span>
            </span>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onClearExisting(row.rowId)}
              data-testid={`${prefix}-clear-existing-${row.rowId}`}
            >
              {t('grid.clearExisting')}
            </button>
          </>
        ) : (
          input('description', colDescription, {
            maxLength: 500,
            ref: firstDescriptionRef,
          })
        )}
        {renderRowExtra?.(row)}
      </td>
      {!linked && (
        <>
          <td
            role="cell"
            className={styles.cell}
            data-col="quantity"
            data-kind="text"
            data-label={t('form.quantity')}
          >
            {input('quantity', t('form.quantity'), { numeric: true })}
          </td>
          <td
            role="cell"
            className={styles.cell}
            data-col="unit"
            data-kind="text"
            data-label={t('form.unit')}
          >
            {input('unit', t('form.unit'), { maxLength: 100 })}
          </td>
        </>
      )}
      <td
        role="cell"
        className={styles.cell}
        data-col="unitPrice"
        data-kind="text"
        data-label={colPrice}
        colSpan={linked ? 3 : 1}
      >
        {input('unitPrice', colPrice, { numeric: true })}
      </td>
      <td
        role="cell"
        className={styles.cell}
        data-col="enteredAs"
        data-kind="button"
        data-label={t('table.colEnteredAs')}
      >
        {linked ? null : (
          <button
            type="button"
            className={styles.toggle}
            aria-label={`${label(t('table.colEnteredAs'))}: ${t(row.includesVat ? 'entered.gross' : 'entered.net')}`}
            onClick={() => onChange(row.rowId, { includesVat: !row.includesVat })}
            data-testid={`${prefix}-entered-${row.rowId}`}
          >
            {t(row.includesVat ? 'entered.gross' : 'entered.net')}
          </button>
        )}
      </td>
      <td
        role="cell"
        className={cx(styles.cell, styles.grossCell)}
        data-col="gross"
        data-label={t('table.colGross')}
        data-testid={`${prefix}-gross-${row.rowId}`}
      >
        {Number.isFinite(gross) ? formatCurrency(gross) : '—'}
      </td>
      {options.targets && (
        <td
          role="cell"
          className={styles.cell}
          data-col="target"
          data-kind="native"
          data-label={t('table.colBelongsTo')}
        >
          {linked ? (
            <span {...userText()}>{row.target?.label ?? assignAll?.label}</span>
          ) : (
            <>
              <CostLineTargetPicker
                id={`${rowKey}-target`}
                value={row.target}
                onChange={(target) => onChange(row.rowId, { target })}
                placeholder={assignAll?.label ?? t('form.belongsToPlaceholder')}
                inputAriaProps={{
                  'aria-label': label(t('table.colBelongsTo')),
                  'aria-invalid': errors.target ? true : undefined,
                  'aria-describedby': errors.target ? `${rowKey}-target-error` : undefined,
                }}
              />
              {errors.target && (
                <span id={`${rowKey}-target-error`} className={styles.cellError}>
                  {t('grid.errorPrefix', { message: errors.target })}
                </span>
              )}
            </>
          )}
        </td>
      )}
      {columns.includes('category') && (
        <td
          role="cell"
          className={styles.cell}
          data-col="category"
          data-kind="native"
          data-label={t('form.category')}
        >
          <select
            className={styles.select}
            value={row.budgetCategoryId ?? ''}
            aria-label={label(t('form.category'))}
            onChange={(event) =>
              onChange(row.rowId, { budgetCategoryId: event.target.value || null })
            }
            data-testid={`${prefix}-category-${row.rowId}`}
          >
            <option value="">{t('form.categoryNone')}</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </td>
      )}
      {columns.includes('fundingSource') && (
        <td
          role="cell"
          className={styles.cell}
          data-col="source"
          data-kind="native"
          data-label={t('form.fundingSource')}
        >
          <select
            className={styles.select}
            value={row.budgetSourceId ?? ''}
            aria-label={label(t('form.fundingSource'))}
            onChange={(event) =>
              onChange(row.rowId, { budgetSourceId: event.target.value || null })
            }
            data-testid={`${prefix}-source-${row.rowId}`}
          >
            {row.budgetSourceId === null && <option value="" />}
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </td>
      )}
      <td role="cell" className={styles.actionsCell} data-col="actions" data-kind="button">
        <button
          type="button"
          className={styles.rowButton}
          aria-label={t('grid.duplicateRow', { row: number })}
          onClick={() => onDuplicate(row.rowId)}
          data-testid={`${prefix}-duplicate-${row.rowId}`}
        >
          {t('action.duplicate')}
        </button>
        {options.existingLines && !linked && (
          <button
            type="button"
            className={styles.rowButton}
            aria-label={`${t('action.useExisting')}, ${t('grid.rowLabel', { row: number })}`}
            onClick={(event) => onUseExisting(row.rowId, event.currentTarget)}
            data-testid={`${prefix}-use-existing-${row.rowId}`}
          >
            {t('action.useExisting')}
          </button>
        )}
        <button
          type="button"
          className={styles.rowButton}
          aria-label={t('grid.removeRow', { row: number })}
          aria-disabled={!canRemove || undefined}
          onClick={() => {
            if (canRemove) onRemove(row.rowId);
          }}
          data-testid={`${prefix}-remove-${row.rowId}`}
        >
          {t('confirm.remove')}
        </button>
      </td>
    </tr>
  );
}

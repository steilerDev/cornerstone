import { useId, useImperativeHandle, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { useFormatters } from '../../lib/formatters.js';
import sharedStyles from '../../styles/shared.module.css';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../DataTable/dataTableTestId.js';
import { FormError } from '../FormError/FormError.js';
import { invoiceLineKey } from './costLineRows.js';
import {
  DescriptionCell,
  EnteredAsCell,
  QuantityPriceCell,
  TargetLabel,
} from './CostLineRowParts.js';
import type { CostLineGroup, CostLineGroupHeading, CostLineRow, CostLineTarget } from './types.js';
import styles from './ConvertLinesTable.module.css';

/** Visible strings of the table; the host owns the namespace. */
export interface ConvertLinesLabels {
  readonly caption: string;
  readonly line: string;
  readonly offered: string;
  readonly proposed: string;
  readonly keep: string;
  /** The visible Keep label of the card surface. */
  readonly keepVisible: string;
  readonly keepAria: (name: string) => string;
  readonly proposedAria: (name: string) => string;
  readonly lineInvalid: string;
  readonly total: string;
  readonly noDescription: string;
}

/** What the table needs to know of one line, keyed by `invoiceLineKey(row)`. */
export interface ConvertLineView {
  readonly offered: number;
  readonly proposed: string;
  readonly keep: boolean;
}

export interface ConvertLinesTableHandle {
  /** Focuses the first visible input with an error; false when there is none. */
  focusFirstInvalid: () => boolean;
  /** Focuses the first visible input that can be edited; false when there is none. */
  focusFirstEditable: () => boolean;
}

export interface ConvertLinesTableProps {
  readonly groups: readonly CostLineGroup[];
  readonly lines: ReadonlyMap<string, ConvertLineView>;
  readonly invalidKeys: ReadonlySet<string>;
  readonly groupProposedTotals: ReadonlyMap<string, number>;
  readonly offeredTotal: number;
  readonly proposedTotal: number;
  /** Footer text under the totals (what is not yet split), formatted by the host. */
  readonly remainder: ReactNode;
  readonly onChangeProposed: (key: string, value: string) => void;
  readonly onToggleKeep: (key: string, keep: boolean) => void;
  readonly disabled?: boolean;
  readonly labels: ConvertLinesLabels;
  readonly testIdPrefix?: string;
  readonly ref?: Ref<ConvertLinesTableHandle>;
}

/** Document-mode groups are always headed by their task or purchase (null = not assigned). */
function groupTarget(group: CostLineGroup): CostLineTarget | null {
  return (group.heading as Extract<CostLineGroupHeading, { kind: 'target' }>).target;
}

/**
 * The editable counterpart of `CostLineTable` for converting an offer: per line the offered
 * amount, a proposed amount to type and a Keep checkbox, grouped by task or purchase, with
 * totals. Both surfaces (table, cards) are mounted and switched by the list's own width.
 */
export function ConvertLinesTable({
  groups,
  lines,
  invalidKeys,
  groupProposedTotals,
  offeredTotal,
  proposedTotal,
  remainder,
  onChangeProposed,
  onToggleKeep,
  disabled = false,
  labels,
  testIdPrefix = 'convert-lines',
  ref,
}: ConvertLinesTableProps) {
  const { formatCurrency } = useFormatters();
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // Both surfaces hold every input, so focus goes to the one that is rendered (has layout boxes).
  const focusFirst = (selector: string): boolean => {
    const inputs = rootRef.current!.querySelectorAll<HTMLInputElement>(selector);
    const shown = [...inputs].find((input) => input.getClientRects().length > 0);
    shown?.focus();
    return shown !== undefined;
  };
  useImperativeHandle(ref, () => ({
    focusFirstInvalid: () => focusFirst('input[data-convert-input][aria-invalid="true"]'),
    focusFirstEditable: () => focusFirst('input[data-convert-input]:not(:disabled)'),
  }));

  const rowName = (row: CostLineRow) => row.description ?? labels.noDescription;

  const renderInput = (row: CostLineRow, surface: DataTableSurface): ReactNode => {
    const key = invoiceLineKey(row);
    const line = lines.get(key)!;
    const invalid = invalidKeys.has(key);
    const inputId = `${baseId}-${surface}-${key}`;
    const errorId = `${inputId}-error`;
    return (
      <>
        <input
          type="number"
          id={inputId}
          data-convert-input=""
          data-testid={dataTableTestId(`${testIdPrefix}-input`, key, surface)}
          className={`${sharedStyles.input} ${styles.input} ${invalid ? styles.inputInvalid : ''}`}
          value={line.keep ? line.offered.toFixed(2) : line.proposed}
          onChange={(event) => onChangeProposed(key, event.target.value)}
          onWheel={(event) => event.currentTarget.blur()}
          min="0.01"
          step="0.01"
          inputMode="decimal"
          disabled={disabled || line.keep}
          aria-label={labels.proposedAria(rowName(row))}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
        />
        {invalid && (
          <span data-testid={dataTableTestId(`${testIdPrefix}-error`, key, surface)}>
            <FormError variant="field" id={errorId} message={labels.lineInvalid} />
          </span>
        )}
      </>
    );
  };

  const renderKeep = (row: CostLineRow, surface: DataTableSurface, visibleLabel?: string) => {
    const key = invoiceLineKey(row);
    return (
      <label className={styles.keepLabel}>
        <input
          type="checkbox"
          className={styles.keepBox}
          checked={lines.get(key)!.keep}
          onChange={(event) => onToggleKeep(key, event.target.checked)}
          disabled={disabled}
          aria-label={labels.keepAria(rowName(row))}
          data-testid={dataTableTestId(`${testIdPrefix}-keep`, key, surface)}
        />
        {visibleLabel}
      </label>
    );
  };

  const totalTestId = (kind: string, surface: DataTableSurface) =>
    dataTableTestId(`${testIdPrefix}-total-${kind}`, 'all', surface);
  const remainderTestId = (surface: DataTableSurface) =>
    dataTableTestId(`${testIdPrefix}-remainder`, 'all', surface);

  return (
    <div className={styles.root} ref={rootRef} data-testid={testIdPrefix}>
      <div className={styles.tableSurface}>
        <table className={styles.table}>
          <caption className={sharedStyles.srOnly}>{labels.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.head}>
                {labels.line}
              </th>
              <th scope="col" className={styles.headEnd}>
                {labels.offered}
              </th>
              <th scope="col" className={styles.headEnd}>
                {labels.proposed}
              </th>
              <th scope="col" className={styles.headCenter}>
                {labels.keep}
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id}>
              <tr className={styles.groupHeadRow}>
                <th
                  scope="rowgroup"
                  colSpan={2}
                  className={styles.groupHead}
                  data-testid={dataTableTestId(`${testIdPrefix}-group`, group.id, 'table')}
                >
                  <TargetLabel target={groupTarget(group)} plain />
                </th>
                <td
                  className={styles.groupTotal}
                  data-testid={dataTableTestId(`${testIdPrefix}-group-total`, group.id, 'table')}
                >
                  {formatCurrency(groupProposedTotals.get(group.id)!)}
                </td>
                <td className={styles.groupHeadFill} />
              </tr>
              {group.rows.map((row) => {
                const key = invoiceLineKey(row);
                return (
                  <tr
                    key={key}
                    className={styles.row}
                    data-testid={dataTableTestId(`${testIdPrefix}-row`, key, 'table')}
                  >
                    <td className={styles.cellStack}>
                      <DescriptionCell row={row} />
                      {row.quantity !== null && row.unitPrice !== null && (
                        <span className={styles.facts}>
                          <QuantityPriceCell row={row} />
                        </span>
                      )}
                      <EnteredAsCell row={row} />
                    </td>
                    <td className={styles.cellEnd}>{formatCurrency(lines.get(key)!.offered)}</td>
                    <td className={styles.cellInput}>{renderInput(row, 'table')}</td>
                    <td className={styles.cellCenter}>{renderKeep(row, 'table')}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
          <tfoot>
            <tr className={styles.totalRow}>
              <th scope="row" className={styles.totalLabel}>
                {labels.total}
              </th>
              <td className={styles.totalAmount} data-testid={totalTestId('offered', 'table')}>
                {formatCurrency(offeredTotal)}
              </td>
              <td className={styles.totalAmount} data-testid={totalTestId('proposed', 'table')}>
                {formatCurrency(proposedTotal)}
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={4} className={styles.remainder} data-testid={remainderTestId('table')}>
                {remainder}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={styles.cardSurface}>
        {groups.map((group) => (
          <section key={group.id} className={styles.cardGroup}>
            <h3
              className={styles.cardGroupHead}
              data-testid={dataTableTestId(`${testIdPrefix}-group`, group.id, 'card')}
            >
              <TargetLabel target={groupTarget(group)} plain />
              <span
                className={styles.groupTotal}
                data-testid={dataTableTestId(`${testIdPrefix}-group-total`, group.id, 'card')}
              >
                {formatCurrency(groupProposedTotals.get(group.id)!)}
              </span>
            </h3>
            <ul className={styles.cardList}>
              {group.rows.map((row) => {
                const key = invoiceLineKey(row);
                return (
                  <li
                    key={key}
                    className={styles.card}
                    data-testid={dataTableTestId(`${testIdPrefix}-row`, key, 'card')}
                  >
                    <div className={styles.cardMain}>
                      <DescriptionCell row={row} />
                      <EnteredAsCell row={row} />
                    </div>
                    <div className={styles.cardGrid}>
                      <span className={styles.cardCaption}>{labels.offered}</span>
                      <span className={styles.cardCaption}>{labels.proposed}</span>
                      <span className={styles.cardOffered}>
                        {formatCurrency(lines.get(key)!.offered)}
                      </span>
                      <div className={styles.cardInput}>{renderInput(row, 'card')}</div>
                    </div>
                    {renderKeep(row, 'card', labels.keepVisible)}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <div className={styles.cardTotals}>
          <div className={styles.cardTotalLine}>
            <span className={styles.totalLabel}>{labels.total}</span>
          </div>
          <div className={styles.cardTotalLine}>
            <span>{labels.offered}</span>
            <span className={styles.totalAmount} data-testid={totalTestId('offered', 'card')}>
              {formatCurrency(offeredTotal)}
            </span>
          </div>
          <div className={styles.cardTotalLine}>
            <span>{labels.proposed}</span>
            <span className={styles.totalAmount} data-testid={totalTestId('proposed', 'card')}>
              {formatCurrency(proposedTotal)}
            </span>
          </div>
          <div className={styles.remainder} data-testid={remainderTestId('card')}>
            {remainder}
          </div>
        </div>
      </div>
    </div>
  );
}

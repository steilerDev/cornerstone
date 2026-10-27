import { useImperativeHandle, useRef } from 'react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { OriginState } from '../../navigation/origin.js';
import { dataTableTestId } from '../DataTable/dataTableTestId.js';
import type { DataTableSurface } from '../DataTable/dataTableTestId.js';
import type { OverflowMenuItem } from '../OverflowMenu/index.js';
import sharedStyles from '../../styles/shared.module.css';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { CostLineDocumentKind } from './costLineDocumentKind.js';
import { remainingState } from './costLineRows.js';
import {
  ActionsCell,
  DescriptionCell,
  EnteredAsCell,
  GrossCell,
  QuantityPriceCell,
  StateCell,
  TargetLabel,
} from './CostLineRowParts.js';
import type {
  CostLineGroup,
  CostLineGroupHeading,
  CostLineRow,
  CostLineTableMode,
} from './types.js';
import styles from './CostLineTable.module.css';

export interface CostLineTableProps {
  readonly mode: CostLineTableMode;
  readonly groups: readonly CostLineGroup[];
  /** Document mode: what is left of the offer or invoice after its lines. */
  readonly remainingAmount?: number;
  /** Document mode: the kind word in the Split label. */
  readonly documentKind?: CostLineDocumentKind;
  /** Not yet split › Split. */
  readonly onSplit?: () => void;
  /** Handle to focus the Split button after its dialog closes (resolves the visible copy). */
  readonly splitButtonRef?: Ref<CostLineSplitHandle>;
  readonly rowActions: (row: CostLineRow) => readonly OverflowMenuItem[];
  /** Remember the ⋯ that opened a row action, to return focus to it. */
  readonly onRowActionsTrigger?: (row: CostLineRow, el: HTMLElement) => void;
  readonly vatRate: number;
  readonly linkState?: OriginState;
  readonly testIdPrefix?: string;
}

/** What a host can do with the Split button: focus whichever copy is showing right now. */
export interface CostLineSplitHandle {
  focus: () => void;
}

/**
 * Both surfaces mount a Split button and CSS switches them by width, so which one is visible is
 * only known at use time: pick the one that is rendered (has layout boxes), else the first.
 */
export function focusVisibleSplit(buttons: readonly (HTMLButtonElement | null)[]): void {
  const present = buttons.filter((button): button is HTMLButtonElement => button !== null);
  const shown = present.find((button) => button.getClientRects().length > 0) ?? present[0];
  shown?.focus();
}

/**
 * The one read-only cost-line list. Item mode (a task, purchase or area): lines grouped into
 * Estimates and one group per offer or invoice, gross amounts with the net in a tooltip. Document
 * mode (an offer or invoice): one list with quantity × price, Entered as, gross and the task or
 * purchase each line belongs to, plus the Not yet split row. Both surfaces (table, cards) are
 * mounted and switched by the list's own width, like ObjectList.
 */
export function CostLineTable({
  mode,
  groups,
  remainingAmount,
  documentKind = 'invoice',
  onSplit,
  splitButtonRef,
  rowActions,
  onRowActionsTrigger,
  vatRate,
  linkState,
  testIdPrefix = 'cost-lines',
}: CostLineTableProps) {
  const { t } = useTranslation('costLines');
  const { formatCurrency } = useFormatters();
  const tableSplitRef = useRef<HTMLButtonElement | null>(null);
  const cardSplitRef = useRef<HTMLButtonElement | null>(null);
  useImperativeHandle(
    splitButtonRef,
    () => ({ focus: () => focusVisibleSplit([tableSplitRef.current, cardSplitRef.current]) }),
    [],
  );
  const isDocument = mode === 'document';
  const total = Math.round(groups.reduce((sum, group) => sum + group.total, 0) * 100) / 100;
  const remaining = isDocument && remainingAmount !== undefined ? remainingAmount : 0;
  const split = isDocument && remainingAmount !== undefined ? remainingState(remaining) : 'none';
  const columns = isDocument ? 6 : 5;

  function splitNotice(kind: 'notYetSplit' | 'over', surface: DataTableSurface): ReactNode {
    if (kind === 'over') {
      return (
        <span data-testid={dataTableTestId(testIdPrefix, 'over', surface)}>
          {t('table.over', { amount: formatCurrency(-remaining) })}
        </span>
      );
    }
    return (
      <>
        <span data-testid={dataTableTestId(testIdPrefix, 'not-yet-split', surface)}>
          {t('table.notYetSplit', { amount: formatCurrency(remaining) })}
        </span>
        {onSplit && (
          <button
            type="button"
            ref={surface === 'card' ? cardSplitRef : tableSplitRef}
            className={styles.splitButton}
            aria-label={t(I18N_UNION_KEYS.costLineSplitLabel.key(documentKind))}
            data-testid={dataTableTestId(testIdPrefix, 'split', surface)}
            onClick={onSplit}
          >
            {t('table.split')}
          </button>
        )}
      </>
    );
  }

  const noticeClass = split === 'over' ? styles.noticeOver : styles.noticeSplit;

  return (
    <div className={styles.root} data-testid={testIdPrefix}>
      <div className={styles.tableSurface}>
        <table className={styles.table}>
          <caption className={sharedStyles.srOnly}>{t('table.caption')}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.head}>
                {t('table.colStatus')}
              </th>
              <th scope="col" className={styles.head}>
                {t('table.colDescription')}
              </th>
              <th scope="col" className={styles.head}>
                {t('table.colQuantityPrice', { unitPrice: t('form.unitPrice') })}
              </th>
              {isDocument && (
                <th scope="col" className={styles.head}>
                  {t('table.colEnteredAs')}
                </th>
              )}
              <th scope="col" className={styles.headEnd}>
                {t('table.colGross')}
              </th>
              <th scope="col" className={styles.headAction}>
                <span className={sharedStyles.srOnly}>{t('table.colActions')}</span>
              </th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id}>
              {group.heading && (
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={columns}
                    className={styles.groupHead}
                    data-testid={dataTableTestId(`${testIdPrefix}-group`, group.id, 'table')}
                  >
                    <GroupHeading
                      heading={group.heading}
                      total={group.total}
                      plannedTotal={group.plannedTotal}
                      linkState={linkState}
                    />
                  </th>
                </tr>
              )}
              {group.rows.map((row) => (
                <tr
                  key={row.id}
                  className={styles.row}
                  data-testid={dataTableTestId(`${testIdPrefix}-row`, row.id, 'table')}
                >
                  <td className={styles.cell}>
                    <StateCell row={row} surface="table" prefix={testIdPrefix} />
                  </td>
                  <td className={styles.cellStack}>
                    <DescriptionCell row={row} />
                  </td>
                  <td className={styles.cell}>
                    <QuantityPriceCell row={row} />
                  </td>
                  {isDocument && (
                    <td className={styles.cell}>
                      <EnteredAsCell row={row} />
                    </td>
                  )}
                  <td className={styles.cellEnd}>
                    <GrossCell
                      row={row}
                      surface="table"
                      prefix={testIdPrefix}
                      mode={mode}
                      vatRate={vatRate}
                    />
                  </td>
                  <td className={styles.cellAction}>
                    <ActionsCell
                      row={row}
                      surface="table"
                      prefix={testIdPrefix}
                      items={rowActions(row)}
                      onTrigger={onRowActionsTrigger}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          {split !== 'none' && (
            <tbody>
              <tr>
                <td colSpan={columns} className={noticeClass}>
                  <div className={styles.noticeInner}>{splitNotice(split, 'table')}</div>
                </td>
              </tr>
            </tbody>
          )}
          <tfoot>
            <tr className={styles.totalRow}>
              <th scope="row" colSpan={isDocument ? 4 : 3} className={styles.totalLabel}>
                {t('table.total')}
              </th>
              <td
                className={styles.totalAmount}
                data-testid={dataTableTestId(testIdPrefix, 'total', 'table')}
              >
                {formatCurrency(total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className={styles.cardSurface}>
        {groups.map((group) => (
          <section key={group.id} className={styles.cardGroup}>
            {group.heading && (
              <h3
                className={styles.cardGroupHead}
                data-testid={dataTableTestId(`${testIdPrefix}-group`, group.id, 'card')}
              >
                <GroupHeading
                  heading={group.heading}
                  total={group.total}
                  plannedTotal={group.plannedTotal}
                  linkState={linkState}
                />
              </h3>
            )}
            <ul className={styles.cardList} aria-label={t('table.listLabel')}>
              {group.rows.map((row) => (
                <li
                  key={row.id}
                  className={styles.card}
                  data-testid={dataTableTestId(`${testIdPrefix}-row`, row.id, 'card')}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardMain}>
                      <StateCell row={row} surface="card" prefix={testIdPrefix} />
                      <DescriptionCell row={row} />
                    </div>
                    <ActionsCell
                      row={row}
                      surface="card"
                      prefix={testIdPrefix}
                      items={rowActions(row)}
                      onTrigger={onRowActionsTrigger}
                    />
                  </div>
                  <div className={styles.cardMoney}>
                    <span className={styles.cardEntered}>
                      <QuantityPriceCell row={row} />
                      {isDocument && <EnteredAsCell row={row} />}
                    </span>
                    <GrossCell
                      row={row}
                      surface="card"
                      prefix={testIdPrefix}
                      mode={mode}
                      vatRate={vatRate}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {split !== 'none' && (
          <div className={`${noticeClass} ${styles.cardNotice}`}>
            <div className={styles.noticeInner}>{splitNotice(split, 'card')}</div>
          </div>
        )}
        <div className={styles.cardTotal}>
          <span className={styles.totalLabel}>{t('table.total')}</span>
          <span
            className={styles.totalAmount}
            data-testid={dataTableTestId(testIdPrefix, 'total', 'card')}
          >
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface GroupHeadingProps {
  readonly heading: CostLineGroupHeading;
  readonly total: number;
  readonly plannedTotal: number;
  readonly linkState?: OriginState;
}

/** Heading of a group: Estimates, an offer/invoice with company and totals, or a task/purchase. */
function GroupHeading({ heading, total, plannedTotal, linkState }: GroupHeadingProps) {
  const { t } = useTranslation('costLines');
  const { formatCurrency, formatDate } = useFormatters();
  if (heading.kind === 'target') {
    return (
      <span className={styles.groupLine}>
        <TargetLabel target={heading.target} linkState={linkState} />
        <span className={styles.groupMeta}>
          {t('table.groupTotal', { amount: formatCurrency(total) })}
        </span>
      </span>
    );
  }
  if (heading.kind === 'estimates') {
    return (
      <span className={styles.groupLine}>
        <span className={styles.groupTitle}>{t('table.groupEstimates')}</span>
        <span className={styles.groupMeta}>
          {t('table.groupTotal', { amount: formatCurrency(total) })}
        </span>
      </span>
    );
  }
  const kind = t(
    heading.invoiceStatus === 'quotation' ? 'object.offerTitle' : 'object.invoiceTitle',
  );
  const title = heading.invoiceNumber
    ? t('table.groupInvoice', { kind, number: heading.invoiceNumber })
    : t('table.groupInvoiceNoNumber', { kind, date: formatDate(heading.invoiceDate) });
  const estimateDiffers = Math.abs(plannedTotal - total) >= 0.01;
  return (
    <span className={styles.groupLine}>
      <NavAnchor
        to={routeUrl('invoice', { id: heading.invoiceId })}
        state={linkState}
        className={styles.groupLink}
      >
        {title}
      </NavAnchor>
      {heading.vendorName && <span className={styles.groupMeta}>{heading.vendorName}</span>}
      <span className={styles.groupMeta}>
        {t('table.groupTotal', { amount: formatCurrency(total) })}
      </span>
      {estimateDiffers && (
        <span className={styles.groupMeta}>
          {t('table.estimateWas', { amount: formatCurrency(plannedTotal) })}
        </span>
      )}
    </span>
  );
}

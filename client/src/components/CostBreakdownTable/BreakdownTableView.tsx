import { Fragment, useId } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { BreakdownFigures, BreakdownLine } from '@cornerstone/shared';
import { CONFIDENCE_MARGINS, routeUrl } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import { CostLineStateChip } from '../CostLineTable/CostLineStateChip.js';
import { deriveCostLineState } from '../CostLineTable/costLineState.js';
import shared from '../../styles/shared.module.css';
import type { BreakdownEstimate, BreakdownView } from './breakdownSettings.js';
import { cellValue } from './breakdownTree.js';
import type { BreakdownColumn, BreakdownNode } from './breakdownTree.js';
import styles from './CostBreakdownTable.module.css';

/** Depth classes stop here; deeper rows share the last indent. */
const MAX_DEPTH = 6;

export interface BreakdownTableViewProps {
  readonly nodes: readonly BreakdownNode[];
  readonly columns: readonly BreakdownColumn[];
  readonly estimate: BreakdownEstimate;
  readonly view: BreakdownView;
  readonly total: BreakdownFigures;
  readonly totalLabel: string;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (key: string) => void;
  /** Muted funding source name of a line; null in the source view. */
  readonly lineSourceName: (line: BreakdownLine) => { text: string; userText: boolean } | null;
}

/** The table surface: depth-first rows, collapsed children kept in the DOM with `hidden`. */
export function BreakdownTableView({
  nodes,
  columns,
  estimate,
  view,
  total,
  totalLabel,
  expanded,
  onToggle,
  lineSourceName,
}: BreakdownTableViewProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const userText = useUserText();
  const captionId = useId();
  const originState = useOriginState();

  const renderName = (node: BreakdownNode): ReactNode => {
    if (node.item) {
      const to = routeUrl(node.item.kind === 'work_item' ? 'workItem' : 'householdItem', {
        id: node.item.id,
      });
      return (
        <NavAnchor to={to} state={originState} {...userText(styles.itemLink)}>
          {node.label.text}
        </NavAnchor>
      );
    }
    const { line } = node;
    const sourceName = line ? lineSourceName(line) : null;
    return (
      <>
        <span
          {...(node.label.userText ? userText(styles.nameText) : { className: styles.nameText })}
        >
          {node.label.text}
        </span>
        {line ? (
          <span className={styles.lineMeta}>
            <CostLineStateChip
              state={deriveCostLineState(line.linkStatus)}
              basis={line.linkStatus === null ? line.confidence : undefined}
              margin={CONFIDENCE_MARGINS[line.confidence]}
            />
            {sourceName !== null ? (
              <span
                {...(sourceName.userText
                  ? userText(styles.sourceName)
                  : { className: styles.sourceName })}
              >
                {sourceName.text}
              </span>
            ) : null}
          </span>
        ) : null}
      </>
    );
  };

  const renderRows = (list: readonly BreakdownNode[], depth: number, hidden: boolean): ReactNode =>
    list.map((node) => {
      const expandKey = `${view}:${node.key}`;
      const hasChildren = node.children.length > 0;
      const isOpen = expanded.has(expandKey);
      return (
        <Fragment key={node.key}>
          <tr
            hidden={hidden}
            className={styles.row}
            data-kind={node.kind}
            data-testid={`breakdown-row-${node.key}`}
          >
            <th scope="row" className={styles.nameCell} data-depth={Math.min(depth, MAX_DEPTH)}>
              <span className={styles.nameInner}>
                {hasChildren ? (
                  <button
                    type="button"
                    className={styles.chevron}
                    aria-expanded={isOpen}
                    aria-label={t(
                      isOpen ? 'overview.breakdown.collapse' : 'overview.breakdown.expand',
                      {
                        name: node.label.text,
                      },
                    )}
                    onClick={() => onToggle(expandKey)}
                    data-testid={`breakdown-toggle-${node.key}`}
                  >
                    <span className={styles.chevronIcon} aria-hidden="true">
                      ›
                    </span>
                  </button>
                ) : (
                  <span className={styles.chevronSpacer} aria-hidden="true" />
                )}
                <span className={styles.nameBody}>{renderName(node)}</span>
              </span>
            </th>
            {columns.map((column) => (
              <td
                key={column.id}
                className={styles.numCell}
                data-testid={`breakdown-cell-${node.key}-${column.id}`}
              >
                {formatCurrency(cellValue(node.figures, column.id, estimate))}
              </td>
            ))}
          </tr>
          {hasChildren ? renderRows(node.children, depth + 1, hidden || !isOpen) : null}
        </Fragment>
      );
    });

  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      data-testid="breakdown-table"
    >
      <table className={styles.table}>
        <caption id={captionId} className={shared.srOnly}>
          {t('overview.breakdown.caption', {
            view: t(I18N_UNION_KEYS.breakdownView.key(view)),
          })}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.headName}>
              {t('overview.breakdown.colName')}
            </th>
            {columns.map((column) => (
              <th key={column.id} scope="col" className={styles.headNum}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{renderRows(nodes, 0, false)}</tbody>
        <tfoot>
          <tr className={styles.totalRow} data-testid="breakdown-total">
            <th scope="row" className={styles.totalLabel}>
              {totalLabel}
            </th>
            {columns.map((column) => (
              <td
                key={column.id}
                className={styles.numCell}
                data-testid={`breakdown-total-${column.id}`}
              >
                {formatCurrency(cellValue(total, column.id, estimate))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

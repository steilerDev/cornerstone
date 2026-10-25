import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { routeUrl } from '@cornerstone/shared';
import { useFormatters } from '../../lib/formatters.js';
import { useUserText } from '../../hooks/useUserText.js';
import { useOriginState } from '../../navigation/useOriginState.js';
import { NavAnchor } from '../../navigation/NavAnchor.js';
import type { BreakdownEstimate } from './breakdownSettings.js';
import { cellValue } from './breakdownTree.js';
import type { BreakdownColumn, BreakdownNode } from './breakdownTree.js';
import styles from './CostBreakdownTable.module.css';

export interface BreakdownDrillListProps {
  readonly nodes: readonly BreakdownNode[];
  readonly columns: readonly BreakdownColumn[];
  readonly estimate: BreakdownEstimate;
  /** Drill announcements go to the card's status region. */
  readonly onAnnounce: (text: string) => void;
}

function findPath(
  nodes: readonly BreakdownNode[],
  path: readonly string[],
): BreakdownNode[] | null {
  const found: BreakdownNode[] = [];
  let level = nodes;
  for (const key of path) {
    const node = level.find((n) => n.key === key);
    if (!node) return null;
    found.push(node);
    level = node.children;
  }
  return found;
}

/** The phone surface: one level at a time; a row with children drills in. */
export function BreakdownDrillList({
  nodes,
  columns,
  estimate,
  onAnnounce,
}: BreakdownDrillListProps) {
  const { t } = useTranslation('budget');
  const { formatCurrency } = useFormatters();
  const userText = useUserText();
  const originState = useOriginState();
  const [path, setPath] = useState<readonly string[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusTargetRef = useRef<'heading' | 'list' | null>(null);

  // A node that disappeared after a settings change resets the path.
  const trail = findPath(nodes, path);
  if (trail === null) {
    setPath([]);
  }
  const trailNodes = trail ?? [];
  const current = trailNodes.length > 0 ? trailNodes[trailNodes.length - 1] : undefined;
  const parent = trailNodes.length > 1 ? trailNodes[trailNodes.length - 2] : undefined;
  const level = current ? current.children : nodes;

  useLayoutEffect(() => {
    if (focusTargetRef.current === 'heading') headingRef.current!.focus();
    else if (focusTargetRef.current === 'list') {
      listRef.current!.querySelector<HTMLElement>('button, a')?.focus();
    }
    focusTargetRef.current = null;
  }, [path]);

  const [first, ...rest] = columns;

  const renderBody = (node: BreakdownNode): ReactNode => (
    <>
      <span className={styles.drillTop}>
        <span
          {...(node.label.userText ? userText(styles.drillName) : { className: styles.drillName })}
        >
          {node.label.text}
        </span>
        {first ? (
          <span className={styles.drillFigure}>
            {formatCurrency(cellValue(node.figures, first.id, estimate))}
          </span>
        ) : null}
      </span>
      {rest.length > 0 ? (
        <span className={styles.drillRest}>
          {rest
            .map((column) =>
              t('overview.breakdown.printSummary.pair', {
                label: column.label,
                value: formatCurrency(cellValue(node.figures, column.id, estimate)),
              }),
            )
            .join(' · ')}
        </span>
      ) : null}
    </>
  );

  return (
    <div className={styles.drill} data-testid="breakdown-list">
      {current ? (
        <div className={styles.drillHeader}>
          <h3
            ref={headingRef}
            tabIndex={-1}
            {...(current.label.userText && !current.item
              ? userText(styles.drillHeading)
              : { className: styles.drillHeading })}
            data-testid="breakdown-list-heading"
          >
            {current.item ? (
              <NavAnchor
                to={routeUrl(current.item.kind === 'work_item' ? 'workItem' : 'householdItem', {
                  id: current.item.id,
                })}
                state={originState}
                {...userText(styles.drillHeadingLink)}
                data-testid="breakdown-list-heading-link"
              >
                {current.label.text}
              </NavAnchor>
            ) : (
              current.label.text
            )}
          </h3>
          <button
            type="button"
            className={styles.drillBack}
            onClick={() => {
              focusTargetRef.current = 'list';
              setPath((prev) => prev.slice(0, -1));
              onAnnounce(
                t('overview.breakdown.drilledIn', {
                  name: parent?.label.text ?? t('overview.breakdown.backToAll'),
                }),
              );
            }}
            data-testid="breakdown-list-back"
          >
            <span aria-hidden="true">‹ </span>
            {t('overview.breakdown.back', {
              name: parent?.label.text ?? t('overview.breakdown.backToAll'),
            })}
          </button>
        </div>
      ) : null}
      <ul ref={listRef} className={styles.drillList}>
        {level.map((node) => {
          const hasChildren = node.children.length > 0;
          let row: ReactNode;
          if (hasChildren) {
            row = (
              <button
                type="button"
                className={styles.drillRow}
                onClick={() => {
                  focusTargetRef.current = 'heading';
                  setPath((prev) => [...prev, node.key]);
                  onAnnounce(t('overview.breakdown.drilledIn', { name: node.label.text }));
                }}
                data-testid={`breakdown-list-row-${node.key}`}
              >
                {renderBody(node)}
                <span className={styles.drillChevron} aria-hidden="true">
                  ›
                </span>
              </button>
            );
          } else if (node.item) {
            row = (
              <NavAnchor
                to={routeUrl(node.item.kind === 'work_item' ? 'workItem' : 'householdItem', {
                  id: node.item.id,
                })}
                state={originState}
                className={styles.drillRow}
                data-testid={`breakdown-list-row-${node.key}`}
              >
                {renderBody(node)}
              </NavAnchor>
            );
          } else {
            row = (
              <div className={styles.drillRow} data-testid={`breakdown-list-row-${node.key}`}>
                {renderBody(node)}
              </div>
            );
          }
          return (
            <li key={node.key} className={styles.drillItem}>
              {row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  Ref,
  RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaSummary } from '@cornerstone/shared';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { todayLocalIsoDate } from '../../lib/localDate.js';
import { barDates, purchaseLateDays } from '../../lib/scheduleDates.js';
import type { ScheduleSignalState } from '../../lib/scheduleDates.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';
import { Badge } from '../Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../Badge/statusBadgeVariants.js';
import { ROW_HEIGHT, HEADER_HEIGHT, lateSignalOf } from './ganttUtils.js';
import type { GanttRow } from './ganttUtils.js';
import styles from './GanttSidebar.module.css';

export interface GanttSidebarProps {
  /** The chart rows (group headers, tasks, milestones, purchases), in display order. */
  rows: readonly GanttRow[];
  criticalWorkItemIds: ReadonlySet<string>;
  criticalMilestoneIds: ReadonlySet<number>;
  /** The row whose panel is open. */
  selectedKey?: ScheduleRowKey | null;
  /** A row button was activated (click, Enter or Space). */
  onSelect?: (key: ScheduleRowKey, opener: HTMLElement) => void;
  /** A group header was toggled. */
  onToggleGroup?: (groupId: string) => void;
  /** A row button gained focus: its links highlight, as on hover. */
  onRowFocus?: (key: ScheduleRowKey) => void;
  onRowBlur?: () => void;
  /** Called when the sidebar scroll container scrolls — for syncing to the chart. */
  onScroll?: () => void;
}

const PATH_SEPARATOR = ' › ';

function areaPath(area: AreaSummary | null | undefined): string | null {
  if (!area) return null;
  return [...area.ancestors.map((ancestor) => ancestor.name), area.name].join(PATH_SEPARATOR);
}

/**
 * GanttSidebar renders the fixed left panel with one row per chart row. It is HTML (not SVG)
 * for text rendering and a11y: every row is a `<button>` inside a `listitem` (D8).
 *
 * The ref is forwarded to the inner scrollable container for external scroll sync.
 *
 * Keyboard navigation:
 * - ArrowUp/ArrowDown: move focus between rows, group headers included
 * - Enter/Space (native button): open the panel
 */
export const GanttSidebar = function GanttSidebar({
  ref,
  rows,
  criticalWorkItemIds,
  criticalMilestoneIds,
  selectedKey = null,
  onSelect,
  onToggleGroup,
  onRowFocus,
  onRowBlur,
  onScroll,
}: GanttSidebarProps & { ref?: Ref<HTMLDivElement | null> }) {
  const { t } = useTranslation('schedule');
  const { scheduleSignal, criticalSignal } = useStatusBadgeVariants();
  // Ref for the rows container to query row elements
  const rowsRef = useRef<HTMLDivElement>(null);

  function handleArrowKeys(e: ReactKeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = rowsRef.current!.querySelectorAll<HTMLButtonElement>(
      '[data-gantt-sidebar-row]',
    );
    const next = buttons[e.key === 'ArrowDown' ? idx + 1 : idx - 1];
    if (!next) return;
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  function signalLabel(state: ScheduleSignalState): string {
    const { variants, value } = scheduleSignalBadgeProps(state, scheduleSignal);
    return variants[value].label;
  }

  return (
    <div className={styles.sidebar} data-testid="gantt-sidebar">
      {/* Header cell matching the time header height */}
      <div
        className={styles.sidebarHeader}
        style={{ height: HEADER_HEIGHT }}
        aria-hidden="true"
        id="gantt-sidebar-header"
      >
        {t('ganttSidebar.header')}
      </div>

      {/* Scrollable rows container — ref is assigned here for scroll sync */}
      <div
        ref={(node) => {
          // Assign both the passed ref and our local ref
          rowsRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref && typeof ref === 'object') {
            (ref as RefObject<HTMLDivElement | null>).current = node;
          }
        }}
        className={styles.sidebarRows}
        role="list"
        aria-label={t('ganttSidebar.ariaLabel')}
        onScroll={onScroll}
      >
        {rows.map((row, idx) => {
          const stripe = idx % 2 === 0 ? styles.sidebarRowEven : styles.sidebarRowOdd;

          if (row.kind === 'group') {
            return (
              <div
                key={`group-${row.groupId}`}
                className={styles.groupRow}
                style={{ height: ROW_HEIGHT }}
                role="listitem"
              >
                <button
                  type="button"
                  className={styles.groupButton}
                  aria-expanded={!row.collapsed}
                  aria-label={t('view.gantt.groupToggle', { name: row.name, count: row.count })}
                  onClick={() => onToggleGroup?.(row.groupId)}
                  onKeyDown={(e) => handleArrowKeys(e, idx)}
                  data-testid={`gantt-group-${row.groupId}`}
                  data-gantt-sidebar-row={idx}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 10 10"
                    width="10"
                    height="10"
                    aria-hidden="true"
                    className={`${styles.groupChevron} ${row.collapsed ? '' : styles.groupChevronOpen}`}
                  >
                    <polygon points="2,1 8,5 2,9" fill="currentColor" />
                  </svg>
                  <span className={styles.groupName} title={row.name}>
                    {row.name}
                  </span>
                  <span className={styles.groupCount} aria-hidden="true">
                    {row.count}
                  </span>
                </button>
              </div>
            );
          }

          const isSelected = row.key === selectedKey;
          const rowClass = `${styles.sidebarRow} ${stripe} ${isSelected ? styles.sidebarRowSelected : ''}`;
          const common = {
            type: 'button' as const,
            className: styles.rowButton,
            'aria-current': isSelected ? ('true' as const) : undefined,
            onClick: (e: ReactMouseEvent<HTMLButtonElement>) =>
              onSelect?.(row.key, e.currentTarget),
            onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => handleArrowKeys(e, idx),
            onFocus: () => onRowFocus?.(row.key),
            onBlur: () => onRowBlur?.(),
            'data-gantt-sidebar-row': idx,
            'data-gantt-row-key': row.key,
          };

          if (row.kind === 'workItem') {
            const item = row.item;
            const itemDates = barDates(item);
            const hasNoDates = !itemDates.start && !itemDates.end;
            const signal = lateSignalOf(item);
            const path = areaPath(item.area);
            const company = item.assignedVendor?.name ?? null;
            const subline = [item.area?.name, company].filter(Boolean).join(' · ');
            const ariaLabel = [
              t(hasNoDates ? 'gantt.aria.sidebarWorkItemNoDates' : 'gantt.aria.sidebarWorkItem', {
                title: item.title,
              }),
              path,
              company,
              signal ? signalLabel(signal) : null,
              criticalWorkItemIds.has(item.id) ? criticalSignal.critical.label : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <div
                key={item.id}
                className={rowClass}
                style={{ height: ROW_HEIGHT }}
                role="listitem"
              >
                <button
                  {...common}
                  aria-label={ariaLabel}
                  data-testid={`gantt-sidebar-row-${item.id}`}
                >
                  <span className={styles.titleLine}>
                    <span
                      className={`${styles.sidebarRowLabel} ${hasNoDates ? styles.sidebarRowLabelMuted : ''}`}
                      title={item.title}
                    >
                      {item.title}
                    </span>
                    {signal && (
                      <span className={styles.signalChip}>
                        <Badge
                          {...scheduleSignalBadgeProps(signal, scheduleSignal)}
                          testId={`gantt-late-${item.id}`}
                        />
                      </span>
                    )}
                  </span>
                  {subline && (
                    <span className={styles.subline} title={path ?? undefined}>
                      {subline}
                    </span>
                  )}
                </button>
              </div>
            );
          }

          if (row.kind === 'milestone') {
            const milestone = row.milestone;
            const ariaLabel = [
              t('gantt.aria.sidebarMilestone', { title: milestone.title }),
              criticalMilestoneIds.has(milestone.id) ? criticalSignal.critical.label : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <div
                key={`milestone-${milestone.id}`}
                className={`${rowClass} ${styles.sidebarMilestoneRow}`}
                style={{ height: ROW_HEIGHT }}
                role="listitem"
              >
                <button
                  {...common}
                  aria-label={ariaLabel}
                  data-testid={`gantt-sidebar-milestone-${milestone.id}`}
                >
                  <span className={styles.titleLine}>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 10 10"
                      width="10"
                      height="10"
                      aria-hidden="true"
                      className={styles.milestoneDiamondIcon}
                    >
                      <polygon points="5,0 10,5 5,10 0,5" fill="currentColor" />
                    </svg>
                    <span className={styles.sidebarMilestoneLabel} title={milestone.title}>
                      {milestone.title}
                    </span>
                  </span>
                </button>
              </div>
            );
          }

          const hi = row.item;
          const purchaseLate = purchaseLateDays(hi, todayLocalIsoDate());
          const purchaseSignal: ScheduleSignalState | null =
            purchaseLate > 0 ? { signal: 'late', days: purchaseLate } : null;
          const purchasePath = areaPath(hi.area);
          const purchaseLabel = [
            t('gantt.aria.sidebarHouseholdItem', { name: hi.name }),
            purchasePath,
            purchaseSignal ? signalLabel(purchaseSignal) : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <div
              key={`hi-${hi.id}`}
              className={`${rowClass} ${styles.sidebarHouseholdItemRow}`}
              style={{ height: ROW_HEIGHT }}
              role="listitem"
            >
              <button
                {...common}
                aria-label={purchaseLabel}
                data-testid={`gantt-sidebar-hi-${hi.id}`}
              >
                <span className={styles.titleLine}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 10 10"
                    width="8"
                    height="8"
                    aria-hidden="true"
                    className={styles.householdItemCircleIcon}
                  >
                    <circle cx="5" cy="5" r="4" fill="currentColor" />
                  </svg>
                  <span className={styles.sidebarHouseholdItemLabel} title={hi.name}>
                    {hi.name}
                  </span>
                  {purchaseSignal && (
                    <span className={styles.signalChip}>
                      <Badge
                        {...scheduleSignalBadgeProps(purchaseSignal, scheduleSignal)}
                        testId={`gantt-late-hi-${hi.id}`}
                      />
                    </span>
                  )}
                </span>
                {hi.area && (
                  <span className={styles.subline} title={purchasePath ?? undefined}>
                    {hi.area.name}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

import { routeUrl } from '@cornerstone/shared';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { WorkItemStatus, DependencyType, HouseholdItemStatus } from '@cornerstone/shared';
import { milestoneDisplayStatus, milestoneStatusLabel } from '../../lib/milestoneStatusLabel.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import { useFormatters, toBcp47Locale } from '../../lib/formatters.js';
import type { ScheduleSignalState } from '../../lib/scheduleDates.js';
import { plannedRangeText, showsPlannedRow } from '../../lib/scheduleDates.js';
import { Badge } from '../Badge/Badge.js';
import { scheduleSignalBadgeProps } from '../Badge/statusBadgeVariants.js';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { estimateWorkItemTooltipHeight } from './tooltipData.js';
import styles from './GanttTooltip.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in the work-item tooltip's Waits for / Holds up lists. */
export interface GanttTooltipDependencyEntry {
  /** Title of the related (predecessor or successor) work item. */
  relatedTitle: string;
  /** The dependency relationship type. */
  dependencyType: DependencyType;
  /** Whether this item is a predecessor of, or successor to, the hovered work item. */
  role: 'predecessor' | 'successor';
}

export interface GanttTooltipWorkItemData {
  kind: 'work-item';
  title: string;
  status: WorkItemStatus;
  /** Dates the bar draws (actual, else forecast). */
  startDate: string | null;
  endDate: string | null;
  /** Planned (stored) dates; the "Planned" row renders when they differ from the shown dates. */
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  /** Late / Held up signal, or null when on time. */
  scheduleSignal: ScheduleSignalState | null;
  durationDays: number | null;
  assignedUserName: string | null;
  /** Company (vendor) name, if the work item has one. */
  assignedVendorName?: string | null;
  /** Area name, if the work item is assigned to an area. */
  areaName?: string | null;
  /**
   * Dependency relationships for this work item (predecessors and successors).
   * Grouped by `role` into Waits for / Holds up; empty groups are not rendered.
   */
  dependencies?: GanttTooltipDependencyEntry[];
  /**
   * @deprecated Delay indicator has been removed from work item tooltips.
   * Only milestones track late/delay status. Field retained for type compatibility.
   */
  delayDays?: number | null;
  /** User-set planned duration in days. Null if not explicitly set. */
  plannedDurationDays?: number | null;
  /** Computed actual/effective duration in days (from start/end dates). Null if not computable. */
  actualDurationDays?: number | null;
  /**
   * Work item ID used for the "View item" navigation link on touch devices.
   * When provided, a "View item" link to the `workItem` route is rendered
   * in the tooltip on touch (pointer: coarse) devices.
   */
  workItemId?: string;
}

export interface GanttTooltipMilestoneData {
  kind: 'milestone';
  title: string;
  targetDate: string;
  /** Latest end date among linked work items, or null if unavailable. */
  projectedDate: string | null;
  isCompleted: boolean;
  /** True when not completed and projectedDate > targetDate. */
  isLate: boolean;
  completedAt: string | null;
  /** Work items directly linked to this milestone via milestone.workItemIds (contributing items). */
  linkedWorkItems: { id: string; title: string }[];
  /** Work items that depend on this milestone (have this milestone in their requiredMilestoneIds). */
  dependentWorkItems: { id: string; title: string }[];
  /**
   * Milestone ID used for the "View item" navigation link on touch devices.
   * When provided, a "View item" button is rendered in the tooltip on touch devices.
   * The click handler calls onMilestoneNavigate with the milestone ID.
   */
  milestoneId?: number;
}

export interface GanttTooltipArrowData {
  kind: 'arrow';
  /** Human-readable description of the dependency relationship. */
  description: string;
}

export interface GanttTooltipHouseholdItemData {
  kind: 'household-item';
  name: string;
  /** Area path, if the purchase is assigned to an area. */
  areaName?: string | null;
  status: HouseholdItemStatus;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
  targetDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  isLate: boolean;
  /** HI ID for "View item" touch link. */
  householdItemId?: string;
  /** Linked items (work items / milestones) that this household item depends on. */
  linkedItems?: { id: string; title: string; type: 'work_item' | 'milestone' }[];
}

/**
 * Polymorphic tooltip data — discriminated by the `kind` field.
 */
export type GanttTooltipData =
  | GanttTooltipWorkItemData
  | GanttTooltipMilestoneData
  | GanttTooltipArrowData
  | GanttTooltipHouseholdItemData;

export interface GanttTooltipPosition {
  /** Mouse X in viewport coordinates. */
  x: number;
  /** Mouse Y in viewport coordinates. */
  y: number;
}

interface GanttTooltipProps {
  data: GanttTooltipData;
  position: GanttTooltipPosition;
  /** ID to apply to the tooltip element (for aria-describedby on the trigger). */
  id?: string;
  /**
   * When true, renders a "View item" link/button inside the tooltip.
   * Used on touch (pointer: coarse) devices where the two-tap pattern is active.
   * On desktop, this prop should be false so the action is not rendered.
   */
  isTouchDevice?: boolean;
  /**
   * Called when the "View item" action is tapped on a milestone tooltip.
   * Receives the milestone ID. Used on touch devices only.
   */
  onMilestoneNavigate?: (milestoneId: number) => void;
  /**
   * Called when the "View item" action is tapped on a household item tooltip.
   * Receives the household item ID. Used on touch devices only.
   */
  onHiNavigate?: (itemId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOOLTIP_WIDTH = 240;
const TOOLTIP_HEIGHT_ESTIMATE = 200; // safe upper bound used for arrow/milestone tooltips
const OFFSET_X = 12;
const OFFSET_Y = 8;

const MAX_DEPS_SHOWN = 5;

function WorkItemTooltipContent({
  data,
  isTouchDevice,
}: {
  data: GanttTooltipWorkItemData;
  isTouchDevice?: boolean;
}) {
  const { t } = useTranslation('schedule');
  const { formatDate } = useFormatters();
  const { resolvedLocale } = useLocale();

  const { task: taskVariants, scheduleSignal: scheduleSignalVariants } = useStatusBadgeVariants();
  const plannedValue = showsPlannedRow(data)
    ? plannedRangeText(
        data.plannedStartDate,
        data.plannedEndDate,
        toBcp47Locale(resolvedLocale),
        formatDate,
      )
    : null;

  const dependencyTypeLabels: Record<DependencyType, string> = {
    finish_to_start: t('gantt.tooltip.dependency.finishToStart')!,
    start_to_start: t('gantt.tooltip.dependency.startToStart')!,
    finish_to_finish: t('gantt.tooltip.dependency.finishToFinish')!,
    start_to_finish: t('gantt.tooltip.dependency.startToFinish')!,
  };

  function formatDuration(days: number | null): string {
    if (days === null) return '—';
    if (days === 1) return `1 ${t('gantt.tooltip.duration.day')}`;
    return `${days} ${t('gantt.tooltip.duration.days')}`;
  }

  const dependencies = data.dependencies ?? [];
  const waitsFor = dependencies.filter((d) => d.role === 'predecessor');
  const holdsUp = dependencies.filter((d) => d.role === 'successor');

  // Whether the duration section rendered a trailing separator.
  // Used to avoid a double separator when there is no owner row between the
  // variance section and the dependencies section.
  const hasBothDurations = data.plannedDurationDays != null && data.actualDurationDays != null;
  // A separator before dependencies is only needed when the last section before
  // dependencies did NOT already emit a trailing separator. The trailing separator
  // in the variance branch handles the case where there IS an owner row or dependencies
  // follow directly. We suppress it here by moving the separator responsibility to
  // the dependencies block and removing the trailing separator from the variance branch.
  const hasAssignee = data.assignedUserName != null || data.assignedVendorName != null;

  const durationVariance = hasBothDurations
    ? data.actualDurationDays! - data.plannedDurationDays!
    : null;
  const absDurationVariance = durationVariance !== null ? Math.abs(durationVariance) : 0;
  const varianceLabel =
    durationVariance !== null && durationVariance !== 0
      ? durationVariance > 0
        ? `+${absDurationVariance}`
        : `-${absDurationVariance}`
      : null;
  const varianceDayWord =
    absDurationVariance === 1 ? t('gantt.tooltip.duration.day') : t('gantt.tooltip.duration.days');
  const varianceClass =
    durationVariance !== null && durationVariance > 0
      ? styles.detailValueOverPlan
      : styles.detailValueUnderPlan;
  const durationVarianceRow =
    durationVariance === null ? null : durationVariance === 0 ? (
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>{t('gantt.tooltip.duration.variance')}</span>
        <span className={styles.detailValue}>{t('gantt.tooltip.duration.onPlan')}</span>
      </div>
    ) : (
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>{t('gantt.tooltip.duration.variance')}</span>
        <span className={`${styles.detailValue} ${varianceClass}`}>
          {varianceLabel} {varianceDayWord}
        </span>
      </div>
    );

  function renderDependencyGroup(
    label: string,
    entries: GanttTooltipDependencyEntry[],
    testId: string,
  ) {
    if (entries.length === 0) return null;
    const shown = entries.slice(0, MAX_DEPS_SHOWN);
    const overflow = entries.length - shown.length;
    return (
      <div className={styles.linkedItemsSection} data-testid={testId}>
        <span className={styles.linkedItemsLabel}>
          {label} ({entries.length})
        </span>
        <ul className={styles.linkedItemsList} aria-label={label}>
          {shown.map((dep, idx) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- dependency list filtered at render time; composite key with title+index is stable
            <li key={`${dep.relatedTitle}-${idx}`} className={styles.linkedItem}>
              <span className={styles.depTypeLabel}>
                {dependencyTypeLabels[dep.dependencyType]}
              </span>{' '}
              {dep.relatedTitle}
            </li>
          ))}
          {overflow > 0 && (
            <li className={styles.linkedItemsOverflow}>
              +{overflow} {t('gantt.tooltip.workItem.more')}
            </li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <>
      {/* Header: title + status badge */}
      <div className={styles.header}>
        <span className={styles.title}>{data.title}</span>
        <span className={styles.headerChips}>
          <span className={`${styles.statusBadge} ${taskVariants[data.status].className}`}>
            {taskVariants[data.status].label}
          </span>
          {data.scheduleSignal && (
            <Badge
              {...scheduleSignalBadgeProps(data.scheduleSignal, scheduleSignalVariants)}
              testId="gantt-tooltip-schedule-signal"
            />
          )}
        </span>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      {/* Date range */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>{t('gantt.tooltip.workItem.startLabel')}</span>
        <span className={styles.detailValue}>{formatDate(data.startDate)}</span>
      </div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>{t('gantt.tooltip.workItem.endLabel')}</span>
        <span className={styles.detailValue}>{formatDate(data.endDate)}</span>
      </div>
      {plannedValue && (
        <div className={styles.detailRow} data-testid="gantt-tooltip-planned">
          <span className={styles.detailLabel}>{t('gantt.tooltip.workItem.plannedLabel')}</span>
          <span className={styles.detailValue}>{plannedValue}</span>
        </div>
      )}

      {/* Duration section — planned/actual/variance when both available, single row fallback */}
      {hasBothDurations ? (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{t('gantt.tooltip.duration.planned')}</span>
            <span className={styles.detailValue}>
              {formatDuration(data.plannedDurationDays ?? null)}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>{t('gantt.tooltip.duration.actual')}</span>
            <span className={styles.detailValue}>
              {formatDuration(data.actualDurationDays ?? null)}
            </span>
          </div>
          {durationVarianceRow}
        </>
      ) : data.plannedDurationDays != null ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.duration.planned')}</span>
          <span className={styles.detailValue}>{formatDuration(data.plannedDurationDays)}</span>
        </div>
      ) : data.actualDurationDays != null ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.duration.label')}</span>
          <span className={styles.detailValue}>{formatDuration(data.actualDurationDays)}</span>
        </div>
      ) : (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.duration.label')}</span>
          <span className={styles.detailValue}>{formatDuration(data.durationDays)}</span>
        </div>
      )}

      {/* Separator after duration section — only when variance was shown AND owner follows.
          When variance is shown but no owner, the separator before dependencies handles it.
          When no variance is shown, no separator is needed here. */}
      {hasBothDurations && hasAssignee && <div className={styles.separator} aria-hidden="true" />}

      {/* Assigned user */}
      {data.assignedUserName != null && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.workItem.ownerLabel')}</span>
          <span className={styles.detailValue}>{data.assignedUserName}</span>
        </div>
      )}

      {/* Company */}
      {data.assignedVendorName && (
        <div className={styles.detailRow} data-testid="gantt-tooltip-company">
          <span className={styles.detailLabel}>{t('gantt.tooltip.workItem.companyLabel')}</span>
          <span className={styles.detailValue}>{data.assignedVendorName}</span>
        </div>
      )}

      {/* Area */}
      {data.areaName && (
        <div className={styles.detailRow} data-testid="gantt-tooltip-area">
          <span className={styles.detailLabel}>{t('gantt.tooltip.workItem.areaLabel')}</span>
          <span className={styles.detailValue}>{data.areaName}</span>
        </div>
      )}

      {/* Waits for / Holds up — one separator before the first non-empty group */}
      {dependencies.length > 0 && <div className={styles.separator} aria-hidden="true" />}
      {renderDependencyGroup(
        t('gantt.tooltip.workItem.waitsFor'),
        waitsFor,
        'gantt-tooltip-waits-for',
      )}
      {renderDependencyGroup(
        t('gantt.tooltip.workItem.holdsUp'),
        holdsUp,
        'gantt-tooltip-holds-up',
      )}

      {/* Touch device navigation affordance — "View item" link visible only on pointer: coarse */}
      {isTouchDevice && data.workItemId && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <Link
            to={routeUrl('workItem', { id: data.workItemId })}
            className={styles.viewItemLink}
            aria-label={`${t('gantt.tooltip.navigation.viewItem')} ${data.title}`}
          >
            {t('gantt.tooltip.navigation.viewItem')}
          </Link>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Milestone tooltip content
// ---------------------------------------------------------------------------

const MAX_LINKED_ITEMS_SHOWN = 5;

function MilestoneTooltipContent({
  data,
  isTouchDevice,
  onMilestoneNavigate,
}: {
  data: GanttTooltipMilestoneData;
  isTouchDevice?: boolean;
  onMilestoneNavigate?: (milestoneId: number) => void;
}) {
  const { t } = useTranslation('schedule');
  const { t: tCommon } = useTranslation('common');
  const { formatDate } = useFormatters();

  const displayStatus = milestoneDisplayStatus(data).status;
  const statusLabel = milestoneStatusLabel(tCommon, data);
  const { milestone: milestoneVariants } = useStatusBadgeVariants();
  const statusClass = milestoneVariants[displayStatus].className;

  const { linkedWorkItems, dependentWorkItems } = data;
  const shownLinked = linkedWorkItems.slice(0, MAX_LINKED_ITEMS_SHOWN);
  const linkedOverflowCount = linkedWorkItems.length - shownLinked.length;
  const shownDependent = dependentWorkItems.slice(0, MAX_LINKED_ITEMS_SHOWN);
  const dependentOverflowCount = dependentWorkItems.length - shownDependent.length;

  const hasBothEmpty = linkedWorkItems.length === 0 && dependentWorkItems.length === 0;

  return (
    <>
      {/* Header: title + completion badge */}
      <div className={styles.header}>
        <span className={`${styles.milestoneIcon}`} aria-hidden="true">
          {/* Small diamond SVG icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 10 10"
            width="10"
            height="10"
            fill="currentColor"
            aria-hidden="true"
          >
            <polygon points="5,0 10,5 5,10 0,5" />
          </svg>
        </span>
        <span className={styles.title}>{data.title}</span>
        <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      {/* Target date */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>{t('gantt.tooltip.milestone.targetLabel')}</span>
        <span className={styles.detailValue}>{formatDate(data.targetDate)}</span>
      </div>

      {/* Projected date — show when available and milestone is not yet completed */}
      {!data.isCompleted && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.milestone.projectedLabel')}</span>
          <span className={`${styles.detailValue} ${data.isLate ? styles.detailValueLate : ''}`}>
            {data.projectedDate !== null ? formatDate(data.projectedDate) : '—'}
          </span>
        </div>
      )}

      {/* Completion date */}
      {data.isCompleted && data.completedAt !== null && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.milestone.doneLabel')}</span>
          <span className={styles.detailValue}>{formatDate(data.completedAt)}</span>
        </div>
      )}

      {/* When both lists are empty, show a single "No linked items" row */}
      {hasBothEmpty ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.milestone.linkedItems')}</span>
          <span className={styles.detailValue}>{t('gantt.tooltip.milestone.none')}</span>
        </div>
      ) : (
        <>
          {/* Contributing items — work items linked to this milestone via workItemIds */}
          <div className={styles.separator} aria-hidden="true" />
          {linkedWorkItems.length === 0 ? (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>
                {t('gantt.tooltip.milestone.contributing')}
              </span>
              <span className={styles.detailValue}>{t('gantt.tooltip.milestone.none')}</span>
            </div>
          ) : (
            <div className={styles.linkedItemsSection}>
              <span className={styles.linkedItemsLabel}>
                {t('gantt.tooltip.milestone.contributing')} ({linkedWorkItems.length})
              </span>
              <ul
                className={styles.linkedItemsList}
                aria-label={t('gantt.tooltip.milestone.contributingAriaLabel')}
              >
                {shownLinked.map((item) => (
                  <li key={item.id} className={styles.linkedItem}>
                    {item.title}
                  </li>
                ))}
                {linkedOverflowCount > 0 && (
                  <li className={styles.linkedItemsOverflow}>
                    +{linkedOverflowCount} {t('gantt.tooltip.workItem.more')}
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Dependent items — work items that depend on this milestone via requiredMilestoneIds */}
          {dependentWorkItems.length === 0 ? (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>
                {t('gantt.tooltip.milestone.blockedByThis')}
              </span>
              <span className={styles.detailValue}>{t('gantt.tooltip.milestone.none')}</span>
            </div>
          ) : (
            <div className={styles.linkedItemsSection}>
              <span className={styles.linkedItemsLabel}>
                {t('gantt.tooltip.milestone.blockedByThis')} ({dependentWorkItems.length})
              </span>
              <ul
                className={styles.linkedItemsList}
                aria-label={t('gantt.tooltip.milestone.blockedByThisAriaLabel')}
              >
                {shownDependent.map((item) => (
                  <li key={item.id} className={styles.linkedItem}>
                    {item.title}
                  </li>
                ))}
                {dependentOverflowCount > 0 && (
                  <li className={styles.linkedItemsOverflow}>
                    +{dependentOverflowCount} {t('gantt.tooltip.workItem.more')}
                  </li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Touch device navigation affordance — "View item" button visible only on pointer: coarse */}
      {isTouchDevice && data.milestoneId !== undefined && onMilestoneNavigate && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <button
            type="button"
            className={styles.viewItemLink}
            onClick={() => onMilestoneNavigate(data.milestoneId!)}
            aria-label={`${t('gantt.tooltip.navigation.viewItem')} ${data.title}`}
          >
            {t('gantt.tooltip.navigation.viewItem')}
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Arrow tooltip content
// ---------------------------------------------------------------------------

function HouseholdItemTooltipContent({
  data,
  isTouchDevice,
  onNavigate,
}: {
  data: GanttTooltipHouseholdItemData;
  isTouchDevice?: boolean;
  onNavigate?: (itemId: string) => void;
}) {
  const { t } = useTranslation('schedule');
  const { formatDate } = useFormatters();

  const { purchase: purchaseVariants } = useStatusBadgeVariants();

  return (
    <>
      {/* Header: name + status chip */}
      <div className={styles.header}>
        <span className={styles.title}>{data.name}</span>
        <span className={`${styles.statusBadge} ${purchaseVariants[data.status].className}`}>
          {purchaseVariants[data.status].label}
        </span>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      {/* Area */}
      {data.areaName && (
        <div className={styles.detailRow} data-testid="gantt-tooltip-area">
          <span className={styles.detailLabel}>{t('gantt.tooltip.householdItem.areaLabel')}</span>
          <span className={styles.detailValue}>{data.areaName}</span>
        </div>
      )}

      {/* Earliest delivery date */}
      {data.earliestDeliveryDate && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>
            {t('gantt.tooltip.householdItem.earliestLabel')}
          </span>
          <span className={styles.detailValue}>{formatDate(data.earliestDeliveryDate)}</span>
        </div>
      )}

      {/* Target delivery date */}
      {data.targetDeliveryDate && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.householdItem.targetLabel')}</span>
          <span className={styles.detailValue}>{formatDate(data.targetDeliveryDate)}</span>
        </div>
      )}

      {/* Latest delivery date */}
      {data.latestDeliveryDate && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.householdItem.latestLabel')}</span>
          <span className={styles.detailValue}>{formatDate(data.latestDeliveryDate)}</span>
        </div>
      )}

      {/* Actual delivery date */}
      {data.actualDeliveryDate && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t('gantt.tooltip.householdItem.actualLabel')}</span>
          <span className={styles.detailValue}>{formatDate(data.actualDeliveryDate)}</span>
        </div>
      )}

      {/* Floored to today note */}
      {data.isLate && (
        <div className={styles.detailRow}>
          <span className={styles.detailValueFloored}>
            {t('gantt.tooltip.householdItem.flooredToToday')}
          </span>
        </div>
      )}

      {/* Linked items section */}
      {data.linkedItems && data.linkedItems.length > 0 && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <div className={styles.linkedItemsSection}>
            <span className={styles.linkedItemsLabel}>
              {t('gantt.tooltip.householdItem.linkedItems')} ({data.linkedItems.length})
            </span>
            <ul
              className={styles.linkedItemsList}
              aria-label={t('gantt.tooltip.householdItem.linkedItems')}
            >
              {data.linkedItems.slice(0, MAX_LINKED_ITEMS_SHOWN).map((item) => (
                <li key={`${item.type}-${item.id}`} className={styles.linkedItem}>
                  {item.title}
                </li>
              ))}
              {data.linkedItems.length > MAX_LINKED_ITEMS_SHOWN && (
                <li className={styles.linkedItemsOverflow}>
                  +{data.linkedItems.length - MAX_LINKED_ITEMS_SHOWN}{' '}
                  {t('gantt.tooltip.workItem.more')}
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {/* View item link (touch devices only) */}
      {isTouchDevice && data.householdItemId && onNavigate && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <button
            type="button"
            className={styles.viewItemButton}
            onClick={() => onNavigate(data.householdItemId!)}
          >
            {t('gantt.tooltip.navigation.viewItem')}
          </button>
        </>
      )}
    </>
  );
}

function ArrowTooltipContent({ data }: { data: GanttTooltipArrowData }) {
  return (
    <div className={styles.arrowDescription} role="status">
      {data.description}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GanttTooltip renders a positioned tooltip for a hovered Gantt bar, milestone diamond,
 * or dependency arrow.
 *
 * Rendered as a portal to document.body to avoid SVG clipping issues.
 * Position is derived from mouse viewport coordinates with flip logic
 * to avoid overflowing the viewport edges.
 *
 * The `data` prop is polymorphic — set `kind: 'work-item'`, `kind: 'milestone'`,
 * or `kind: 'arrow'` to switch between tooltip layouts.
 */
export function GanttTooltip({
  data,
  position,
  id,
  isTouchDevice,
  onMilestoneNavigate,
  onHiNavigate,
}: GanttTooltipProps) {
  // Compute tooltip x/y, flipping to avoid viewport overflow
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  const heightEstimate =
    data.kind === 'work-item'
      ? estimateWorkItemTooltipHeight(data, MAX_DEPS_SHOWN)
      : TOOLTIP_HEIGHT_ESTIMATE;

  // Default: place tooltip to the left of the cursor so it doesn't cover upcoming work items
  // (Gantt chart flows left-to-right, so future items are to the right of the hovered bar).
  // Fall back to right-of-cursor if there isn't enough space on the left.
  let tooltipX = position.x - TOOLTIP_WIDTH - OFFSET_X;
  let tooltipY = position.y + OFFSET_Y;

  // Flip to the right if it would overflow the left edge
  if (tooltipX < 8) {
    tooltipX = position.x + OFFSET_X;
  }

  // Flip vertically if it would overflow the bottom edge
  if (tooltipY + heightEstimate > viewportHeight - 8) {
    tooltipY = position.y - heightEstimate - OFFSET_Y;
  }

  const content = (
    <div
      id={id}
      className={styles.tooltip}
      role="tooltip"
      style={{ left: tooltipX, top: tooltipY, width: TOOLTIP_WIDTH }}
      data-testid="gantt-tooltip"
    >
      {data.kind === 'work-item' ? (
        <WorkItemTooltipContent data={data} isTouchDevice={isTouchDevice} />
      ) : data.kind === 'milestone' ? (
        <MilestoneTooltipContent
          data={data}
          isTouchDevice={isTouchDevice}
          onMilestoneNavigate={onMilestoneNavigate}
        />
      ) : data.kind === 'household-item' ? (
        <HouseholdItemTooltipContent
          data={data}
          isTouchDevice={isTouchDevice}
          onNavigate={onHiNavigate}
        />
      ) : (
        <ArrowTooltipContent data={data} />
      )}
    </div>
  );

  return createPortal(content, document.body);
}

import type {
  DependencyType,
  ScheduleImpact,
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineResponse,
  TimelineWorkItem,
} from '@cornerstone/shared';
import type { GanttPreviewGhost } from '../../components/GanttChart/GanttChart.js';
import { addDays } from '../../lib/home/agenda.js';
import { barDates } from '../../lib/scheduleDates.js';
import { parseRowKey, rowKey } from '../../lib/scheduleView.js';
import type { ScheduleRowKey } from '../../lib/scheduleView.js';

/** What a Schedule row stands for, with its timeline record. */
export type ScheduleSubject =
  | { readonly kind: 'task'; readonly item: TimelineWorkItem }
  | { readonly kind: 'milestone'; readonly item: TimelineMilestone }
  | { readonly kind: 'purchase'; readonly item: TimelineHouseholdItem };

/** How a related row is worded; the component turns it into a translated sentence. */
export type RelationLabel =
  | {
      readonly kind: 'dependency';
      readonly direction: 'waitsFor' | 'holdsUp';
      readonly dependencyType: DependencyType;
    }
  | {
      readonly kind:
        'milestoneGate' | 'countsToward' | 'waitingForMilestone' | 'delivery' | 'beforeDelivery';
    };

export interface ScheduleRelationRow {
  readonly rowKey: ScheduleRowKey;
  readonly subject: ScheduleSubject;
  readonly label: RelationLabel;
}

export interface ScheduleRelations {
  readonly waitsFor: readonly ScheduleRelationRow[];
  readonly holdsUp: readonly ScheduleRelationRow[];
}

/** The record behind a row key, or null when it is not in the timeline (any more). */
export function resolveScheduleSubject(
  data: TimelineResponse,
  key: ScheduleRowKey,
): ScheduleSubject | null {
  const { kind, id } = parseRowKey(key);
  if (kind === 'task') {
    const item = data.workItems.find((candidate) => candidate.id === id);
    return item ? { kind, item } : null;
  }
  if (kind === 'milestone') {
    const item = data.milestones.find((candidate) => String(candidate.id) === id);
    return item ? { kind, item } : null;
  }
  const item = data.householdItems.find((candidate) => candidate.id === id);
  return item ? { kind, item } : null;
}

export function scheduleSubjectTitle(subject: ScheduleSubject): string {
  return subject.kind === 'purchase' ? subject.item.name : subject.item.title;
}

/**
 * Waits for / Holds up lists of one row (decision D23). Records missing from the timeline are
 * skipped; every list keeps the order of the response.
 */
export function buildScheduleRelations(
  data: TimelineResponse,
  subject: ScheduleSubject,
): ScheduleRelations {
  const tasks = new Map(data.workItems.map((item) => [item.id, item]));
  const milestones = new Map(data.milestones.map((item) => [item.id, item]));
  const waitsFor: ScheduleRelationRow[] = [];
  const holdsUp: ScheduleRelationRow[] = [];

  const addTask = (list: ScheduleRelationRow[], id: string, label: RelationLabel) => {
    const item = tasks.get(id);
    if (item) list.push({ rowKey: rowKey('task', id), subject: { kind: 'task', item }, label });
  };
  const addMilestone = (list: ScheduleRelationRow[], id: number, label: RelationLabel) => {
    const item = milestones.get(id);
    if (item) {
      list.push({ rowKey: rowKey('milestone', id), subject: { kind: 'milestone', item }, label });
    }
  };
  const addPurchase = (list: ScheduleRelationRow[], item: TimelineHouseholdItem) => {
    list.push({
      rowKey: rowKey('purchase', item.id),
      subject: { kind: 'purchase', item },
      label: { kind: 'delivery' },
    });
  };
  const purchasesAfter = (type: 'work_item' | 'milestone', id: string) =>
    data.householdItems.filter((purchase) =>
      purchase.dependencyIds.some(
        (dep) => dep.predecessorType === type && dep.predecessorId === id,
      ),
    );

  if (subject.kind === 'task') {
    const id = subject.item.id;
    for (const dep of data.dependencies) {
      if (dep.successorId === id) {
        addTask(waitsFor, dep.predecessorId, {
          kind: 'dependency',
          direction: 'waitsFor',
          dependencyType: dep.dependencyType,
        });
      }
      if (dep.predecessorId === id) {
        addTask(holdsUp, dep.successorId, {
          kind: 'dependency',
          direction: 'holdsUp',
          dependencyType: dep.dependencyType,
        });
      }
    }
    for (const milestoneId of subject.item.requiredMilestoneIds ?? []) {
      addMilestone(waitsFor, milestoneId, { kind: 'milestoneGate' });
    }
    for (const milestone of data.milestones) {
      if (milestone.workItemIds.includes(id)) {
        addMilestone(holdsUp, milestone.id, { kind: 'countsToward' });
      }
    }
    for (const purchase of purchasesAfter('work_item', id)) addPurchase(holdsUp, purchase);
  } else if (subject.kind === 'milestone') {
    const id = subject.item.id;
    for (const taskId of subject.item.workItemIds) {
      addTask(waitsFor, taskId, { kind: 'countsToward' });
    }
    for (const task of data.workItems) {
      if (task.requiredMilestoneIds?.includes(id)) {
        addTask(holdsUp, task.id, { kind: 'waitingForMilestone' });
      }
    }
    for (const purchase of purchasesAfter('milestone', String(id))) addPurchase(holdsUp, purchase);
  } else {
    for (const dep of subject.item.dependencyIds) {
      if (dep.predecessorType === 'work_item') {
        addTask(waitsFor, dep.predecessorId, { kind: 'beforeDelivery' });
      } else {
        addMilestone(waitsFor, Number(dep.predecessorId), { kind: 'beforeDelivery' });
      }
    }
  }

  return { waitsFor, holdsUp };
}

/**
 * Chart ghosts of a Reschedule preview: the edited task, the tasks that move with it and the
 * milestones whose projected date changes. Records missing from the timeline are skipped.
 */
export function buildPreviewGhosts(
  data: TimelineResponse,
  task: Pick<
    TimelineWorkItem,
    'id' | 'actualStartDate' | 'actualEndDate' | 'projectedStartDate' | 'projectedEndDate'
  >,
  newEnd: string,
  impact: ScheduleImpact,
): GanttPreviewGhost[] {
  const ghosts: GanttPreviewGhost[] = [
    { rowKey: rowKey('task', task.id), start: barDates(task).start, end: newEnd },
  ];
  for (const moved of impact.movedItems) {
    const item = data.workItems.find((candidate) => candidate.id === moved.workItemId);
    if (!item) continue;
    const barStart = barDates(item).start;
    ghosts.push({
      rowKey: rowKey('task', moved.workItemId),
      start: item.actualStartDate ?? (barStart ? addDays(barStart, moved.deltaDays) : null),
      end: moved.newEndDate,
    });
  }
  for (const milestone of impact.milestones) {
    ghosts.push({
      rowKey: rowKey('milestone', milestone.milestoneId),
      start: null,
      end: milestone.newProjectedDate,
    });
  }
  return ghosts;
}

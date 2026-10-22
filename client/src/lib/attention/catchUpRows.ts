import { attentionRowKey } from '@cornerstone/shared';
import type { AttentionResponse, AttentionRow } from '@cornerstone/shared';

/**
 * The rows of the catch-up dialog: every late task, in `rows` order. An N2 group is expanded into
 * one synthesized row per member so each task gets Start and Reschedule. Snoozed rows are left out.
 */
export function catchUpRows(data: AttentionResponse): AttentionRow[] {
  const result: AttentionRow[] = [];
  for (const row of data.rows) {
    if (row.snoozedUntil !== null) continue;
    if (row.params.rule === 'N1') {
      result.push(row);
    } else if (row.params.rule === 'N2' && row.params.kind === 'task') {
      result.push(row);
    } else if (row.params.rule === 'N2' && row.params.kind === 'group') {
      const groupDate = row.params.plannedStartDate;
      for (const item of row.params.items) {
        result.push({
          key: attentionRowKey('N2', 'work_item', item.id),
          rule: 'N2',
          tier: 'late',
          severity: 'red',
          subject: { type: 'work_item', id: item.id, label: item.label, area: item.area },
          date: groupDate,
          amount: null,
          holdsUp: item.holdsUp,
          params: {
            rule: 'N2',
            kind: 'task',
            plannedStartDate: groupDate,
            projectedStartDate: null,
            daysLate: item.daysLate,
            companyName: null,
          },
          actions: ['start', 'reschedule'],
          link: { route: 'workItem', params: { id: item.id }, query: {} },
          snoozedUntil: null,
        });
      }
    }
  }
  return result;
}

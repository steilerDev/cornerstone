import { createHash } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import ical from 'ical-generator';
import type { TimelineResponse } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes> & { $client: Database.Database };

/**
 * Format a date string to YYYY-MM-DD if it's longer (e.g., ISO datetime).
 */
export function toDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return dateStr.slice(0, 10);
}

/**
 * Compute an ETag by SHA256 hashing concatenated parts.
 */
export function computeETag(parts: (string | null | undefined)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part ?? '');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Compute the ETag for the calendar (based on max updated_at across work_items, milestones, household_items).
 */
export function computeCalendarETag(db: DbType): string {
  const maxUpdatedRow = db.$client
    .prepare(
      `
    SELECT MAX(max_updated) as m FROM (
      SELECT MAX(updated_at) as max_updated FROM work_items
      UNION ALL
      SELECT MAX(updated_at) as max_updated FROM milestones
      UNION ALL
      SELECT MAX(updated_at) as max_updated FROM household_items
    )
  `,
    )
    .get() as { m: string | null };

  return computeETag([maxUpdatedRow.m]);
}

/**
 * Optional description map for enriching events with descriptions/notes.
 * Keyed by event UID prefix and ID (e.g., 'wi-abc123', 'milestone-1', 'hi-xyz').
 */
export type DescriptionMap = Map<string, string>;

/**
 * Build an iCal calendar from timeline data.
 * Optionally pass a descriptionMap to include DESCRIPTION fields on events.
 * Optionally pass a baseUrl to include URL fields linking back to the web UI.
 */
export function buildCalendar(
  timeline: Pick<TimelineResponse, 'workItems' | 'milestones' | 'householdItems'>,
  descriptionMap?: DescriptionMap,
  baseUrl?: string,
): string {
  const calendar = ical({
    name: 'Cornerstone Project',
    prodId: '//Cornerstone//Project Calendar//EN',
  });

  // Add work items as events
  for (const wi of timeline.workItems) {
    const startDate = wi.actualStartDate ?? wi.startDate;
    const endDate = wi.actualEndDate ?? wi.endDate;

    // Skip if neither resolved date is available
    if (!startDate || !endDate) continue;

    const wiDesc = descriptionMap?.get(`wi-${wi.id}`);
    calendar.createEvent({
      id: `wi-${wi.id}@cornerstone`,
      summary: wi.title,
      description: wiDesc || undefined,
      url: baseUrl ? `${baseUrl}/project/work-items/${wi.id}` : undefined,
      start: new Date(startDate),
      end: new Date(endDate),
      allDay: true,
    });
  }

  // Add milestones as single-day all-day events
  for (const milestone of timeline.milestones) {
    const eventDate = milestone.completedAt
      ? toDateOnly(milestone.completedAt)
      : milestone.targetDate;

    if (!eventDate) continue;

    const msDesc = descriptionMap?.get(`milestone-${milestone.id}`);
    calendar.createEvent({
      id: `milestone-${milestone.id}@cornerstone`,
      summary: milestone.title,
      description: msDesc || undefined,
      url: baseUrl ? `${baseUrl}/project/milestones/${milestone.id}` : undefined,
      start: new Date(eventDate),
      end: new Date(eventDate),
      allDay: true,
    });
  }

  // Add household items as delivery events
  for (const hi of timeline.householdItems) {
    let startDate: string | null = null;
    let endDate: string | null = null;

    // Prefer actual delivery date if set
    if (hi.actualDeliveryDate) {
      startDate = toDateOnly(hi.actualDeliveryDate);
      endDate = startDate;
    } else {
      // Use earliest/latest delivery date range, or target if those aren't set
      startDate = hi.earliestDeliveryDate ?? hi.targetDeliveryDate;
      endDate = hi.latestDeliveryDate ?? hi.targetDeliveryDate;
    }

    // Skip if no delivery dates are available
    if (!startDate || !endDate) continue;

    const hiDesc = descriptionMap?.get(`hi-${hi.id}`);
    calendar.createEvent({
      id: `hi-${hi.id}@cornerstone`,
      summary: `${hi.name} (Delivery)`,
      description: hiDesc || undefined,
      url: baseUrl ? `${baseUrl}/project/household-items/${hi.id}` : undefined,
      start: new Date(startDate),
      end: new Date(endDate),
      allDay: true,
    });
  }

  return calendar.toString();
}

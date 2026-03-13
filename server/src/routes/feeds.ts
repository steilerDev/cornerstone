/**
 * Feed routes — CalDAV (.ics) and CardDAV (.vcf) endpoints
 * Anonymous access — no authentication required
 * EPIC-17 Story #747: CalDAV/CardDAV Feed Endpoints
 */

import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import ical from 'ical-generator';
// vcard-creator is CJS — default import gives the module namespace, class is at .default
import VCardModule from 'vcard-creator';
const VCardCreator = (VCardModule as unknown as { default: typeof VCardModule }).default ?? VCardModule;
import { getTimeline } from '../services/timelineService.js';
import { ensureDailyReschedule } from '../services/schedulingEngine.js';
import { vendors } from '../db/schema.js';

/**
 * Compute an ETag by SHA256 hashing concatenated parts
 */
function computeETag(parts: (string | null | undefined)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part ?? '');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Format a date string to YYYY-MM-DD if it's longer (e.g., ISO datetime)
 */
function toDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return dateStr.slice(0, 10);
}

export default async function feedsRoutes(fastify: FastifyInstance) {
  /**
   * GET /feeds/cal.ics
   * CalDAV endpoint — returns iCal format with work items, milestones, and household items
   * Anonymous access (no auth required)
   * ETag support for conditional requests (304 Not Modified)
   */
  fastify.get('/cal.ics', async (request, reply) => {
    // Ensure daily reschedule is run
    ensureDailyReschedule(fastify.db);

    // Fetch timeline data
    const timeline = getTimeline(fastify.db);

    // Compute ETag from MAX(updated_at) of work_items, milestones, and household_items
    const maxUpdatedRow = fastify.db.$client.prepare(`
      SELECT MAX(max_updated) as m FROM (
        SELECT MAX(updated_at) as max_updated FROM work_items
        UNION ALL
        SELECT MAX(updated_at) as max_updated FROM milestones
        UNION ALL
        SELECT MAX(updated_at) as max_updated FROM household_items
      )
    `).get() as { m: string | null };

    const etag = computeETag([maxUpdatedRow.m]);

    // Check If-None-Match header for conditional request
    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send();
    }

    // Build iCal calendar
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

      calendar.createEvent({
        id: `wi-${wi.id}@cornerstone`,
        summary: wi.title,
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

      calendar.createEvent({
        id: `milestone-${milestone.id}@cornerstone`,
        summary: milestone.title,
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

      calendar.createEvent({
        id: `hi-${hi.id}@cornerstone`,
        summary: `${hi.name} (Delivery)`,
        start: new Date(startDate),
        end: new Date(endDate),
        allDay: true,
      });
    }

    // Return iCal with appropriate headers
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .header('ETag', etag)
      .send(calendar.toString());
  });

  /**
   * GET /feeds/contacts.vcf
   * CardDAV endpoint — returns vCard format with all vendors
   * Anonymous access (no auth required)
   * ETag support for conditional requests (304 Not Modified)
   */
  fastify.get('/contacts.vcf', async (request, reply) => {
    // Fetch all vendors
    const allVendors = fastify.db.select().from(vendors).all();

    // Compute ETag from MAX(updated_at) of vendors
    const maxUpdatedRow = fastify.db.$client.prepare(
      'SELECT MAX(updated_at) as m FROM vendors',
    ).get() as { m: string | null };

    const etag = computeETag([maxUpdatedRow.m]);

    // Check If-None-Match header for conditional request
    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send();
    }

    // Build vCard file by concatenating individual vCards
    const vcards: string[] = [];

    for (const vendor of allVendors) {
      const vcard = new VCardCreator();
      vcard.addName('', vendor.name);

      if (vendor.email) {
        vcard.addEmail(vendor.email);
      }

      if (vendor.phone) {
        vcard.addPhoneNumber(vendor.phone as unknown as number, 'WORK');
      }

      if (vendor.address) {
        vcard.addAddress('', '', vendor.address, '', '', '', '');
      }

      if (vendor.specialty) {
        vcard.addJobtitle(vendor.specialty);
      }

      if (vendor.notes) {
        vcard.addNote(vendor.notes);
      }

      // Convert vcard to string (vcard-creator uses .toString() or .getOutput())
      vcards.push(vcard.toString());
    }

    const vcfContent = vcards.join('\n');

    // Return vCard with appropriate headers
    return reply
      .header('Content-Type', 'text/vcard; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .header('ETag', etag)
      .send(vcfContent);
  });
}

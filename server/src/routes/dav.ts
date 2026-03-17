import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { UnauthorizedError, NotFoundError } from '../errors/AppError.js';
import * as davTokenService from '../services/davTokenService.js';
import * as calendarIcal from '../services/calendarIcal.js';
import * as vendorVcard from '../services/vendorVcard.js';
import * as davXml from '../services/davXml.js';
import { escapeXml } from '../services/davXml.js';
import { getTimeline } from '../services/timelineService.js';
import { ensureDailyReschedule } from '../services/schedulingEngine.js';
import { vendors, vendorContacts } from '../db/schema.js';

/**
 * DAV preHandler: validate Basic Auth using DAV token.
 */
async function davAuth(request: any): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    throw new UnauthorizedError('Authorization header required');
  }

  const match = authHeader.match(/^Basic\s+(.+)$/);
  if (!match) {
    throw new UnauthorizedError('Invalid Authorization header format');
  }

  const encoded = match[1];
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    throw new UnauthorizedError('Invalid Base64 in Authorization header');
  }

  // Expect format: username:token
  const [, token] = decoded.split(':');
  if (!token) {
    throw new UnauthorizedError('Invalid credentials format');
  }

  const validated = davTokenService.validateToken(request.server.db, token);
  if (!validated) {
    throw new UnauthorizedError('Invalid DAV token');
  }

  // Attach to request for later use
  (request as any).davUser = validated;
}

export default async function davRoutes(fastify: FastifyInstance) {
  // ─── OPTIONS (DAV capabilities) ──────────────────────────────────────────

  /**
   * OPTIONS /*
   * Advertise DAV capabilities.
   */
  fastify.options<{ Params: { wildcard?: string } }>(
    '/*',
    async (request, reply) => {
      return reply
        .header('DAV', '1, 2, 3, calendar-access, addressbook')
        .header('Allow', 'OPTIONS, GET, HEAD, PROPFIND, REPORT, PUT, DELETE, POST')
        .status(200)
        .send();
    },
  );

  // ─── PROPFIND: Root ──────────────────────────────────────────────────────

  /**
   * PROPFIND /
   * Root collection: lists calendars and addressbooks.
   */
  fastify.propfind<{ Body: string }>(
    '/',
    { preHandler: davAuth },
    async (request, reply) => {
      const depth = davXml.parseDepth(request.headers as any);

      if (depth === 0) {
        // Return root collection properties only
        const rootProps = davXml.propstat(`<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Cornerstone</D:displayname>`);

        const resp = davXml.response('/', rootProps);
        return reply
          .type('application/xml; charset=utf-8')
          .status(207)
          .send(davXml.multistatus([resp]));
      }

      // depth >= 1: return root + children
      const responses: string[] = [];

      // Root
      responses.push(
        davXml.response(
          '/',
          davXml.propstat(
            `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Cornerstone</D:displayname>`,
          ),
        ),
      );

      // Children: principals, calendars, addressbooks
      responses.push(
        davXml.response(
          '/principals/',
          davXml.propstat(
            `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Principals</D:displayname>`,
          ),
        ),
      );
      responses.push(
        davXml.response(
          '/calendars/',
          davXml.propstat(
            `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Calendars</D:displayname>`,
          ),
        ),
      );
      responses.push(
        davXml.response(
          '/addressbooks/',
          davXml.propstat(
            `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Address Books</D:displayname>`,
          ),
        ),
      );

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus(responses));
    },
  );

  // ─── PROPFIND: Principal ────────────────────────────────────────────────

  /**
   * PROPFIND /principals/default/
   * User principal (for CalDAV/CardDAV discovery).
   */
  fastify.propfind<{ Body: string }>(
    '/principals/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const href = '/principals/default/';
      const props = `<D:resourcetype><D:principal/></D:resourcetype>
<D:displayname>${(request as any).davUser.email}</D:displayname>
<D:principal-URL><D:href>${href}</D:href></D:principal-URL>
<C:calendar-home-set xmlns:C="urn:ietf:params:xml:ns:caldav"><D:href>/calendars/default/</D:href></C:calendar-home-set>
<A:addressbook-home-set xmlns:A="urn:ietf:params:xml:ns:carddav"><D:href>/addressbooks/default/</D:href></A:addressbook-home-set>`;

      const resp = davXml.response(href, davXml.propstat(props));
      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus([resp]));
    },
  );

  // ─── PROPFIND: Calendar Collection ──────────────────────────────────────

  /**
   * PROPFIND /calendars/default/
   * Calendar collection: lists calendar events.
   */
  fastify.propfind<{ Body: string }>(
    '/calendars/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const depth = davXml.parseDepth(request.headers as any);
      const etag = calendarIcal.computeCalendarETag(fastify.db);

      ensureDailyReschedule(fastify.db);
      const timeline = getTimeline(fastify.db);

      const responses: string[] = [];

      // Collection itself
      responses.push(
        davXml.response(
          '/calendars/default/',
          davXml.propstat(davXml.CALENDAR_COLLECTION_PROPS.replace('"calendar-etag"', `"${etag}"`)),
        ),
      );

      if (depth !== 0) {
        // depth 1: list all event hrefs
        for (const wi of timeline.workItems as any[]) {
          if (!wi.startDate || !wi.endDate) continue;
          const href = `/calendars/default/wi-${wi.id}.ics`;
          const props = `<D:getetag>"wi-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(wi.title)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }

        for (const milestone of timeline.milestones as any[]) {
          if (!milestone.targetDate && !milestone.completedAt) continue;
          const href = `/calendars/default/milestone-${milestone.id}.ics`;
          const props = `<D:getetag>"milestone-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(milestone.title)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }

        for (const hi of timeline.householdItems as any[]) {
          if (!hi.targetDeliveryDate && !hi.actualDeliveryDate) continue;
          const href = `/calendars/default/hi-${hi.id}.ics`;
          const props = `<D:getetag>"hi-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(hi.name)} (Delivery)</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }
      }

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus(responses));
    },
  );

  // ─── GET: Calendar Event (.ics) ──────────────────────────────────────────

  /**
   * GET /calendars/default/:uid.ics
   * Fetch a single calendar event (work item, milestone, or household item).
   */
  fastify.get<{ Params: { uid: string } }>(
    '/calendars/default/:uid.ics',
    { preHandler: davAuth },
    async (request, reply) => {
      const uid = request.params.uid;
      const match = uid.match(/^(wi|milestone|hi)-(.+)$/);

      if (!match) {
        throw new NotFoundError('Event not found');
      }

      const [, type, id] = match;
      ensureDailyReschedule(fastify.db);
      const timeline = getTimeline(fastify.db);

      let event: any = null;

      if (type === 'wi') {
        event = timeline.workItems.find((wi: any) => wi.id === id);
      } else if (type === 'milestone') {
        event = timeline.milestones.find((m: any) => String(m.id) === id);
      } else if (type === 'hi') {
        event = timeline.householdItems.find((hi: any) => hi.id === id);
      }

      if (!event) {
        throw new NotFoundError('Event not found');
      }

      // Build single-event iCal
      const calendar = calendarIcal.buildCalendar({
        workItems: type === 'wi' ? [event] : [],
        milestones: type === 'milestone' ? [event] : [],
        householdItems: type === 'hi' ? [event] : [],
      });

      const etag = calendarIcal.computeCalendarETag(fastify.db);
      return reply
        .type('text/calendar; charset=utf-8')
        .header('ETag', `"${etag}"`)
        .send(calendar);
    },
  );

  // ─── REPORT: calendar-multiget ──────────────────────────────────────────

  /**
   * REPORT /calendars/default/
   * calendar-multiget: fetch multiple calendar events in one request.
   */
  fastify.report<{ Body: string }>(
    '/calendars/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const body = request.body;
      const hrefs = davXml.parseReportHrefs(body);

      if (hrefs.length === 0) {
        return reply
          .type('application/xml; charset=utf-8')
          .status(207)
          .send(davXml.multistatus([]));
      }

      ensureDailyReschedule(fastify.db);
      const timeline = getTimeline(fastify.db);
      const etag = calendarIcal.computeCalendarETag(fastify.db);
      const responses: string[] = [];

      for (const href of hrefs) {
        // Parse href like /calendars/default/wi-xxx.ics
        const match = href.match(/\/calendars\/default\/([^/]+)\.ics$/);
        if (!match) continue;

        const uid = match[1];
        const typeMatch = uid.match(/^(wi|milestone|hi)-(.+)$/);
        if (!typeMatch) continue;

        const [, type, id] = typeMatch;
        let event: any = null;

        if (type === 'wi') {
          event = (timeline.workItems as any[]).find((wi: any) => wi.id === id);
        } else if (type === 'milestone') {
          event = (timeline.milestones as any[]).find((m: any) => String(m.id) === id);
        } else if (type === 'hi') {
          event = (timeline.householdItems as any[]).find((hi: any) => hi.id === id);
        }

        if (!event) {
          // Not found: return 404 propstat
          const notFoundProps = davXml.propstatNotFound(['getetag']);
          responses.push(davXml.response(href, notFoundProps));
          continue;
        }

        // Build single-event iCal
        const calendar = calendarIcal.buildCalendar({
          workItems: type === 'wi' ? [event] : [],
          milestones: type === 'milestone' ? [event] : [],
          householdItems: type === 'hi' ? [event] : [],
        });

        const props = `<D:getetag>"${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(event.title || event.name)}</D:displayname>
<D:getcontentlength>${calendar.length}</D:getcontentlength>
<D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>
<C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav">${escapeXml(calendar)}</C:calendar-data>`;

        const propstat = davXml.propstat(props);
        responses.push(davXml.response(href, propstat));
      }

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus(responses));
    },
  );

  // ─── PROPFIND: Address Book Collection ──────────────────────────────────

  /**
   * PROPFIND /addressbooks/default/
   * Address book collection: lists vendor vCards.
   */
  fastify.propfind<{ Body: string }>(
    '/addressbooks/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const depth = davXml.parseDepth(request.headers as any);
      const etag = vendorVcard.computeAddressBookETag(fastify.db);

      const responses: string[] = [];

      // Collection itself
      responses.push(
        davXml.response(
          '/addressbooks/default/',
          davXml.propstat(davXml.ADDRESSBOOK_COLLECTION_PROPS.replace('"addressbook-etag"', `"${etag}"`)),
        ),
      );

      if (depth !== 0) {
        // depth 1: list all vendor + contact hrefs
        const allVendors = fastify.db.select().from(vendors).all();

        for (const vendor of allVendors as any[]) {
          const href = `/addressbooks/default/vendor-${vendor.id}.vcf`;
          const props = `<D:getetag>"vendor-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(vendor.name)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }

        // Also list all contacts
        const allContacts = fastify.db.select().from(vendorContacts).all();
        for (const contact of allContacts as any[]) {
          const vendor = (allVendors as any[]).find((v: any) => v.id === contact.vendorId);
          const href = `/addressbooks/default/contact-${contact.id}.vcf`;
          const props = `<D:getetag>"contact-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(contact.name)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }
      }

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus(responses));
    },
  );

  // ─── GET: Address Book vCard (.vcf) ──────────────────────────────────────

  /**
   * GET /addressbooks/default/:uid.vcf
   * Fetch a single vCard (vendor or contact).
   */
  fastify.get<{ Params: { uid: string } }>(
    '/addressbooks/default/:uid.vcf',
    { preHandler: davAuth },
    async (request, reply) => {
      const uid = request.params.uid;
      const match = uid.match(/^(vendor|contact)-(.+)$/);

      if (!match) {
        throw new NotFoundError('Contact not found');
      }

      const [, type, id] = match;
      const etag = vendorVcard.computeAddressBookETag(fastify.db);

      if (type === 'vendor') {
        const vendor = fastify.db
          .select()
          .from(vendors)
          .where(eq(vendors.id, id))
          .get();

        if (!vendor) {
          throw new NotFoundError('Vendor not found');
        }

        const vcf = vendorVcard.buildVendorVcard(vendor);
        return reply
          .type('text/vcard; charset=utf-8')
          .header('ETag', `"vendor-${etag}"`)
          .send(vcf);
      } else if (type === 'contact') {
        const contact = fastify.db
          .select()
          .from(vendorContacts)
          .where(eq(vendorContacts.id, id))
          .get();

        if (!contact) {
          throw new NotFoundError('Contact not found');
        }

        const vendor = fastify.db
          .select()
          .from(vendors)
          .where(eq(vendors.id, contact.vendorId))
          .get();

        if (!vendor) {
          throw new NotFoundError('Vendor not found');
        }

        const vcf = vendorVcard.buildContactVcard(contact, vendor.name);
        return reply
          .type('text/vcard; charset=utf-8')
          .header('ETag', `"contact-${etag}"`)
          .send(vcf);
      }

      throw new NotFoundError('Contact not found');
    },
  );

  // ─── REPORT: addressbook-multiget ───────────────────────────────────────

  /**
   * REPORT /addressbooks/default/
   * addressbook-multiget: fetch multiple vCards in one request.
   */
  fastify.report<{ Body: string }>(
    '/addressbooks/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const body = request.body;
      const hrefs = davXml.parseReportHrefs(body);

      if (hrefs.length === 0) {
        return reply
          .type('application/xml; charset=utf-8')
          .status(207)
          .send(davXml.multistatus([]));
      }

      const etag = vendorVcard.computeAddressBookETag(fastify.db);
      const responses: string[] = [];

      for (const href of hrefs) {
        // Parse href like /addressbooks/default/vendor-xxx.vcf
        const match = href.match(/\/addressbooks\/default\/([^/]+)\.vcf$/);
        if (!match) continue;

        const uid = match[1];
        const typeMatch = uid.match(/^(vendor|contact)-(.+)$/);
        if (!typeMatch) continue;

        const [, type, id] = typeMatch;
        let vcf: string | null = null;
        let displayName: string | null = null;

        if (type === 'vendor') {
          const vendor = fastify.db
            .select()
            .from(vendors)
            .where(eq(vendors.id, id))
            .get();

          if (vendor) {
            vcf = vendorVcard.buildVendorVcard(vendor);
            displayName = vendor.name;
          }
        } else if (type === 'contact') {
          const contact = fastify.db
            .select()
            .from(vendorContacts)
            .where(eq(vendorContacts.id, id))
            .get();

          if (contact) {
            const vendor = fastify.db
              .select()
              .from(vendors)
              .where(eq(vendors.id, contact.vendorId))
              .get();

            if (vendor) {
              vcf = vendorVcard.buildContactVcard(contact, vendor.name);
              displayName = contact.name;
            }
          }
        }

        if (!vcf) {
          // Not found: return 404 propstat
          const notFoundProps = davXml.propstatNotFound(['getetag']);
          responses.push(davXml.response(href, notFoundProps));
          continue;
        }

        const props = `<D:getetag>"${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(displayName || '')}</D:displayname>
<D:getcontentlength>${vcf.length}</D:getcontentlength>
<D:getcontenttype>text/vcard; charset=utf-8</D:getcontenttype>
<A:address-data xmlns:A="urn:ietf:params:xml:ns:carddav">${escapeXml(vcf)}</A:address-data>`;

        const propstat = davXml.propstat(props);
        responses.push(davXml.response(href, propstat));
      }

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus(responses));
    },
  );
}

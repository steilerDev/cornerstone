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

const DAV_PREFIX = '/dav';

export default async function davRoutes(fastify: FastifyInstance) {
  // ─── WWW-Authenticate on 401 (RFC 7235 — required for iOS) ──────────────

  fastify.addHook('onError', async (_request, reply, error) => {
    if ((error as any).statusCode === 401) {
      reply.header('WWW-Authenticate', 'Basic realm="Cornerstone DAV"');
    }
  });

  // ─── Debug logging for DAV request bodies ────────────────────────────────

  fastify.addHook('onRequest', async (request) => {
    const method = request.method;
    if (method === 'PROPFIND' || method === 'REPORT' || method === 'PROPPATCH') {
      request.log.debug({ method, url: request.url, body: request.body }, 'DAV request body');
    }
  });

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
        .header('Allow', 'OPTIONS, GET, HEAD, PROPFIND, REPORT, PROPPATCH, PUT, DELETE, POST')
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

      const rootProps = `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Cornerstone</D:displayname>
<D:current-user-principal><D:href>${DAV_PREFIX}/principals/default/</D:href></D:current-user-principal>`;

      if (depth === 0) {
        // Return root collection properties only
        const resp = davXml.response(`${DAV_PREFIX}/`, davXml.propstat(rootProps));
        return reply
          .type('application/xml; charset=utf-8')
          .status(207)
          .send(davXml.multistatus([resp]));
      }

      // depth >= 1: return root + children
      const responses: string[] = [];

      // Root
      responses.push(davXml.response(`${DAV_PREFIX}/`, davXml.propstat(rootProps)));

      // Children: principals, calendars, addressbooks
      responses.push(
        davXml.response(
          `${DAV_PREFIX}/principals/`,
          davXml.propstat(
            `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Principals</D:displayname>`,
          ),
        ),
      );
      responses.push(
        davXml.response(
          `${DAV_PREFIX}/calendars/`,
          davXml.propstat(
            `<D:resourcetype><D:collection/></D:resourcetype>
<D:displayname>Calendars</D:displayname>`,
          ),
        ),
      );
      responses.push(
        davXml.response(
          `${DAV_PREFIX}/addressbooks/`,
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
      const href = `${DAV_PREFIX}/principals/default/`;
      const props = `<D:resourcetype><D:principal/></D:resourcetype>
<D:displayname>${(request as any).davUser.email}</D:displayname>
<D:principal-URL><D:href>${href}</D:href></D:principal-URL>
<C:calendar-home-set><D:href>${DAV_PREFIX}/calendars/default/</D:href></C:calendar-home-set>
<A:addressbook-home-set><D:href>${DAV_PREFIX}/addressbooks/default/</D:href></A:addressbook-home-set>`;

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
          `${DAV_PREFIX}/calendars/default/`,
          davXml.propstat(davXml.CALENDAR_COLLECTION_PROPS.replace(/"calendar-etag"/g, `"${etag}"`)),
        ),
      );

      if (depth !== 0) {
        // depth 1: list all event hrefs
        for (const wi of timeline.workItems as any[]) {
          if (!wi.startDate || !wi.endDate) continue;
          const href = `${DAV_PREFIX}/calendars/default/wi-${wi.id}.ics`;
          const props = `<D:getetag>"wi-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(wi.title)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }

        for (const milestone of timeline.milestones as any[]) {
          if (!milestone.targetDate && !milestone.completedAt) continue;
          const href = `${DAV_PREFIX}/calendars/default/milestone-${milestone.id}.ics`;
          const props = `<D:getetag>"milestone-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(milestone.title)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }

        for (const hi of timeline.householdItems as any[]) {
          if (!hi.targetDeliveryDate && !hi.actualDeliveryDate) continue;
          const href = `${DAV_PREFIX}/calendars/default/hi-${hi.id}.ics`;
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
        .header('ETag', `"${type}-${etag}"`)
        .send(calendar);
    },
  );

  // ─── REPORT: calendar-multiget / calendar-query ────────────────────────

  /**
   * Helper: build a calendar event response for REPORT results.
   */
  function buildCalendarEventResponse(
    href: string,
    type: string,
    event: any,
    etag: string,
  ): string {
    const calendar = calendarIcal.buildCalendar({
      workItems: type === 'wi' ? [event] : [],
      milestones: type === 'milestone' ? [event] : [],
      householdItems: type === 'hi' ? [event] : [],
    });

    // Use type-prefixed ETag to match PROPFIND depth 1 responses
    const typedEtag = `${type}-${etag}`;
    const props = `<D:getetag>"${typedEtag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(event.title || event.name)}</D:displayname>
<D:getcontentlength>${calendar.length}</D:getcontentlength>
<D:getcontenttype>text/calendar; charset=utf-8</D:getcontenttype>
<C:calendar-data>${escapeXml(calendar)}</C:calendar-data>`;

    return davXml.response(href, davXml.propstat(props));
  }

  /**
   * REPORT /calendars/default/
   * Handles calendar-multiget (fetch by href) and calendar-query (return all matching).
   */
  fastify.report<{ Body: string }>(
    '/calendars/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const body = request.body;
      const reportType = davXml.detectReportType(body);

      ensureDailyReschedule(fastify.db);
      const timeline = getTimeline(fastify.db);
      const etag = calendarIcal.computeCalendarETag(fastify.db);
      const responses: string[] = [];

      if (reportType === 'query') {
        // calendar-query: return all events (read-only calendar, no filtering needed)
        for (const wi of timeline.workItems as any[]) {
          if (!wi.startDate || !wi.endDate) continue;
          const href = `${DAV_PREFIX}/calendars/default/wi-${wi.id}.ics`;
          responses.push(buildCalendarEventResponse(href, 'wi', wi, etag));
        }

        for (const milestone of timeline.milestones as any[]) {
          if (!milestone.targetDate && !milestone.completedAt) continue;
          const href = `${DAV_PREFIX}/calendars/default/milestone-${milestone.id}.ics`;
          responses.push(buildCalendarEventResponse(href, 'milestone', milestone, etag));
        }

        for (const hi of timeline.householdItems as any[]) {
          if (!hi.targetDeliveryDate && !hi.actualDeliveryDate) continue;
          const href = `${DAV_PREFIX}/calendars/default/hi-${hi.id}.ics`;
          responses.push(buildCalendarEventResponse(href, 'hi', hi, etag));
        }
      } else {
        // calendar-multiget: fetch specific events by href
        const hrefs = davXml.parseReportHrefs(body);

        for (const href of hrefs) {
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
            const notFoundProps = davXml.propstatNotFound(['getetag']);
            responses.push(davXml.response(href, notFoundProps));
            continue;
          }

          responses.push(buildCalendarEventResponse(href, type, event, etag));
        }
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
          `${DAV_PREFIX}/addressbooks/default/`,
          davXml.propstat(davXml.ADDRESSBOOK_COLLECTION_PROPS.replace(/"addressbook-etag"/g, `"${etag}"`)),
        ),
      );

      if (depth !== 0) {
        // depth 1: list all vendor + contact hrefs
        const allVendors = fastify.db.select().from(vendors).all();

        for (const vendor of allVendors as any[]) {
          const href = `${DAV_PREFIX}/addressbooks/default/vendor-${vendor.id}.vcf`;
          const props = `<D:getetag>"vendor-${etag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(vendor.name)}</D:displayname>`;
          responses.push(davXml.response(href, davXml.propstat(props)));
        }

        // Also list all contacts
        const allContacts = fastify.db.select().from(vendorContacts).all();
        for (const contact of allContacts as any[]) {
          const vendor = (allVendors as any[]).find((v: any) => v.id === contact.vendorId);
          const href = `${DAV_PREFIX}/addressbooks/default/contact-${contact.id}.vcf`;
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

  // ─── REPORT: addressbook-multiget / addressbook-query ──────────────────

  /**
   * Helper: build a vCard response for REPORT results.
   */
  function buildVcardResponse(
    href: string,
    type: string,
    vcf: string,
    displayName: string,
    etag: string,
  ): string {
    // Use type-prefixed ETag to match PROPFIND depth 1 responses
    const typedEtag = `${type}-${etag}`;
    const props = `<D:getetag>"${typedEtag}"</D:getetag>
<D:resourcetype/>
<D:displayname>${escapeXml(displayName)}</D:displayname>
<D:getcontentlength>${vcf.length}</D:getcontentlength>
<D:getcontenttype>text/vcard; charset=utf-8</D:getcontenttype>
<A:address-data>${escapeXml(vcf)}</A:address-data>`;

    return davXml.response(href, davXml.propstat(props));
  }

  /**
   * REPORT /addressbooks/default/
   * Handles addressbook-multiget (fetch by href) and addressbook-query (return all).
   */
  fastify.report<{ Body: string }>(
    '/addressbooks/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const body = request.body;
      const reportType = davXml.detectReportType(body);

      const etag = vendorVcard.computeAddressBookETag(fastify.db);
      const responses: string[] = [];

      if (reportType === 'query') {
        // addressbook-query: return all contacts (read-only address book)
        const allVendors = fastify.db.select().from(vendors).all();

        for (const vendor of allVendors as any[]) {
          const href = `${DAV_PREFIX}/addressbooks/default/vendor-${vendor.id}.vcf`;
          const vcf = vendorVcard.buildVendorVcard(vendor);
          responses.push(buildVcardResponse(href, 'vendor', vcf, vendor.name, etag));
        }

        const allContacts = fastify.db.select().from(vendorContacts).all();
        for (const contact of allContacts as any[]) {
          const vendor = (allVendors as any[]).find((v: any) => v.id === contact.vendorId);
          if (!vendor) continue;
          const href = `${DAV_PREFIX}/addressbooks/default/contact-${contact.id}.vcf`;
          const vcf = vendorVcard.buildContactVcard(contact, vendor.name);
          responses.push(buildVcardResponse(href, 'contact', vcf, contact.name, etag));
        }
      } else {
        // addressbook-multiget: fetch specific contacts by href
        const hrefs = davXml.parseReportHrefs(body);

        for (const href of hrefs) {
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
            const notFoundProps = davXml.propstatNotFound(['getetag']);
            responses.push(davXml.response(href, notFoundProps));
            continue;
          }

          responses.push(buildVcardResponse(href, type, vcf, displayName || '', etag));
        }
      }

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus(responses));
    },
  );

  // ─── PROPPATCH: Calendar & Address Book Collections ─────────────────────

  /**
   * Parse property names from a PROPPATCH body.
   * Returns the prop names that iOS is trying to set.
   */
  function parsePropPatchProps(body: string): string[] {
    const props: string[] = [];
    // Match <D:set><D:prop>...</D:prop></D:set> sections
    const setPropMatch = body.match(/<(?:[a-z]+:)?set[^>]*>[\s\S]*?<(?:[a-z]+:)?prop[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?prop>/gi);
    if (setPropMatch) {
      for (const section of setPropMatch) {
        const innerMatch = section.match(/<(?:[a-z]+:)?prop[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?prop>/i);
        if (innerMatch) {
          // Extract all top-level element names from the prop section
          const tagMatches = innerMatch[1].matchAll(/<([a-z]+:)?([a-z][-a-z]*)[^>]*(?:\/>|>[\s\S]*?<\/\1?\2>)/gi);
          for (const m of tagMatches) {
            props.push(`<${m[1] || 'D:'}${m[2]}/>`);
          }
        }
      }
    }
    return props;
  }

  /**
   * PROPPATCH /calendars/default/ and /addressbooks/default/
   * iOS sends PROPPATCH to set calendar color, display name, alerts, etc.
   * Since we're read-only, we acknowledge all props as "set successfully" (200 OK propstat).
   */
  fastify.proppatch<{ Body: string }>(
    '/calendars/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const body = request.body || '';
      const props = parsePropPatchProps(body);

      // If we couldn't parse any props, return a generic acknowledgment
      const propXml = props.length > 0 ? props.join('\n') : '<D:displayname/>';

      const resp = davXml.response(
        `${DAV_PREFIX}/calendars/default/`,
        davXml.propstat(propXml),
      );

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus([resp]));
    },
  );

  fastify.proppatch<{ Body: string }>(
    '/addressbooks/default/',
    { preHandler: davAuth },
    async (request, reply) => {
      const body = request.body || '';
      const props = parsePropPatchProps(body);

      const propXml = props.length > 0 ? props.join('\n') : '<D:displayname/>';

      const resp = davXml.response(
        `${DAV_PREFIX}/addressbooks/default/`,
        davXml.propstat(propXml),
      );

      return reply
        .type('application/xml; charset=utf-8')
        .status(207)
        .send(davXml.multistatus([resp]));
    },
  );
}

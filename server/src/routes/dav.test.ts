import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as davTokenService from '../services/davTokenService.js';
import { workItems, vendors } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';

describe('DAV Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-dav-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function createUserWithToken(email = 'dav@test.com'): Promise<{
    userId: string;
    token: string;
    cookie: string;
    basicAuth: string;
  }> {
    const user = await userService.createLocalUser(app.db, email, 'DAV User', 'password', 'member');
    const token = davTokenService.generateToken(app.db, user.id);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    // Basic Auth: base64(anyUsername:token)
    const credentials = Buffer.from(`dav-user:${token}`).toString('base64');
    return {
      userId: user.id,
      token,
      cookie: `cornerstone_session=${sessionToken}`,
      basicAuth: `Basic ${credentials}`,
    };
  }

  let offset = 0;

  function createTestWorkItem(title = 'Test Work Item', withDates = true) {
    const id = `wi-${Date.now()}-${offset++}`;
    const now = new Date().toISOString();
    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        startDate: withDates ? '2026-04-01' : undefined,
        endDate: withDates ? '2026-04-30' : undefined,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createTestVendor(name = 'ACME Corp') {
    const id = `vendor-${Date.now()}-${offset++}`;
    const now = new Date().toISOString();
    app.db
      .insert(vendors)
      .values({ id, name, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  // ─── OPTIONS ─────────────────────────────────────────────────────────────

  describe('OPTIONS /dav/', () => {
    it('returns 200 with DAV header', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/dav/',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['dav']).toBeDefined();
      expect(response.headers['dav']).toContain('calendar-access');
      expect(response.headers['dav']).toContain('addressbook');
    });
  });

  // ─── PROPFIND authentication ──────────────────────────────────────────────

  describe('PROPFIND /dav/ authentication', () => {
    it('returns 401 with WWW-Authenticate header without auth header', async () => {
      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
      }) as any);

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Basic realm="Cornerstone DAV"');
    });

    it('returns 401 with WWW-Authenticate header with invalid token', async () => {
      const credentials = Buffer.from('user:not-a-valid-token').toString('base64');
      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }) as any);

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Basic realm="Cornerstone DAV"');
    });

    it('returns 207 with valid DAV token', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
        headers: { Authorization: basicAuth },
      }) as any);

      expect(response.statusCode).toBe(207);
    });

    it('username part of Basic Auth is ignored (only token/password matters)', async () => {
      const { token } = await createUserWithToken();
      // Any username, just the token in password
      const credentials = Buffer.from(`totally-ignored-username:${token}`).toString('base64');

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
        headers: { Authorization: `Basic ${credentials}` },
      }) as any);

      expect(response.statusCode).toBe(207);
    });
  });

  // ─── PROPFIND /dav/ ──────────────────────────────────────────────────────

  describe('PROPFIND /dav/', () => {
    it('returns 207 multistatus with root collection and current-user-principal', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
        headers: { Authorization: basicAuth },
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('Cornerstone');
      // Must include current-user-principal for iOS discovery
      expect(response.payload).toContain('<D:current-user-principal>');
      expect(response.payload).toContain('<D:href>/dav/principals/default/</D:href>');
    });

    it('returns hrefs with /dav prefix at depth 1', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
        headers: { Authorization: basicAuth, depth: '1' },
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:href>/dav/</D:href>');
      expect(response.payload).toContain('<D:href>/dav/principals/</D:href>');
      expect(response.payload).toContain('<D:href>/dav/calendars/</D:href>');
      expect(response.payload).toContain('<D:href>/dav/addressbooks/</D:href>');
    });
  });

  // ─── PROPFIND /dav/calendars/default/ ────────────────────────────────────

  describe('PROPFIND /dav/calendars/default/', () => {
    it('returns 207 multistatus with calendar collection props', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/calendars/default/',
        headers: { Authorization: basicAuth },
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('urn:ietf:params:xml:ns:caldav');
      expect(response.payload).toContain('Cornerstone Project Calendar');
      // Must include getctag for iOS change detection
      expect(response.payload).toContain('getctag');
      expect(response.payload).toContain('http://calendarserver.org/ns/');
    });

    it('returns calendar collection with work item entries at depth 1', async () => {
      const { basicAuth } = await createUserWithToken();
      createTestWorkItem('Foundation Work');

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/calendars/default/',
        headers: { Authorization: basicAuth, depth: '1' },
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('.ics');
    });
  });

  // ─── PROPFIND /dav/addressbooks/default/ ─────────────────────────────────

  describe('PROPFIND /dav/addressbooks/default/', () => {
    it('returns 207 multistatus with addressbook collection props', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/addressbooks/default/',
        headers: { Authorization: basicAuth },
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('urn:ietf:params:xml:ns:carddav');
      expect(response.payload).toContain('Cornerstone Contacts');
    });

    it('returns addressbook with vendor entries at depth 1', async () => {
      const { basicAuth } = await createUserWithToken();
      createTestVendor('Plumbing Pro');

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/addressbooks/default/',
        headers: { Authorization: basicAuth, depth: '1' },
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('.vcf');
      expect(response.payload).toContain('Plumbing Pro');
    });
  });

  // ─── GET /dav/calendars/default/:uid.ics ─────────────────────────────────

  describe('GET /dav/calendars/default/:uid.ics', () => {
    it('returns iCal for existing work item with dates', async () => {
      const { basicAuth } = await createUserWithToken();
      const wiId = createTestWorkItem('Foundation Work', true);

      const response = await app.inject({
        method: 'GET',
        url: `/dav/calendars/default/wi-${wiId}.ics`,
        headers: { Authorization: basicAuth },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.payload).toContain('BEGIN:VCALENDAR');
      expect(response.payload).toContain('END:VCALENDAR');
    });

    it('returns 404 for unknown work item id', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await app.inject({
        method: 'GET',
        url: '/dav/calendars/default/wi-nonexistent-id.ics',
        headers: { Authorization: basicAuth },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for unrecognized uid prefix', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await app.inject({
        method: 'GET',
        url: '/dav/calendars/default/unknown-prefix-abc.ics',
        headers: { Authorization: basicAuth },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const wiId = createTestWorkItem();

      const response = await app.inject({
        method: 'GET',
        url: `/dav/calendars/default/wi-${wiId}.ics`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /dav/addressbooks/default/:uid.vcf ──────────────────────────────

  describe('GET /dav/addressbooks/default/:uid.vcf', () => {
    it('returns vCard for existing vendor', async () => {
      const { basicAuth } = await createUserWithToken();
      const vendorId = createTestVendor('ACME Corp');

      const response = await app.inject({
        method: 'GET',
        url: `/dav/addressbooks/default/vendor-${vendorId}.vcf`,
        headers: { Authorization: basicAuth },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/vcard');
      expect(response.payload).toContain('BEGIN:VCARD');
      expect(response.payload).toContain('END:VCARD');
      expect(response.payload).toContain('ACME Corp');
    });

    it('returns vCard for existing contact', async () => {
      const { basicAuth, cookie } = await createUserWithToken();
      const vendorId = createTestVendor('ACME Corp');

      // Create contact via API
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { name: 'Alice Smith', role: 'PM' },
      });
      const { contact } = createRes.json<{ contact: { id: string } }>();

      const response = await app.inject({
        method: 'GET',
        url: `/dav/addressbooks/default/contact-${contact.id}.vcf`,
        headers: { Authorization: basicAuth },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/vcard');
      expect(response.payload).toContain('BEGIN:VCARD');
      expect(response.payload).toContain('Alice Smith');
    });

    it('returns 404 for unknown vendor id', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await app.inject({
        method: 'GET',
        url: '/dav/addressbooks/default/vendor-nonexistent-id.vcf',
        headers: { Authorization: basicAuth },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'GET',
        url: `/dav/addressbooks/default/vendor-${vendorId}.vcf`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── REPORT /dav/addressbooks/default/ ───────────────────────────────────

  describe('REPORT /dav/addressbooks/default/', () => {
    it('returns 207 with vCards for multiget body', async () => {
      const { basicAuth } = await createUserWithToken();
      const vendorId = createTestVendor('Smith Electric');

      const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<A:addressbook-multiget xmlns:D="DAV:" xmlns:A="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <A:address-data/>
  </D:prop>
  <D:href>/dav/addressbooks/default/vendor-${vendorId}.vcf</D:href>
</A:addressbook-multiget>`;

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/addressbooks/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: reportBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('Smith Electric');
    });

    it('returns 207 empty multistatus for empty body', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/addressbooks/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: '<report/>',
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
    });

    it('returns 401 without auth', async () => {
      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/addressbooks/default/',
        headers: { 'content-type': 'application/xml' },
        payload: '<report/>',
      }) as any);

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── REPORT calendar-multiget /dav/calendars/default/ ───────────────────

  describe('REPORT calendar-multiget /dav/calendars/default/', () => {
    it('returns events for multiget with iOS-style inline xmlns hrefs', async () => {
      const { basicAuth } = await createUserWithToken();
      const wiId = createTestWorkItem('iOS Calendar Test');

      const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<A:calendar-multiget xmlns:A="urn:ietf:params:xml:ns:caldav" xmlns:B="DAV:">
  <B:prop>
    <B:getetag/>
    <A:calendar-data/>
  </B:prop>
  <A:href xmlns:A="DAV:">/dav/calendars/default/wi-${wiId}.ics</A:href>
</A:calendar-multiget>`;

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/calendars/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: reportBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('iOS Calendar Test');
      expect(response.payload).toContain('calendar-data');
    });

    it('returns events for multiget with standard D:href format', async () => {
      const { basicAuth } = await createUserWithToken();
      const wiId = createTestWorkItem('Standard Multiget Test');

      const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <D:href>/dav/calendars/default/wi-${wiId}.ics</D:href>
</C:calendar-multiget>`;

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/calendars/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: reportBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('Standard Multiget Test');
    });
  });

  // ─── REPORT calendar-query /dav/calendars/default/ ──────────────────────

  describe('REPORT calendar-query /dav/calendars/default/', () => {
    it('returns all events for calendar-query REPORT', async () => {
      const { basicAuth } = await createUserWithToken();
      createTestWorkItem('Query Test Item');

      const queryBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/calendars/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: queryBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('Query Test Item');
      expect(response.payload).toContain('calendar-data');
    });
  });

  // ─── REPORT addressbook-query /dav/addressbooks/default/ ──────────────

  describe('REPORT addressbook-query /dav/addressbooks/default/', () => {
    it('returns all contacts for addressbook-query REPORT', async () => {
      const { basicAuth } = await createUserWithToken();
      createTestVendor('Query Vendor');

      const queryBody = `<?xml version="1.0" encoding="utf-8"?>
<A:addressbook-query xmlns:D="DAV:" xmlns:A="urn:ietf:params:xml:ns:carddav">
  <D:prop>
    <D:getetag/>
    <A:address-data/>
  </D:prop>
</A:addressbook-query>`;

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/addressbooks/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: queryBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('Query Vendor');
      expect(response.payload).toContain('address-data');
    });
  });

  // ─── REPORT addressbook-multiget with iOS-style hrefs ──────────────────

  describe('REPORT addressbook-multiget with iOS-style hrefs', () => {
    it('returns vCards for multiget with iOS-style inline xmlns hrefs', async () => {
      const { basicAuth } = await createUserWithToken();
      const vendorId = createTestVendor('iOS Contacts Test');

      const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<A:addressbook-multiget xmlns:A="urn:ietf:params:xml:ns:carddav" xmlns:B="DAV:">
  <B:prop>
    <B:getetag/>
    <A:address-data/>
  </B:prop>
  <A:href xmlns:A="DAV:">/dav/addressbooks/default/vendor-${vendorId}.vcf</A:href>
</A:addressbook-multiget>`;

      const response = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/addressbooks/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: reportBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('iOS Contacts Test');
      expect(response.payload).toContain('address-data');
    });
  });

  // ─── PROPPATCH /dav/calendars/default/ ──────────────────────────────────

  describe('PROPPATCH /dav/calendars/default/', () => {
    it('returns 207 multistatus acknowledging properties', async () => {
      const { basicAuth } = await createUserWithToken();

      const proppatchBody = `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:" xmlns:A="http://apple.com/ns/ical/">
  <D:set>
    <D:prop>
      <A:calendar-color>#FF5733FF</A:calendar-color>
    </D:prop>
  </D:set>
</D:propertyupdate>`;

      const response = await (app.inject({
        method: 'PROPPATCH' as any,
        url: '/dav/calendars/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: proppatchBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('/dav/calendars/default/');
      expect(response.payload).toContain('200 OK');
    });

    it('returns 401 without auth', async () => {
      const response = await (app.inject({
        method: 'PROPPATCH' as any,
        url: '/dav/calendars/default/',
        headers: { 'content-type': 'application/xml' },
        payload: '<propertyupdate/>',
      }) as any);

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── PROPPATCH /dav/addressbooks/default/ ─────────────────────────────

  describe('PROPPATCH /dav/addressbooks/default/', () => {
    it('returns 207 multistatus acknowledging properties', async () => {
      const { basicAuth } = await createUserWithToken();

      const proppatchBody = `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:">
  <D:set>
    <D:prop>
      <D:displayname>My Contacts</D:displayname>
    </D:prop>
  </D:set>
</D:propertyupdate>`;

      const response = await (app.inject({
        method: 'PROPPATCH' as any,
        url: '/dav/addressbooks/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: proppatchBody,
      }) as any);

      expect(response.statusCode).toBe(207);
      expect(response.payload).toContain('<D:multistatus');
      expect(response.payload).toContain('/dav/addressbooks/default/');
    });
  });

  // ─── ETag consistency ──────────────────────────────────────────────────

  describe('ETag consistency', () => {
    it('PROPFIND depth 1 and REPORT return same ETags for calendar events', async () => {
      const { basicAuth } = await createUserWithToken();
      createTestWorkItem('ETag Test Item');

      // PROPFIND depth 1
      const propfindRes = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/calendars/default/',
        headers: { Authorization: basicAuth, depth: '1' },
      }) as any);

      // REPORT calendar-query
      const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><D:getetag/><C:calendar-data/></D:prop>
  <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"/></C:comp-filter></C:filter>
</C:calendar-query>`;

      const reportRes = await (app.inject({
        method: 'REPORT' as any,
        url: '/dav/calendars/default/',
        headers: {
          Authorization: basicAuth,
          'content-type': 'application/xml',
        },
        payload: reportBody,
      }) as any);

      // Extract ETags from both responses — they should both use "wi-<hash>" format
      const propfindEtags = propfindRes.payload.match(/<D:getetag>"(wi-[^"]+)"<\/D:getetag>/g) || [];
      const reportEtags = reportRes.payload.match(/<D:getetag>"(wi-[^"]+)"<\/D:getetag>/g) || [];

      expect(propfindEtags.length).toBeGreaterThan(0);
      expect(reportEtags.length).toBeGreaterThan(0);
      // Both should use the same wi-prefixed format
      expect(propfindEtags[0]).toBe(reportEtags[0]);
    });
  });

  // ─── Namespace declarations ────────────────────────────────────────────

  describe('XML namespace declarations', () => {
    it('multistatus root declares all namespaces', async () => {
      const { basicAuth } = await createUserWithToken();

      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/calendars/default/',
        headers: { Authorization: basicAuth },
      }) as any);

      expect(response.payload).toContain('xmlns:D="DAV:"');
      expect(response.payload).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
      expect(response.payload).toContain('xmlns:A="urn:ietf:params:xml:ns:carddav"');
      expect(response.payload).toContain('xmlns:CS="http://calendarserver.org/ns/"');
    });
  });

  // ─── Well-known redirects ─────────────────────────────────────────────────

  describe('Well-known redirects', () => {
    it('GET /.well-known/caldav returns 301 redirect to /dav/', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/caldav',
      });

      expect(response.statusCode).toBe(301);
      expect(response.headers.location).toBe('/dav/');
    });

    it('GET /.well-known/carddav returns 301 redirect to /dav/', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/.well-known/carddav',
      });

      expect(response.statusCode).toBe(301);
      expect(response.headers.location).toBe('/dav/');
    });

    it('PROPFIND /.well-known/caldav returns 301 redirect to /dav/', async () => {
      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/.well-known/caldav',
      }) as any);

      expect(response.statusCode).toBe(301);
      expect(response.headers.location).toBe('/dav/');
    });

    it('PROPFIND /.well-known/carddav returns 301 redirect to /dav/', async () => {
      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/.well-known/carddav',
      }) as any);

      expect(response.statusCode).toBe(301);
      expect(response.headers.location).toBe('/dav/');
    });
  });
});

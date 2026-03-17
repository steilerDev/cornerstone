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
    it('returns 401 without auth header', async () => {
      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
      }) as any);

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const credentials = Buffer.from('user:not-a-valid-token').toString('base64');
      const response = await (app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/',
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }) as any);

      expect(response.statusCode).toBe(401);
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
    it('returns 207 multistatus with root collection', async () => {
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
  <D:href>/addressbooks/default/vendor-${vendorId}.vcf</D:href>
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

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { vendors } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { VendorContact, VendorDetail, ApiErrorResponse } from '@cornerstone/shared';

describe('Vendor Contact Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-vendor-contacts-routes-test-'));
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

  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  let vendorOffset = 0;

  function createTestVendor(name = 'Test Vendor') {
    const id = `vendor-${Date.now()}-${vendorOffset++}`;
    const now = new Date().toISOString();
    app.db.insert(vendors).values({ id, name, createdAt: now, updatedAt: now }).run();
    return id;
  }

  // ─── GET /api/vendors/:vendorId/contacts ────────────────────────────────────

  describe('GET /api/vendors/:vendorId/contacts', () => {
    it('returns 200 with empty contacts array for vendor with no contacts', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ contacts: VendorContact[] }>();
      expect(body.contacts).toEqual([]);
    });

    it('returns 200 with contacts array when contacts exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      // Create a contact first
      await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice', lastName: 'Smith' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ contacts: VendorContact[] }>();
      expect(body.contacts).toHaveLength(1);
      expect(body.contacts[0]!.firstName).toBe('Alice');
      expect(body.contacts[0]!.lastName).toBe('Smith');
      expect(body.contacts[0]!.name).toBe('Alice Smith');
    });

    it('returns 404 for unknown vendorId', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors/does-not-exist/contacts',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without session', async () => {
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/contacts`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/vendors/:vendorId/contacts ───────────────────────────────────

  describe('POST /api/vendors/:vendorId/contacts', () => {
    it('returns 201 with new contact', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          firstName: 'Bob',
          lastName: 'Jones',
          role: 'Project Manager',
          phone: '555-1234',
          email: 'bob@example.com',
          notes: 'Primary contact',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ contact: VendorContact }>();
      expect(body.contact.id).toBeDefined();
      expect(body.contact.vendorId).toBe(vendorId);
      expect(body.contact.firstName).toBe('Bob');
      expect(body.contact.lastName).toBe('Jones');
      expect(body.contact.name).toBe('Bob Jones');
      expect(body.contact.role).toBe('Project Manager');
      expect(body.contact.phone).toBe('555-1234');
      expect(body.contact.email).toBe('bob@example.com');
      expect(body.contact.notes).toBe('Primary contact');
    });

    it('returns 201 with first name only', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ contact: VendorContact }>();
      expect(body.contact.firstName).toBe('Alice');
      expect(body.contact.lastName).toBeNull();
      expect(body.contact.name).toBe('Alice');
      expect(body.contact.role).toBeNull();
      expect(body.contact.phone).toBeNull();
      expect(body.contact.email).toBeNull();
      expect(body.contact.notes).toBeNull();
    });

    it('returns 400 for missing both first and last name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { role: 'Engineer' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 for unknown vendorId', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors/nonexistent-vendor/contacts',
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without session', async () => {
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { 'content-type': 'application/json' },
        payload: { firstName: 'Alice' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── PATCH /api/vendors/:vendorId/contacts/:contactId ──────────────────────

  describe('PATCH /api/vendors/:vendorId/contacts/:contactId', () => {
    it('returns 200 with updated contact', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const createRes = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice', lastName: 'Smith', role: 'Engineer' },
      });
      const { contact } = createRes.json<{ contact: VendorContact }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/contacts/${contact.id}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { phone: '555-9999' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ contact: VendorContact }>();
      expect(body.contact.id).toBe(contact.id);
      expect(body.contact.name).toBe('Alice Smith');
      expect(body.contact.role).toBe('Engineer');
      expect(body.contact.phone).toBe('555-9999');
    });

    it('returns 400 for no fields provided', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const createRes = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice' },
      });
      const { contact } = createRes.json<{ contact: VendorContact }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/contacts/${contact.id}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 for unknown contact', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/contacts/not-a-real-contact`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without session', async () => {
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendorId}/contacts/some-id`,
        headers: { 'content-type': 'application/json' },
        payload: { firstName: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── DELETE /api/vendors/:vendorId/contacts/:contactId ─────────────────────

  describe('DELETE /api/vendors/:vendorId/contacts/:contactId', () => {
    it('returns 204 on successful delete', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const createRes = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice' },
      });
      const { contact } = createRes.json<{ contact: VendorContact }>();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/contacts/${contact.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('verifies deletion: GET returns empty after DELETE', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const createRes = await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice' },
      });
      const { contact } = createRes.json<{ contact: VendorContact }>();

      await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/contacts/${contact.id}`,
        headers: { cookie },
      });

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie },
      });
      const body = listRes.json<{ contacts: VendorContact[] }>();
      expect(body.contacts).toHaveLength(0);
    });

    it('returns 404 for unknown contact', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/contacts/not-a-real-id`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without session', async () => {
      const vendorId = createTestVendor();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendorId}/contacts/some-id`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /api/vendors/:id includes contacts ─────────────────────────────────

  describe('GET /api/vendors/:id includes contacts array', () => {
    it('vendor detail response includes empty contacts array', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor('ACME Plumbing');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.contacts).toBeDefined();
      expect(Array.isArray(body.vendor.contacts)).toBe(true);
      expect(body.vendor.contacts).toHaveLength(0);
    });

    it('vendor detail response includes contacts after creation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor('ACME Plumbing');

      await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Alice', role: 'PM' },
      });

      await app.inject({
        method: 'POST',
        url: `/api/vendors/${vendorId}/contacts`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: { firstName: 'Bob' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendorId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.contacts).toHaveLength(2);
      const names = body.vendor.contacts.map((c) => c.name).sort();
      expect(names).toEqual(['Alice', 'Bob']);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import { vendors, workItems } from '../db/schema.js';

describe('Work Item Vendor Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-wi-vendor-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie.
   */
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

  let entityCounter = 0;

  /**
   * Helper: Insert a vendor directly into the database.
   */
  function createTestVendor(
    name: string,
    options: { createdBy?: string | null } = {},
  ): { id: string; name: string } {
    const id = `vendor-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(vendors)
      .values({
        id,
        name,
        specialty: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: options.createdBy ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name };
  }

  /**
   * Helper: Insert a work item directly into the database.
   */
  function createTestWorkItem(title: string, userId: string): { id: string; title: string } {
    const id = `wi-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, title };
  }

  // ─── GET /api/work-items/:workItemId/vendors ───────────────────────────────

  describe('GET /api/work-items/:workItemId/vendors', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/vendors`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns empty vendors array when no vendors are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Empty Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: unknown[] }>();
      expect(body.vendors).toEqual([]);
    });

    it('returns linked vendors', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item With Vendors', userId);
      const vendor = createTestVendor('Reliable Contractor');

      // Link the vendor
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Array<{ id: string; name: string }> }>();
      expect(body.vendors).toHaveLength(1);
      expect(body.vendors[0].id).toBe(vendor.id);
      expect(body.vendors[0].name).toBe('Reliable Contractor');
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/non-existent-wi/vendors',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('member can list vendors on a work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password123',
        'member',
      );
      const workItem = createTestWorkItem('Member Accessible', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('admin can list vendors on a work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password123',
        'admin',
      );
      const workItem = createTestWorkItem('Admin Accessible', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/work-items/:workItemId/vendors ──────────────────────────────

  describe('POST /api/work-items/:workItemId/vendors', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test2',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);
      const vendor = createTestVendor('Test Vendor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('links a vendor to a work item and returns 201 with vendor', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Top Contractor');

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ vendor: { id: string; name: string } }>();
      expect(body.vendor.id).toBe(vendor.id);
      expect(body.vendor.name).toBe('Top Contractor');
    });

    it('returns 400 when vendorId is missing from body', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const vendor = createTestVendor('Test Vendor');

      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/non-existent-wi/vendors',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when vendor does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: 'non-existent-vendor' }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when vendor is already linked to work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Duplicate Vendor');

      // First link
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      // Second link (duplicate)
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('strips unknown properties from the request body (additionalProperties: false)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Vendor With Extra');

      // Send extra properties — they should be stripped, not cause a 400
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id, extraField: 'should-be-stripped' }),
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── DELETE /api/work-items/:workItemId/vendors/:vendorId ──────────────────

  describe('DELETE /api/work-items/:workItemId/vendors/:vendorId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test3@example.com',
        'Auth Test3',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);
      const vendor = createTestVendor('Test Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/vendors/${vendor.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 204 on successful unlink', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Vendor To Remove');

      // Link first
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      // Now unlink
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('vendor is no longer listed after unlink', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Vendor To Unlink');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ vendorId: vendor.id }),
      });

      await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/vendors/${vendor.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/vendors`,
        headers: { cookie },
      });

      const body = listResponse.json<{ vendors: unknown[] }>();
      expect(body.vendors).toEqual([]);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const vendor = createTestVendor('Test Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/non-existent-wi/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when vendor is not linked to work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Unlinked Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when vendorId does not exist at all', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/vendors/non-existent-vendor`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

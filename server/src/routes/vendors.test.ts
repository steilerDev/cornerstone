import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { Vendor, VendorDetail, ApiErrorResponse } from '@cornerstone/shared';
import { vendors, invoices, workItems, workItemVendors } from '../db/schema.js';

describe('Vendor Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-vendor-routes-test-'));
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

  /**
   * Helper: Insert a vendor directly into the database.
   */
  let vendorTimestampOffset = 0;

  function createTestVendor(
    name: string,
    options: {
      specialty?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      notes?: string | null;
      createdBy?: string | null;
    } = {},
  ) {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + vendorTimestampOffset).toISOString();
    vendorTimestampOffset += 1;

    app.db
      .insert(vendors)
      .values({
        id,
        name,
        specialty: options.specialty ?? null,
        phone: options.phone ?? null,
        email: options.email ?? null,
        address: options.address ?? null,
        notes: options.notes ?? null,
        createdBy: options.createdBy ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name, ...options, createdAt: timestamp, updatedAt: timestamp };
  }

  /**
   * Helper: Insert an invoice for a vendor.
   */
  function createTestInvoice(
    vendorId: string,
    status: 'pending' | 'paid' | 'overdue' = 'pending',
    amount = 1000,
  ) {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(invoices)
      .values({
        id,
        vendorId,
        amount,
        date: '2026-01-01',
        status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Helper: Create a minimal work item and link it to a vendor.
   */
  function createWorkItemVendorLink(vendorId: string) {
    const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    app.db
      .insert(workItems)
      .values({
        id: workItemId,
        title: 'Test Work Item',
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db.insert(workItemVendors).values({ workItemId, vendorId }).run();
    return workItemId;
  }

  // ─── GET /api/vendors ──────────────────────────────────────────────────────

  describe('GET /api/vendors', () => {
    it('returns 200 with empty list when no vendors exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[]; pagination: object }>();
      expect(body.vendors).toHaveLength(0);
      expect(body.pagination).toBeDefined();
    });

    it('returns 200 with vendor list', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Acme Plumbing');
      createTestVendor('Best Electric');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[]; pagination: object }>();
      expect(body.vendors).toHaveLength(2);
    });

    it('returns all vendor fields in list', async () => {
      const { cookie, userId } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Full Vendor', {
        specialty: 'Plumbing',
        phone: '555-1234',
        email: 'full@vendor.com',
        address: '123 Main St',
        notes: 'Test notes',
        createdBy: userId,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[] }>();
      const vendor = body.vendors[0];
      expect(vendor.name).toBe('Full Vendor');
      expect(vendor.specialty).toBe('Plumbing');
      expect(vendor.phone).toBe('555-1234');
      expect(vendor.email).toBe('full@vendor.com');
      expect(vendor.address).toBe('123 Main St');
      expect(vendor.notes).toBe('Test notes');
      expect(vendor.createdBy).not.toBeNull();
    });

    it('returns correct pagination metadata', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      for (let i = 1; i <= 5; i++) {
        createTestVendor(`Vendor ${i.toString().padStart(2, '0')}`);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?page=1&pageSize=2',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        vendors: Vendor[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>();
      expect(body.vendors).toHaveLength(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(2);
      expect(body.pagination.totalItems).toBe(5);
      expect(body.pagination.totalPages).toBe(3);
    });

    it('filters by search query', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Smith Plumbing', { specialty: 'Plumbing' });
      createTestVendor('Jones Electric', { specialty: 'Electrical' });
      createTestVendor('Smith Roofing', { specialty: 'Roofing' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?q=smith',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[] }>();
      expect(body.vendors).toHaveLength(2);
      expect(body.vendors.every((v) => v.name.toLowerCase().includes('smith'))).toBe(true);
    });

    it('filters by specialty in search query', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Vendor A', { specialty: 'Plumbing' });
      createTestVendor('Vendor B', { specialty: 'Electrical' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?q=electrical',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[] }>();
      expect(body.vendors).toHaveLength(1);
      expect(body.vendors[0].name).toBe('Vendor B');
    });

    it('sorts by name ascending', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Zeta Corp');
      createTestVendor('Alpha Services');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?sortBy=name&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[] }>();
      expect(body.vendors[0].name).toBe('Alpha Services');
      expect(body.vendors[1].name).toBe('Zeta Corp');
    });

    it('sorts by name descending', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Zeta Corp');
      createTestVendor('Alpha Services');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?sortBy=name&sortOrder=desc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[] }>();
      expect(body.vendors[0].name).toBe('Zeta Corp');
    });

    it('sorts by specialty', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestVendor('Vendor A', { specialty: 'Roofing' });
      createTestVendor('Vendor B', { specialty: 'Electrical' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?sortBy=specialty&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendors: Vendor[] }>();
      expect(body.vendors[0].specialty).toBe('Electrical');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to list vendors', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects invalid sortBy enum value with 400', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors?sortBy=invalid',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── POST /api/vendors ─────────────────────────────────────────────────────

  describe('POST /api/vendors', () => {
    it('creates a vendor with name only (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: 'New Vendor' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ vendor: Vendor }>();
      expect(body.vendor).toBeDefined();
      expect(body.vendor.id).toBeDefined();
      expect(body.vendor.name).toBe('New Vendor');
      expect(body.vendor.specialty).toBeNull();
      expect(body.vendor.phone).toBeNull();
      expect(body.vendor.createdAt).toBeDefined();
    });

    it('creates a vendor with all fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: {
          name: 'Full Vendor',
          specialty: 'Electrical',
          phone: '+1 555-0001',
          email: 'full@vendor.com',
          address: '100 Oak Ave',
          notes: 'Excellent service',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ vendor: Vendor }>();
      expect(body.vendor.name).toBe('Full Vendor');
      expect(body.vendor.specialty).toBe('Electrical');
      expect(body.vendor.phone).toBe('+1 555-0001');
      expect(body.vendor.email).toBe('full@vendor.com');
      expect(body.vendor.address).toBe('100 Oak Ave');
      expect(body.vendor.notes).toBe('Excellent service');
    });

    it('sets createdBy to the authenticated user', async () => {
      const { cookie, userId } = await createUserWithSession(
        'user@test.com',
        'Test User',
        'password',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: 'Owned Vendor' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ vendor: Vendor }>();
      expect(body.vendor.createdBy).not.toBeNull();
      expect(body.vendor.createdBy?.id).toBe(userId);
    });

    it('trims name on creation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: '  Trimmed Vendor  ' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ vendor: Vendor }>();
      expect(body.vendor.name).toBe('Trimmed Vendor');
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { specialty: 'Plumbing' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name string', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('strips unknown properties (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: 'Strip Test Vendor', unknownField: 'should be stripped' },
      });

      // Fastify strips extra properties and creates successfully
      expect(response.statusCode).toBe(201);
      const body = response.json<{ vendor: Vendor }>();
      expect(body.vendor.name).toBe('Strip Test Vendor');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        payload: { name: 'No Auth Vendor' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to create a vendor', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: 'Member Created Vendor' },
      });

      expect(response.statusCode).toBe(201);
    });

    it('allows duplicate vendor names (no uniqueness constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const r1 = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: 'Duplicate Name' },
      });
      const r2 = await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: { cookie },
        payload: { name: 'Duplicate Name' },
      });

      expect(r1.statusCode).toBe(201);
      expect(r2.statusCode).toBe(201);
      const b1 = r1.json<{ vendor: Vendor }>();
      const b2 = r2.json<{ vendor: Vendor }>();
      expect(b1.vendor.id).not.toBe(b2.vendor.id);
    });
  });

  // ─── GET /api/vendors/:id ──────────────────────────────────────────────────

  describe('GET /api/vendors/:id', () => {
    it('returns 200 with vendor detail', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Detail Vendor', { specialty: 'Plumbing' });

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor).toBeDefined();
      expect(body.vendor.id).toBe(vendor.id);
      expect(body.vendor.name).toBe('Detail Vendor');
      expect(body.vendor.specialty).toBe('Plumbing');
    });

    it('includes invoiceCount and outstandingBalance in detail response', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Stats Vendor');
      createTestInvoice(vendor.id, 'pending', 500);
      createTestInvoice(vendor.id, 'overdue', 300);
      createTestInvoice(vendor.id, 'paid', 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.invoiceCount).toBe(3);
      expect(body.vendor.outstandingBalance).toBe(800); // pending + overdue only
    });

    it('returns invoiceCount 0 and outstandingBalance 0 when no invoices', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Clean Vendor');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.invoiceCount).toBe(0);
      expect(body.vendor.outstandingBalance).toBe(0);
    });

    it('returns 404 NOT_FOUND for non-existent vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/vendors/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication', async () => {
      const vendor = createTestVendor('Auth Vendor');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor.id}`,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to get vendor detail', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendor = createTestVendor('Member View Vendor');

      const response = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── PATCH /api/vendors/:id ────────────────────────────────────────────────

  describe('PATCH /api/vendors/:id', () => {
    it('updates vendor name successfully (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Old Name Vendor', { specialty: 'Roofing' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
        payload: { name: 'New Name Vendor' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.id).toBe(vendor.id);
      expect(body.vendor.name).toBe('New Name Vendor');
      expect(body.vendor.specialty).toBe('Roofing'); // Unchanged
    });

    it('returns VendorDetail shape (includes invoiceCount and outstandingBalance)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Update Detail Vendor');
      createTestInvoice(vendor.id, 'pending', 250);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
        payload: { specialty: 'Electrical' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.invoiceCount).toBe(1);
      expect(body.vendor.outstandingBalance).toBe(250);
    });

    it('clears specialty by setting to null', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Clear Specialty Vendor', { specialty: 'Plumbing' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
        payload: { specialty: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.specialty).toBeNull();
    });

    it('updates all fields at once', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('All Fields Vendor');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
        payload: {
          name: 'Updated All Fields',
          specialty: 'Landscaping',
          phone: '555-7777',
          email: 'updated@vendor.com',
          address: '456 Elm St',
          notes: 'Updated notes',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.name).toBe('Updated All Fields');
      expect(body.vendor.specialty).toBe('Landscaping');
      expect(body.vendor.phone).toBe('555-7777');
      expect(body.vendor.email).toBe('updated@vendor.com');
      expect(body.vendor.address).toBe('456 Elm St');
      expect(body.vendor.notes).toBe('Updated notes');
    });

    it('returns 404 NOT_FOUND for non-existent vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/vendors/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Empty PATCH Vendor');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 without authentication', async () => {
      const vendor = createTestVendor('No Auth PATCH Vendor');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to update a vendor', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendor = createTestVendor('Member Update Vendor');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
        payload: { name: 'Member Updated Vendor' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ vendor: VendorDetail }>();
      expect(body.vendor.name).toBe('Member Updated Vendor');
    });
  });

  // ─── DELETE /api/vendors/:id ───────────────────────────────────────────────

  describe('DELETE /api/vendors/:id', () => {
    it('deletes a vendor successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Delete Me Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('vendor no longer accessible after deletion', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Gone Vendor');

      await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 NOT_FOUND for non-existent vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/vendors/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 VENDOR_IN_USE when vendor has invoices', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Invoice Blocked Vendor');
      createTestInvoice(vendor.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VENDOR_IN_USE');
    });

    it('returns 409 VENDOR_IN_USE when vendor is linked to work items', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('WorkItem Blocked Vendor');
      createWorkItemVendorLink(vendor.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VENDOR_IN_USE');
    });

    it('includes invoiceCount and workItemCount in 409 response details', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendor = createTestVendor('Count Details Vendor');
      createTestInvoice(vendor.id, 'pending', 100);
      createTestInvoice(vendor.id, 'paid', 200);
      createWorkItemVendorLink(vendor.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.details).toBeDefined();
      expect(body.error.details?.invoiceCount).toBe(2);
      expect(body.error.details?.workItemCount).toBe(1);
    });

    it('returns 401 without authentication', async () => {
      const vendor = createTestVendor('No Auth Delete Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to delete a vendor', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendor = createTestVendor('Member Delete Vendor');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/vendors/${vendor.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});

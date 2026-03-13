/**
 * Integration tests for feed routes — CalDAV (.ics) and CardDAV (.vcf) endpoints.
 *
 * Tests the full request/response cycle using Fastify's app.inject().
 * Feeds are anonymous (no auth required) and return iCal/vCard content.
 *
 * EPIC-17 Story #747: CalDAV/CardDAV Feed Endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import {
  workItems,
  milestones,
  householdItems,
  householdItemCategories,
  vendors,
} from '../db/schema.js';

describe('Feed Routes (CalDAV/CardDAV)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-feeds-test-'));
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

  // ─── Test Helpers ─────────────────────────────────────────────────────────

  function createTestWorkItem(
    title: string,
    overrides: Partial<{
      startDate: string | null;
      endDate: string | null;
      actualStartDate: string | null;
      actualEndDate: string | null;
    }> = {},
  ): string {
    const now = new Date().toISOString();
    const workItemId = `wi-${randomUUID()}`;
    app.db
      .insert(workItems)
      .values({
        id: workItemId,
        title,
        status: 'not_started',
        startDate: overrides.startDate ?? null,
        endDate: overrides.endDate ?? null,
        actualStartDate: overrides.actualStartDate ?? null,
        actualEndDate: overrides.actualEndDate ?? null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  function createTestMilestone(
    title: string,
    targetDate: string,
    overrides: Partial<{
      isCompleted: boolean;
      completedAt: string | null;
    }> = {},
  ): number {
    const now = new Date().toISOString();
    const result = app.db
      .insert(milestones)
      .values({
        title,
        targetDate,
        isCompleted: overrides.isCompleted ?? false,
        completedAt: overrides.completedAt ?? null,
        color: null,
        description: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: milestones.id })
      .get();
    return result!.id;
  }

  function createHouseholdItemCategory(name: string): string {
    const now = new Date().toISOString();
    const categoryId = `hic-${randomUUID()}`;
    app.db
      .insert(householdItemCategories)
      .values({
        id: categoryId,
        name,
        color: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return categoryId;
  }

  function createTestHouseholdItem(
    name: string,
    categoryId: string,
    overrides: Partial<{
      earliestDeliveryDate: string | null;
      latestDeliveryDate: string | null;
      targetDeliveryDate: string | null;
      actualDeliveryDate: string | null;
    }> = {},
  ): string {
    const now = new Date().toISOString();
    const householdItemId = `hi-${randomUUID()}`;
    app.db
      .insert(householdItems)
      .values({
        id: householdItemId,
        name,
        description: null,
        categoryId,
        status: 'planned',
        vendorId: null,
        url: null,
        room: null,
        quantity: 1,
        orderDate: null,
        actualDeliveryDate: overrides.actualDeliveryDate ?? null,
        earliestDeliveryDate: overrides.earliestDeliveryDate ?? null,
        latestDeliveryDate: overrides.latestDeliveryDate ?? null,
        targetDeliveryDate: overrides.targetDeliveryDate ?? null,
        isLate: false,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return householdItemId;
  }

  function createTestVendor(
    name: string,
    overrides: Partial<{
      email: string | null;
      phone: string | null;
      address: string | null;
      specialty: string | null;
      notes: string | null;
    }> = {},
  ): string {
    const now = new Date().toISOString();
    const vendorId = `v-${randomUUID()}`;
    app.db
      .insert(vendors)
      .values({
        id: vendorId,
        name,
        specialty: overrides.specialty ?? null,
        phone: overrides.phone ?? null,
        email: overrides.email ?? null,
        address: overrides.address ?? null,
        notes: overrides.notes ?? null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return vendorId;
  }

  // ─── CalDAV Tests ─────────────────────────────────────────────────────────

  describe('GET /feeds/cal.ics', () => {
    it('empty database returns valid empty calendar', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/calendar');
      expect(response.body).toContain('BEGIN:VCALENDAR');
      expect(response.body).toContain('END:VCALENDAR');
      expect(response.body).not.toContain('BEGIN:VEVENT');
    });

    it('work item with dates is included as VEVENT', async () => {
      createTestWorkItem('Foundation Work', {
        startDate: '2026-03-20',
        endDate: '2026-04-10',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VEVENT');
      expect(response.body).toContain('SUMMARY:Foundation Work');
      expect(response.body).toContain('DTSTART');
      expect(response.body).toContain('DTEND');
    });

    it('work item without dates is excluded', async () => {
      createTestWorkItem('Undefined Work', {
        startDate: null,
        endDate: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('SUMMARY:Undefined Work');
    });

    it('actual dates take priority over planned dates', async () => {
      createTestWorkItem('Painting Work', {
        startDate: '2026-03-20',
        endDate: '2026-03-25',
        actualStartDate: '2026-03-25',
        actualEndDate: '2026-04-01',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Painting Work');
      // Should contain the actual dates
      expect(response.body).toContain('20260325');
      expect(response.body).toContain('20260401');
    });

    it('milestone appears as all-day event', async () => {
      createTestMilestone('Major Milestone', '2026-04-15');

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Major Milestone');
      expect(response.body).toContain('BEGIN:VEVENT');
    });

    it('completed milestone uses completedAt date instead of targetDate', async () => {
      createTestMilestone('Completed Milestone', '2026-04-15', {
        isCompleted: true,
        completedAt: '2026-04-10T14:30:00Z',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Completed Milestone');
      // completedAt truncated to date-only format (2026-04-10)
      expect(response.body).toContain('20260410');
    });

    it('household item with delivery dates is included with (Delivery) suffix', async () => {
      const categoryId = createHouseholdItemCategory('Furniture');
      createTestHouseholdItem('Couch', categoryId, {
        earliestDeliveryDate: '2026-05-01',
        latestDeliveryDate: '2026-05-10',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Couch (Delivery)');
      expect(response.body).toContain('BEGIN:VEVENT');
    });

    it('household item without delivery dates is excluded', async () => {
      const categoryId = createHouseholdItemCategory('Furniture');
      createTestHouseholdItem('Lamp', categoryId, {
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        targetDeliveryDate: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('SUMMARY:Lamp (Delivery)');
    });

    it('household item with only targetDeliveryDate is included', async () => {
      const categoryId = createHouseholdItemCategory('Fixtures');
      createTestHouseholdItem('Light Fixture', categoryId, {
        targetDeliveryDate: '2026-05-15',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Light Fixture (Delivery)');
    });

    it('household item with actual delivery date overrides earliest/latest', async () => {
      const categoryId = createHouseholdItemCategory('Appliances');
      createTestHouseholdItem('Refrigerator', categoryId, {
        earliestDeliveryDate: '2026-05-01',
        latestDeliveryDate: '2026-05-10',
        actualDeliveryDate: '2026-05-05T09:30:00Z',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Refrigerator (Delivery)');
      // Actual date should appear (truncated to 2026-05-05)
      expect(response.body).toContain('20260505');
    });

    it('ETag header is present in response', async () => {
      createTestWorkItem('Test Work', {
        startDate: '2026-03-20',
        endDate: '2026-03-25',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['etag']).toBeDefined();
      expect(typeof response.headers['etag']).toBe('string');
      expect(response.headers['etag']!.length).toBeGreaterThan(0);
    });

    it('returns 304 Not Modified when If-None-Match matches ETag', async () => {
      createTestWorkItem('Stable Work', {
        startDate: '2026-03-20',
        endDate: '2026-03-25',
      });

      // First request to get ETag
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(firstResponse.statusCode).toBe(200);
      const etag = firstResponse.headers['etag'];

      // Second request with If-None-Match
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
        headers: {
          'if-none-match': etag,
        },
      });

      expect(secondResponse.statusCode).toBe(304);
      expect(secondResponse.body).toBe('');
    });

    it('returns 200 when If-None-Match does not match ETag', async () => {
      createTestWorkItem('Changing Work', {
        startDate: '2026-03-20',
        endDate: '2026-03-25',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
        headers: {
          'if-none-match': 'different-etag-value',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VCALENDAR');
    });

    it('has correct Cache-Control header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('anonymous access does not require auth', async () => {
      createTestWorkItem('Public Work', {
        startDate: '2026-03-20',
        endDate: '2026-03-25',
      });

      // No cookie or auth header
      const response = await app.inject({
        method: 'GET',
        url: '/feeds/cal.ics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('SUMMARY:Public Work');
    });
  });

  // ─── CardDAV Tests ────────────────────────────────────────────────────────

  describe('GET /feeds/contacts.vcf', () => {
    it('empty vendor table returns empty vCard response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/vcard');
      expect(response.body).not.toContain('BEGIN:VCARD');
    });

    it('vendor with all fields is included in vCard', async () => {
      createTestVendor('ABC Contractors', {
        email: 'contact@abc.com',
        phone: '555-1234',
        address: '123 Main St, City, ST 12345',
        specialty: 'General Construction',
        notes: 'Licensed and insured',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VCARD');
      expect(response.body).toContain('ABC Contractors');
      expect(response.body).toContain('contact@abc.com');
      expect(response.body).toContain('555-1234');
      expect(response.body).toContain('123 Main St');
      expect(response.body).toContain('General Construction');
      expect(response.body).toContain('Licensed and insured');
    });

    it('vendor with only name is included', async () => {
      createTestVendor('Simple Vendor');

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VCARD');
      expect(response.body).toContain('Simple Vendor');
      expect(response.body).not.toContain('EMAIL:');
      expect(response.body).not.toContain('TEL:');
    });

    it('multiple vendors are separated in vCard response', async () => {
      createTestVendor('Vendor One', { email: 'vendor1@example.com' });
      createTestVendor('Vendor Two', { email: 'vendor2@example.com' });
      createTestVendor('Vendor Three', { email: 'vendor3@example.com' });

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      const vcardCount = (response.body.match(/BEGIN:VCARD/g) || []).length;
      expect(vcardCount).toBe(3);
      expect(response.body).toContain('Vendor One');
      expect(response.body).toContain('Vendor Two');
      expect(response.body).toContain('Vendor Three');
    });

    it('ETag header is present in response', async () => {
      createTestVendor('Tagged Vendor');

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['etag']).toBeDefined();
      expect(typeof response.headers['etag']).toBe('string');
      expect(response.headers['etag']!.length).toBeGreaterThan(0);
    });

    it('returns 304 Not Modified when If-None-Match matches ETag', async () => {
      createTestVendor('Stable Vendor');

      // First request to get ETag
      const firstResponse = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(firstResponse.statusCode).toBe(200);
      const etag = firstResponse.headers['etag'];

      // Second request with If-None-Match
      const secondResponse = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
        headers: {
          'if-none-match': etag,
        },
      });

      expect(secondResponse.statusCode).toBe(304);
      expect(secondResponse.body).toBe('');
    });

    it('returns 200 when If-None-Match does not match ETag', async () => {
      createTestVendor('Changing Vendor');

      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
        headers: {
          'if-none-match': 'wrong-etag-value',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VCARD');
    });

    it('has correct Cache-Control header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
    });

    it('anonymous access does not require auth', async () => {
      createTestVendor('Public Vendor');

      // No cookie or auth header
      const response = await app.inject({
        method: 'GET',
        url: '/feeds/contacts.vcf',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('BEGIN:VCARD');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as vendorContactService from './vendorContactService.js';
import { vendors, vendorContacts } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';

describe('vendorContactService', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-vendor-contact-service-test-'));
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

  let vendorOffset = 0;

  function createTestVendor(name = 'Test Vendor') {
    const id = `vendor-${Date.now()}-${vendorOffset++}`;
    const now = new Date().toISOString();
    app.db
      .insert(vendors)
      .values({ id, name, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  // ─── listContacts ──────────────────────────────────────────────────────────

  describe('listContacts', () => {
    it('returns empty array for vendor with no contacts', () => {
      const vendorId = createTestVendor();
      const contacts = vendorContactService.listContacts(app.db, vendorId);
      expect(contacts).toEqual([]);
    });

    it('throws NotFoundError for unknown vendorId', () => {
      expect(() =>
        vendorContactService.listContacts(app.db, 'does-not-exist'),
      ).toThrow('not found');
    });

    it('returns contacts ordered by createdAt', async () => {
      const vendorId = createTestVendor();
      vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });
      await new Promise((r) => setTimeout(r, 5));
      vendorContactService.createContact(app.db, vendorId, { name: 'Bob' });

      const contacts = vendorContactService.listContacts(app.db, vendorId);
      expect(contacts).toHaveLength(2);
      expect(contacts[0].name).toBe('Alice');
      expect(contacts[1].name).toBe('Bob');
    });
  });

  // ─── createContact ─────────────────────────────────────────────────────────

  describe('createContact', () => {
    it('creates and returns a contact with required name only', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, { name: 'Alice Smith' });

      expect(contact.id).toBeDefined();
      expect(contact.vendorId).toBe(vendorId);
      expect(contact.name).toBe('Alice Smith');
      expect(contact.role).toBeNull();
      expect(contact.phone).toBeNull();
      expect(contact.email).toBeNull();
      expect(contact.notes).toBeNull();
      expect(contact.createdAt).toBeDefined();
      expect(contact.updatedAt).toBeDefined();
    });

    it('creates a contact with all optional fields', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, {
        name: 'Bob Jones',
        role: 'Project Manager',
        phone: '555-1234',
        email: 'bob@example.com',
        notes: 'Main contact',
      });

      expect(contact.name).toBe('Bob Jones');
      expect(contact.role).toBe('Project Manager');
      expect(contact.phone).toBe('555-1234');
      expect(contact.email).toBe('bob@example.com');
      expect(contact.notes).toBe('Main contact');
    });

    it('throws NotFoundError for unknown vendorId', () => {
      expect(() =>
        vendorContactService.createContact(app.db, 'nonexistent', { name: 'Test' }),
      ).toThrow('not found');
    });

    it('throws ValidationError if name is empty string', () => {
      const vendorId = createTestVendor();
      expect(() =>
        vendorContactService.createContact(app.db, vendorId, { name: '' }),
      ).toThrow('between 1 and 200 characters');
    });

    it('throws ValidationError if name exceeds 200 characters', () => {
      const vendorId = createTestVendor();
      expect(() =>
        vendorContactService.createContact(app.db, vendorId, { name: 'A'.repeat(201) }),
      ).toThrow('between 1 and 200 characters');
    });

    it('trims whitespace from name', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, {
        name: '  Alice  ',
      });
      expect(contact.name).toBe('Alice');
    });

    it('throws ValidationError if name is only whitespace', () => {
      const vendorId = createTestVendor();
      expect(() =>
        vendorContactService.createContact(app.db, vendorId, { name: '   ' }),
      ).toThrow('between 1 and 200 characters');
    });

    it('persists to database (reachable via listContacts)', () => {
      const vendorId = createTestVendor();
      const created = vendorContactService.createContact(app.db, vendorId, { name: 'Charlie' });
      const listed = vendorContactService.listContacts(app.db, vendorId);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(created.id);
    });
  });

  // ─── updateContact ─────────────────────────────────────────────────────────

  describe('updateContact', () => {
    it('updates only provided fields', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, {
        name: 'Alice',
        role: 'Engineer',
        phone: '555-0000',
      });

      const updated = vendorContactService.updateContact(app.db, vendorId, contact.id, {
        phone: '555-9999',
      });

      expect(updated.name).toBe('Alice');
      expect(updated.role).toBe('Engineer');
      expect(updated.phone).toBe('555-9999');
    });

    it('throws NotFoundError for unknown contactId', () => {
      const vendorId = createTestVendor();
      expect(() =>
        vendorContactService.updateContact(app.db, vendorId, 'not-a-real-id', { name: 'X' }),
      ).toThrow('not found');
    });

    it('throws NotFoundError for unknown vendorId', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });
      expect(() =>
        vendorContactService.updateContact(app.db, 'not-a-real-vendor', contact.id, { name: 'X' }),
      ).toThrow('not found');
    });

    it('throws ValidationError if no fields provided', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });
      expect(() =>
        vendorContactService.updateContact(app.db, vendorId, contact.id, {}),
      ).toThrow('At least one field');
    });

    it('can null out optional fields', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, {
        name: 'Alice',
        role: 'Engineer',
      });

      const updated = vendorContactService.updateContact(app.db, vendorId, contact.id, {
        role: null,
      });
      expect(updated.role).toBeNull();
    });

    it('updates updatedAt timestamp', async () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });
      const originalUpdatedAt = contact.updatedAt;

      await new Promise((r) => setTimeout(r, 5));
      const updated = vendorContactService.updateContact(app.db, vendorId, contact.id, {
        name: 'Alice Updated',
      });

      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('throws NotFoundError if contact belongs to a different vendor', () => {
      const vendorId1 = createTestVendor('Vendor A');
      const vendorId2 = createTestVendor('Vendor B');
      const contact = vendorContactService.createContact(app.db, vendorId1, { name: 'Alice' });

      expect(() =>
        vendorContactService.updateContact(app.db, vendorId2, contact.id, { name: 'Alice' }),
      ).toThrow('not found');
    });
  });

  // ─── deleteContact ─────────────────────────────────────────────────────────

  describe('deleteContact', () => {
    it('removes contact and verifies deletion', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });

      vendorContactService.deleteContact(app.db, vendorId, contact.id);

      const remaining = vendorContactService.listContacts(app.db, vendorId);
      expect(remaining).toHaveLength(0);
    });

    it('throws NotFoundError for unknown contactId', () => {
      const vendorId = createTestVendor();
      expect(() =>
        vendorContactService.deleteContact(app.db, vendorId, 'not-real'),
      ).toThrow('not found');
    });

    it('throws NotFoundError for unknown vendorId', () => {
      const vendorId = createTestVendor();
      const contact = vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });
      expect(() =>
        vendorContactService.deleteContact(app.db, 'not-real-vendor', contact.id),
      ).toThrow('not found');
    });

    it('contact is cascade-deleted when vendor is deleted', () => {
      const vendorId = createTestVendor();
      vendorContactService.createContact(app.db, vendorId, { name: 'Alice' });
      vendorContactService.createContact(app.db, vendorId, { name: 'Bob' });

      // Delete vendor directly — cascade should remove contacts
      app.db.delete(vendors).where(eq(vendors.id, vendorId)).run();

      // Contacts should no longer exist in the DB
      const remaining = app.db
        .select()
        .from(vendorContacts)
        .where(eq(vendorContacts.vendorId, vendorId))
        .all();
      expect(remaining).toHaveLength(0);
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as vendorService from './vendorService.js';
import { NotFoundError, ValidationError, VendorInUseError } from '../errors/AppError.js';
import type { CreateVendorRequest, UpdateVendorRequest } from '@cornerstone/shared';

describe('Vendor Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /** Timestamp offset to ensure unique timestamps for ordering tests */
  let timestampOffset = 0;

  /**
   * Creates a fresh in-memory database with migrations applied.
   */
  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Insert a test user directly.
   */
  function createTestUser(email: string, displayName: string, id?: string) {
    const userId = id ?? `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  /**
   * Helper: Insert a vendor directly into the database.
   */
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
    const timestamp = new Date(Date.now() + timestampOffset).toISOString();
    timestampOffset += 1;

    db.insert(schema.vendors)
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
    db.insert(schema.invoices)
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
   * Helper: Link a vendor to a work item.
   */
  function createWorkItemVendorLink(workItemId: string, vendorId: string) {
    db.insert(schema.workItemVendors).values({ workItemId, vendorId }).run();
  }

  /**
   * Helper: Create a minimal work item for testing.
   */
  function createTestWorkItem(id?: string) {
    const workItemId = id ?? `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id: workItemId,
        title: 'Test Work Item',
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return workItemId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listVendors() ──────────────────────────────────────────────────────────

  describe('listVendors()', () => {
    it('returns empty list when no vendors exist', () => {
      const result = vendorService.listVendors(db, {});

      expect(result.vendors).toHaveLength(0);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('returns all vendors with default pagination', () => {
      createTestVendor('Acme Plumbing');
      createTestVendor('Best Electric');
      createTestVendor('Cool Roofing');

      const result = vendorService.listVendors(db, {});

      expect(result.vendors).toHaveLength(3);
      expect(result.pagination.totalItems).toBe(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(25);
    });

    it('returns all vendor fields', () => {
      const userId = createTestUser('creator@test.com', 'Creator User');
      createTestVendor('Smith Plumbing', {
        specialty: 'Plumbing',
        phone: '+1 555-1234',
        email: 'smith@plumbing.com',
        address: '123 Main St',
        notes: 'Reliable vendor',
        createdBy: userId,
      });

      const result = vendorService.listVendors(db, {});

      expect(result.vendors).toHaveLength(1);
      const vendor = result.vendors[0];
      expect(vendor.name).toBe('Smith Plumbing');
      expect(vendor.specialty).toBe('Plumbing');
      expect(vendor.phone).toBe('+1 555-1234');
      expect(vendor.email).toBe('smith@plumbing.com');
      expect(vendor.address).toBe('123 Main St');
      expect(vendor.notes).toBe('Reliable vendor');
      expect(vendor.createdBy).toBeDefined();
      expect(vendor.createdBy?.displayName).toBe('Creator User');
      expect(vendor.createdAt).toBeDefined();
      expect(vendor.updatedAt).toBeDefined();
    });

    it('returns createdBy as null when no user is set', () => {
      createTestVendor('Anonymous Vendor');

      const result = vendorService.listVendors(db, {});

      expect(result.vendors[0].createdBy).toBeNull();
    });

    it('sorts by name ascending by default', () => {
      createTestVendor('Zephyr Windows');
      createTestVendor('Acme Plumbing');
      createTestVendor('Marble Works');

      const result = vendorService.listVendors(db, {});

      expect(result.vendors[0].name).toBe('Acme Plumbing');
      expect(result.vendors[1].name).toBe('Marble Works');
      expect(result.vendors[2].name).toBe('Zephyr Windows');
    });

    it('sorts by name descending when sortOrder is desc', () => {
      createTestVendor('Acme Plumbing');
      createTestVendor('Zephyr Windows');

      const result = vendorService.listVendors(db, { sortBy: 'name', sortOrder: 'desc' });

      expect(result.vendors[0].name).toBe('Zephyr Windows');
      expect(result.vendors[1].name).toBe('Acme Plumbing');
    });

    it('sorts by specialty ascending', () => {
      createTestVendor('Vendor A', { specialty: 'Roofing' });
      createTestVendor('Vendor B', { specialty: 'Electrical' });
      createTestVendor('Vendor C', { specialty: 'Plumbing' });

      const result = vendorService.listVendors(db, { sortBy: 'specialty', sortOrder: 'asc' });

      expect(result.vendors[0].specialty).toBe('Electrical');
      expect(result.vendors[1].specialty).toBe('Plumbing');
      expect(result.vendors[2].specialty).toBe('Roofing');
    });

    it('sorts by created_at', () => {
      createTestVendor('First Vendor');
      createTestVendor('Second Vendor');
      createTestVendor('Third Vendor');

      const result = vendorService.listVendors(db, { sortBy: 'created_at', sortOrder: 'asc' });

      expect(result.vendors[0].name).toBe('First Vendor');
      expect(result.vendors[2].name).toBe('Third Vendor');
    });

    it('sorts by updated_at', () => {
      createTestVendor('Alpha Vendor');
      createTestVendor('Beta Vendor');

      const result = vendorService.listVendors(db, { sortBy: 'updated_at', sortOrder: 'desc' });

      // Beta was inserted later, so updated_at is later
      expect(result.vendors[0].name).toBe('Beta Vendor');
    });

    it('searches by name (case-insensitive)', () => {
      createTestVendor('Smith Plumbing');
      createTestVendor('Jones Electric');
      createTestVendor('SMITH Roofing');

      const result = vendorService.listVendors(db, { q: 'smith' });

      expect(result.vendors).toHaveLength(2);
      const names = result.vendors.map((v) => v.name);
      expect(names).toContain('Smith Plumbing');
      expect(names).toContain('SMITH Roofing');
    });

    it('searches by specialty (case-insensitive)', () => {
      createTestVendor('Vendor A', { specialty: 'Plumbing' });
      createTestVendor('Vendor B', { specialty: 'Electrical' });
      createTestVendor('Vendor C', { specialty: 'PLUMBING SPECIALIST' });

      const result = vendorService.listVendors(db, { q: 'plumbing' });

      expect(result.vendors).toHaveLength(2);
    });

    it('returns empty list when search finds no match', () => {
      createTestVendor('Acme Plumbing');
      createTestVendor('Best Electric');

      const result = vendorService.listVendors(db, { q: 'nonexistent' });

      expect(result.vendors).toHaveLength(0);
      expect(result.pagination.totalItems).toBe(0);
    });

    it('escapes SQL LIKE wildcards in search query', () => {
      createTestVendor('Acme % Plumbing');
      createTestVendor('Best Electric');

      // The "%" character should be treated as literal, not wildcard
      const result = vendorService.listVendors(db, { q: '%' });

      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0].name).toBe('Acme % Plumbing');
    });

    it('escapes SQL LIKE underscore wildcards in search query', () => {
      createTestVendor('Acme_Plumbing');
      createTestVendor('AcmeBPlumbing');

      const result = vendorService.listVendors(db, { q: 'Acme_Plumbing' });

      // Should match only the literal underscore, not "AcmeBPlumbing"
      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0].name).toBe('Acme_Plumbing');
    });

    it('paginates results correctly — page 1', () => {
      for (let i = 1; i <= 10; i++) {
        createTestVendor(`Vendor ${i.toString().padStart(2, '0')}`);
      }

      const result = vendorService.listVendors(db, { page: 1, pageSize: 3 });

      expect(result.vendors).toHaveLength(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.pageSize).toBe(3);
      expect(result.pagination.totalItems).toBe(10);
      expect(result.pagination.totalPages).toBe(4);
    });

    it('paginates results correctly — page 2', () => {
      for (let i = 1; i <= 10; i++) {
        createTestVendor(`Vendor ${i.toString().padStart(2, '0')}`);
      }

      const result = vendorService.listVendors(db, { page: 2, pageSize: 3 });

      expect(result.vendors).toHaveLength(3);
      expect(result.pagination.page).toBe(2);
      expect(result.vendors[0].name).toBe('Vendor 04');
    });

    it('returns last page with fewer items when total is not divisible by pageSize', () => {
      for (let i = 1; i <= 7; i++) {
        createTestVendor(`Vendor ${i.toString().padStart(2, '0')}`);
      }

      const result = vendorService.listVendors(db, { page: 3, pageSize: 3 });

      expect(result.vendors).toHaveLength(1);
      expect(result.pagination.totalItems).toBe(7);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('clamps page to minimum of 1 when 0 is passed', () => {
      createTestVendor('Vendor A');

      const result = vendorService.listVendors(db, { page: 0 });

      expect(result.pagination.page).toBe(1);
    });

    it('clamps pageSize to maximum of 100', () => {
      const result = vendorService.listVendors(db, { pageSize: 999 });

      expect(result.pagination.pageSize).toBe(100);
    });

    it('clamps pageSize to minimum of 1', () => {
      const result = vendorService.listVendors(db, { pageSize: 0 });

      expect(result.pagination.pageSize).toBe(1);
    });

    it('defaults page to 1 when not provided', () => {
      const result = vendorService.listVendors(db, {});

      expect(result.pagination.page).toBe(1);
    });

    it('defaults pageSize to 25 when not provided', () => {
      const result = vendorService.listVendors(db, {});

      expect(result.pagination.pageSize).toBe(25);
    });

    it('combines search with pagination', () => {
      for (let i = 1; i <= 5; i++) {
        createTestVendor(`Plumbing Co ${i}`);
      }
      createTestVendor('Electric Co');

      const result = vendorService.listVendors(db, { q: 'Plumbing', page: 1, pageSize: 2 });

      expect(result.vendors).toHaveLength(2);
      expect(result.pagination.totalItems).toBe(5);
      expect(result.pagination.totalPages).toBe(3);
    });
  });

  // ─── getVendorById() ────────────────────────────────────────────────────────

  describe('getVendorById()', () => {
    it('returns a vendor by ID', () => {
      const vendor = createTestVendor('Test Vendor', { specialty: 'Roofing' });

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.id).toBe(vendor.id);
      expect(result.name).toBe('Test Vendor');
      expect(result.specialty).toBe('Roofing');
    });

    it('throws NotFoundError when vendor does not exist', () => {
      expect(() => {
        vendorService.getVendorById(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        vendorService.getVendorById(db, 'non-existent-id');
      }).toThrow('Vendor not found');
    });

    it('includes invoiceCount of 0 when vendor has no invoices', () => {
      const vendor = createTestVendor('No Invoices Vendor');

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.invoiceCount).toBe(0);
      expect(result.outstandingBalance).toBe(0);
    });

    it('includes correct invoiceCount when vendor has invoices', () => {
      const vendor = createTestVendor('Multi Invoice Vendor');
      createTestInvoice(vendor.id, 'pending', 500);
      createTestInvoice(vendor.id, 'paid', 300);
      createTestInvoice(vendor.id, 'overdue', 200);

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.invoiceCount).toBe(3);
    });

    it('calculates outstandingBalance as sum of pending + overdue invoices', () => {
      const vendor = createTestVendor('Balance Vendor');
      createTestInvoice(vendor.id, 'pending', 500);
      createTestInvoice(vendor.id, 'overdue', 300);
      createTestInvoice(vendor.id, 'paid', 1000); // paid — should NOT count

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.outstandingBalance).toBe(800);
      expect(result.invoiceCount).toBe(3);
    });

    it('outstandingBalance is 0 when all invoices are paid', () => {
      const vendor = createTestVendor('Paid Up Vendor');
      createTestInvoice(vendor.id, 'paid', 999);
      createTestInvoice(vendor.id, 'paid', 500);

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.outstandingBalance).toBe(0);
    });

    it('returns all optional fields including null values', () => {
      const vendor = createTestVendor('Sparse Vendor');

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.specialty).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
      expect(result.address).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.createdBy).toBeNull();
    });

    it('resolves createdBy to user summary', () => {
      const userId = createTestUser('owner@test.com', 'Owner User');
      const vendor = createTestVendor('Owned Vendor', { createdBy: userId });

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(userId);
      expect(result.createdBy?.displayName).toBe('Owner User');
      expect(result.createdBy?.email).toBe('owner@test.com');
    });

    it('stats are isolated per vendor (no cross-contamination)', () => {
      const vendor1 = createTestVendor('Vendor One');
      const vendor2 = createTestVendor('Vendor Two');
      createTestInvoice(vendor1.id, 'pending', 1000);
      createTestInvoice(vendor2.id, 'pending', 500);

      const result = vendorService.getVendorById(db, vendor1.id);

      expect(result.invoiceCount).toBe(1);
      expect(result.outstandingBalance).toBe(1000);
    });
  });

  // ─── createVendor() ─────────────────────────────────────────────────────────

  describe('createVendor()', () => {
    it('creates a vendor with name only', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: 'New Vendor' };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('New Vendor');
      expect(result.specialty).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
      expect(result.address).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a vendor with all fields', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = {
        name: 'Full Vendor',
        specialty: 'Plumbing',
        phone: '+1 555-0001',
        email: 'full@vendor.com',
        address: '100 Oak Ave, Springfield IL',
        notes: 'Best vendor in town',
      };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.name).toBe('Full Vendor');
      expect(result.specialty).toBe('Plumbing');
      expect(result.phone).toBe('+1 555-0001');
      expect(result.email).toBe('full@vendor.com');
      expect(result.address).toBe('100 Oak Ave, Springfield IL');
      expect(result.notes).toBe('Best vendor in town');
    });

    it('trims name whitespace before storing', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: '  Trimmed Vendor  ' };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.name).toBe('Trimmed Vendor');
    });

    it('sets createdBy to the provided userId', () => {
      const userId = createTestUser('creator@test.com', 'Creator User');
      const data: CreateVendorRequest = { name: 'Owned Vendor' };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(userId);
    });

    it('persists vendor to the database', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: 'Persisted Vendor' };

      const created = vendorService.createVendor(db, data, userId);
      const fetched = vendorService.getVendorById(db, created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Persisted Vendor');
    });

    it('vendor appears in list after creation', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: 'Listed Vendor' };

      vendorService.createVendor(db, data, userId);
      const list = vendorService.listVendors(db, {});

      const found = list.vendors.find((v) => v.name === 'Listed Vendor');
      expect(found).toBeDefined();
    });

    it('throws ValidationError for empty name', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: '' };

      expect(() => {
        vendorService.createVendor(db, data, userId);
      }).toThrow(ValidationError);
      expect(() => {
        vendorService.createVendor(db, data, userId);
      }).toThrow('Vendor name must be between 1 and 200 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: '   ' };

      expect(() => {
        vendorService.createVendor(db, data, userId);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: 'a'.repeat(201) };

      expect(() => {
        vendorService.createVendor(db, data, userId);
      }).toThrow(ValidationError);
      expect(() => {
        vendorService.createVendor(db, data, userId);
      }).toThrow('Vendor name must be between 1 and 200 characters');
    });

    it('accepts name with exactly 200 characters', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const name = 'X'.repeat(200);
      const data: CreateVendorRequest = { name };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.name).toBe(name);
    });

    it('stores null for optional fields when not provided', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: 'Minimal Vendor' };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.specialty).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
      expect(result.address).toBeNull();
      expect(result.notes).toBeNull();
    });

    it('allows multiple vendors with the same name (vendors are not unique by name)', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const data: CreateVendorRequest = { name: 'Duplicate Vendor' };

      // Both should succeed — no uniqueness constraint on vendor name
      const v1 = vendorService.createVendor(db, data, userId);
      const v2 = vendorService.createVendor(db, data, userId);

      expect(v1.id).not.toBe(v2.id);
      expect(v1.name).toBe('Duplicate Vendor');
      expect(v2.name).toBe('Duplicate Vendor');
    });

    it('generates unique IDs for each vendor', () => {
      const userId = createTestUser('creator@test.com', 'Creator');

      const v1 = vendorService.createVendor(db, { name: 'Vendor One' }, userId);
      const v2 = vendorService.createVendor(db, { name: 'Vendor Two' }, userId);

      expect(v1.id).toBeDefined();
      expect(v2.id).toBeDefined();
      expect(v1.id).not.toBe(v2.id);
    });
  });

  // ─── updateVendor() ─────────────────────────────────────────────────────────

  describe('updateVendor()', () => {
    it('updates the name of an existing vendor', () => {
      const vendor = createTestVendor('Old Name');

      const result = vendorService.updateVendor(db, vendor.id, { name: 'New Name' });

      expect(result.id).toBe(vendor.id);
      expect(result.name).toBe('New Name');
    });

    it('returns VendorDetail shape with invoiceCount and outstandingBalance', () => {
      const vendor = createTestVendor('Invoice Vendor');
      createTestInvoice(vendor.id, 'pending', 750);

      const result = vendorService.updateVendor(db, vendor.id, { name: 'Updated Invoice Vendor' });

      expect(result.invoiceCount).toBe(1);
      expect(result.outstandingBalance).toBe(750);
    });

    it('updates specialty only (partial update)', () => {
      const vendor = createTestVendor('Partial Vendor', {
        specialty: 'Roofing',
        phone: '555-1234',
      });

      const result = vendorService.updateVendor(db, vendor.id, { specialty: 'Electrical' });

      expect(result.name).toBe('Partial Vendor');
      expect(result.specialty).toBe('Electrical');
      expect(result.phone).toBe('555-1234');
    });

    it('updates phone only', () => {
      const vendor = createTestVendor('Phone Vendor', { phone: '555-0000' });

      const result = vendorService.updateVendor(db, vendor.id, { phone: '555-9999' });

      expect(result.phone).toBe('555-9999');
      expect(result.name).toBe('Phone Vendor');
    });

    it('updates email only', () => {
      const vendor = createTestVendor('Email Vendor', { email: 'old@email.com' });

      const result = vendorService.updateVendor(db, vendor.id, { email: 'new@email.com' });

      expect(result.email).toBe('new@email.com');
    });

    it('updates address only', () => {
      const vendor = createTestVendor('Address Vendor', { address: 'Old Address' });

      const result = vendorService.updateVendor(db, vendor.id, { address: 'New Address' });

      expect(result.address).toBe('New Address');
    });

    it('updates notes only', () => {
      const vendor = createTestVendor('Notes Vendor', { notes: 'Old notes' });

      const result = vendorService.updateVendor(db, vendor.id, { notes: 'New notes' });

      expect(result.notes).toBe('New notes');
    });

    it('clears specialty by setting to null', () => {
      const vendor = createTestVendor('Specialty Vendor', { specialty: 'Plumbing' });

      const result = vendorService.updateVendor(db, vendor.id, { specialty: null });

      expect(result.specialty).toBeNull();
    });

    it('clears phone by setting to null', () => {
      const vendor = createTestVendor('Phone Clear Vendor', { phone: '555-1111' });

      const result = vendorService.updateVendor(db, vendor.id, { phone: null });

      expect(result.phone).toBeNull();
    });

    it('updates multiple fields at once', () => {
      const vendor = createTestVendor('Multi Update Vendor', {
        specialty: 'Old Specialty',
        phone: '555-0000',
      });

      const result = vendorService.updateVendor(db, vendor.id, {
        name: 'Updated Multi Vendor',
        specialty: 'New Specialty',
        phone: '555-9999',
        email: 'multi@vendor.com',
      });

      expect(result.name).toBe('Updated Multi Vendor');
      expect(result.specialty).toBe('New Specialty');
      expect(result.phone).toBe('555-9999');
      expect(result.email).toBe('multi@vendor.com');
    });

    it('trims name before updating', () => {
      const vendor = createTestVendor('Trim Me Vendor');

      const result = vendorService.updateVendor(db, vendor.id, { name: '  Updated Name  ' });

      expect(result.name).toBe('Updated Name');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const vendor = createTestVendor('Timestamp Vendor');

      await new Promise((resolve) => setTimeout(resolve, 2));

      const result = vendorService.updateVendor(db, vendor.id, {
        name: 'Updated Timestamp Vendor',
      });

      expect(result.updatedAt).not.toBe(vendor.updatedAt);
    });

    it('throws NotFoundError when vendor does not exist', () => {
      const data: UpdateVendorRequest = { name: 'Updated' };

      expect(() => {
        vendorService.updateVendor(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);
      expect(() => {
        vendorService.updateVendor(db, 'non-existent-id', data);
      }).toThrow('Vendor not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const vendor = createTestVendor('Empty Update Vendor');

      expect(() => {
        vendorService.updateVendor(db, vendor.id, {});
      }).toThrow(ValidationError);
      expect(() => {
        vendorService.updateVendor(db, vendor.id, {});
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name', () => {
      const vendor = createTestVendor('Empty Name Vendor');

      expect(() => {
        vendorService.updateVendor(db, vendor.id, { name: '' });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name', () => {
      const vendor = createTestVendor('Whitespace Name Vendor');

      expect(() => {
        vendorService.updateVendor(db, vendor.id, { name: '   ' });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const vendor = createTestVendor('Long Name Vendor');

      expect(() => {
        vendorService.updateVendor(db, vendor.id, { name: 'a'.repeat(201) });
      }).toThrow(ValidationError);
    });

    it('allows updating name to the same value', () => {
      const vendor = createTestVendor('Same Name Vendor');

      const result = vendorService.updateVendor(db, vendor.id, { name: 'Same Name Vendor' });

      expect(result.name).toBe('Same Name Vendor');
    });

    it('persists updates to the database', () => {
      const vendor = createTestVendor('Persisted Update Vendor');

      vendorService.updateVendor(db, vendor.id, { name: 'Updated And Persisted' });
      const fetched = vendorService.getVendorById(db, vendor.id);

      expect(fetched.name).toBe('Updated And Persisted');
    });
  });

  // ─── deleteVendor() ─────────────────────────────────────────────────────────

  describe('deleteVendor()', () => {
    it('deletes a vendor successfully', () => {
      const vendor = createTestVendor('Delete Me Vendor');

      vendorService.deleteVendor(db, vendor.id);

      expect(() => {
        vendorService.getVendorById(db, vendor.id);
      }).toThrow(NotFoundError);
    });

    it('vendor no longer appears in list after deletion', () => {
      const vendor = createTestVendor('Remove From List Vendor');
      createTestVendor('Keep This Vendor');

      const countBefore = vendorService.listVendors(db, {}).pagination.totalItems;
      vendorService.deleteVendor(db, vendor.id);
      const result = vendorService.listVendors(db, {});

      expect(result.pagination.totalItems).toBe(countBefore - 1);
      expect(result.vendors.find((v) => v.id === vendor.id)).toBeUndefined();
    });

    it('throws NotFoundError when vendor does not exist', () => {
      expect(() => {
        vendorService.deleteVendor(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        vendorService.deleteVendor(db, 'non-existent-id');
      }).toThrow('Vendor not found');
    });

    it('throws VendorInUseError when vendor has invoices', () => {
      const vendor = createTestVendor('Invoice Blocked Vendor');
      createTestInvoice(vendor.id);

      expect(() => {
        vendorService.deleteVendor(db, vendor.id);
      }).toThrow(VendorInUseError);
      expect(() => {
        vendorService.deleteVendor(db, vendor.id);
      }).toThrow('Vendor is in use and cannot be deleted');
    });

    it('throws VendorInUseError when vendor is linked to work items', () => {
      const vendor = createTestVendor('WorkItem Blocked Vendor');
      const workItemId = createTestWorkItem();
      createWorkItemVendorLink(workItemId, vendor.id);

      expect(() => {
        vendorService.deleteVendor(db, vendor.id);
      }).toThrow(VendorInUseError);
    });

    it('VendorInUseError includes invoiceCount in details', () => {
      const vendor = createTestVendor('Invoice Count Vendor');
      createTestInvoice(vendor.id);
      createTestInvoice(vendor.id);

      let thrown: VendorInUseError | null = null;
      try {
        vendorService.deleteVendor(db, vendor.id);
      } catch (err) {
        if (err instanceof VendorInUseError) {
          thrown = err;
        }
      }

      expect(thrown).not.toBeNull();
      expect(thrown?.details?.invoiceCount).toBe(2);
      expect(thrown?.details?.workItemCount).toBe(0);
    });

    it('VendorInUseError includes workItemCount in details', () => {
      const vendor = createTestVendor('WorkItem Count Vendor');
      const wi1 = createTestWorkItem();
      const wi2 = createTestWorkItem();
      createWorkItemVendorLink(wi1, vendor.id);
      createWorkItemVendorLink(wi2, vendor.id);

      let thrown: VendorInUseError | null = null;
      try {
        vendorService.deleteVendor(db, vendor.id);
      } catch (err) {
        if (err instanceof VendorInUseError) {
          thrown = err;
        }
      }

      expect(thrown).not.toBeNull();
      expect(thrown?.details?.invoiceCount).toBe(0);
      expect(thrown?.details?.workItemCount).toBe(2);
    });

    it('VendorInUseError has code VENDOR_IN_USE and statusCode 409', () => {
      const vendor = createTestVendor('Code Check Vendor');
      createTestInvoice(vendor.id);

      let thrown: VendorInUseError | null = null;
      try {
        vendorService.deleteVendor(db, vendor.id);
      } catch (err) {
        if (err instanceof VendorInUseError) {
          thrown = err;
        }
      }

      expect(thrown?.code).toBe('VENDOR_IN_USE');
      expect(thrown?.statusCode).toBe(409);
    });

    it('VendorInUseError when both invoices and work items reference vendor', () => {
      const vendor = createTestVendor('Both References Vendor');
      createTestInvoice(vendor.id);
      const wi = createTestWorkItem();
      createWorkItemVendorLink(wi, vendor.id);

      let thrown: VendorInUseError | null = null;
      try {
        vendorService.deleteVendor(db, vendor.id);
      } catch (err) {
        if (err instanceof VendorInUseError) {
          thrown = err;
        }
      }

      expect(thrown).not.toBeNull();
      expect(thrown?.details?.invoiceCount).toBe(1);
      expect(thrown?.details?.workItemCount).toBe(1);
    });

    it('can delete a vendor that has paid invoices only (no — invoices block regardless of status)', () => {
      // The service blocks deletion if invoiceCount > 0, regardless of invoice status.
      // Paid invoices still count.
      const vendor = createTestVendor('Paid Invoice Vendor');
      createTestInvoice(vendor.id, 'paid', 500);

      expect(() => {
        vendorService.deleteVendor(db, vendor.id);
      }).toThrow(VendorInUseError);
    });

    it('can delete a vendor not referenced by any invoice or work item', () => {
      const vendor1 = createTestVendor('Safe To Delete Vendor');
      const vendor2 = createTestVendor('Busy Vendor');
      createTestInvoice(vendor2.id);

      // vendor1 should be deletable
      vendorService.deleteVendor(db, vendor1.id);

      expect(() => {
        vendorService.getVendorById(db, vendor1.id);
      }).toThrow(NotFoundError);
    });
  });
});

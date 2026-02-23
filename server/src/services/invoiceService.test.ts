import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceService from './invoiceService.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

describe('Invoice Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  /** Timestamp offset to ensure unique timestamps for ordering tests */
  let timestampOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Insert a test user.
   */
  function createTestUser(email: string, displayName: string): string {
    const id = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Helper: Insert a vendor and return its ID.
   */
  function createTestVendor(name: string): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset).toISOString();
    timestampOffset += 1;

    db.insert(schema.vendors)
      .values({
        id,
        name,
        specialty: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  /**
   * Helper: Insert an invoice directly into the database (bypassing service validation).
   */
  function insertRawInvoice(
    vendorId: string,
    options: {
      invoiceNumber?: string | null;
      amount?: number;
      date?: string;
      dueDate?: string | null;
      status?: 'pending' | 'paid' | 'claimed';
      notes?: string | null;
      createdBy?: string | null;
    } = {},
  ): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset).toISOString();
    timestampOffset += 1;

    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: options.invoiceNumber ?? null,
        amount: options.amount ?? 1000,
        date: options.date ?? '2026-01-01',
        dueDate: options.dueDate ?? null,
        status: options.status ?? 'pending',
        notes: options.notes ?? null,
        createdBy: options.createdBy ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
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

  // ─── listInvoices() ─────────────────────────────────────────────────────────

  describe('listInvoices()', () => {
    it('returns an empty array when vendor has no invoices', () => {
      const vendorId = createTestVendor('Empty Vendor');

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result).toHaveLength(0);
    });

    it('throws NotFoundError when vendor does not exist', () => {
      expect(() => {
        invoiceService.listInvoices(db, 'non-existent-vendor-id');
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.listInvoices(db, 'non-existent-vendor-id');
      }).toThrow('Vendor not found');
    });

    it('returns all invoices for the given vendor', () => {
      const vendorId = createTestVendor('Multi Invoice Vendor');
      insertRawInvoice(vendorId, { date: '2026-01-01' });
      insertRawInvoice(vendorId, { date: '2026-01-02' });
      insertRawInvoice(vendorId, { date: '2026-01-03' });

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result).toHaveLength(3);
    });

    it('returns invoices sorted by date descending (most recent first)', () => {
      const vendorId = createTestVendor('Sorted Vendor');
      insertRawInvoice(vendorId, { date: '2026-01-01', amount: 100 });
      insertRawInvoice(vendorId, { date: '2026-03-01', amount: 300 });
      insertRawInvoice(vendorId, { date: '2026-02-01', amount: 200 });

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result[0].date).toBe('2026-03-01');
      expect(result[1].date).toBe('2026-02-01');
      expect(result[2].date).toBe('2026-01-01');
    });

    it('only returns invoices belonging to the specified vendor', () => {
      const vendor1Id = createTestVendor('Vendor One');
      const vendor2Id = createTestVendor('Vendor Two');
      insertRawInvoice(vendor1Id, { amount: 500 });
      insertRawInvoice(vendor2Id, { amount: 999 });

      const result = invoiceService.listInvoices(db, vendor1Id);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(500);
    });

    it('returns all invoice fields correctly', () => {
      const vendorId = createTestVendor('Full Fields Vendor');
      const userId = createTestUser('creator@test.com', 'Creator User');
      insertRawInvoice(vendorId, {
        invoiceNumber: 'INV-001',
        amount: 1500.5,
        date: '2026-02-15',
        dueDate: '2026-03-15',
        status: 'paid',
        notes: 'Final payment',
        createdBy: userId,
      });

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result).toHaveLength(1);
      const invoice = result[0];
      expect(invoice.id).toBeDefined();
      expect(invoice.vendorId).toBe(vendorId);
      expect(invoice.invoiceNumber).toBe('INV-001');
      expect(invoice.amount).toBe(1500.5);
      expect(invoice.date).toBe('2026-02-15');
      expect(invoice.dueDate).toBe('2026-03-15');
      expect(invoice.status).toBe('paid');
      expect(invoice.notes).toBe('Final payment');
      expect(invoice.createdAt).toBeDefined();
      expect(invoice.updatedAt).toBeDefined();
    });

    it('resolves createdBy to UserSummary shape', () => {
      const vendorId = createTestVendor('Creator Vendor');
      const userId = createTestUser('owner@test.com', 'Owner User');
      insertRawInvoice(vendorId, { createdBy: userId });

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result[0].createdBy).not.toBeNull();
      expect(result[0].createdBy?.id).toBe(userId);
      expect(result[0].createdBy?.displayName).toBe('Owner User');
      expect(result[0].createdBy?.email).toBe('owner@test.com');
    });

    it('returns createdBy as null when no user is set', () => {
      const vendorId = createTestVendor('No Creator Vendor');
      insertRawInvoice(vendorId, { createdBy: null });

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result[0].createdBy).toBeNull();
    });

    it('returns null for optional fields (invoiceNumber, dueDate, notes) when not set', () => {
      const vendorId = createTestVendor('Sparse Invoice Vendor');
      insertRawInvoice(vendorId, {
        invoiceNumber: null,
        dueDate: null,
        notes: null,
      });

      const result = invoiceService.listInvoices(db, vendorId);

      expect(result[0].invoiceNumber).toBeNull();
      expect(result[0].dueDate).toBeNull();
      expect(result[0].notes).toBeNull();
    });
  });

  // ─── createInvoice() ────────────────────────────────────────────────────────

  describe('createInvoice()', () => {
    it('creates an invoice with required fields only', () => {
      const vendorId = createTestVendor('Create Vendor');
      const userId = createTestUser('user@test.com', 'Test User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 1000, date: '2026-01-15' },
        userId,
      );

      expect(result.id).toBeDefined();
      expect(result.vendorId).toBe(vendorId);
      expect(result.amount).toBe(1000);
      expect(result.date).toBe('2026-01-15');
      expect(result.status).toBe('pending'); // default
      expect(result.invoiceNumber).toBeNull();
      expect(result.dueDate).toBeNull();
      expect(result.notes).toBeNull();
    });

    it('creates an invoice with all optional fields', () => {
      const vendorId = createTestVendor('Full Invoice Vendor');
      const userId = createTestUser('user@test.com', 'Test User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        {
          invoiceNumber: 'INV-042',
          amount: 2500.75,
          date: '2026-03-01',
          dueDate: '2026-04-01',
          status: 'paid',
          notes: 'Payment received',
        },
        userId,
      );

      expect(result.invoiceNumber).toBe('INV-042');
      expect(result.amount).toBe(2500.75);
      expect(result.date).toBe('2026-03-01');
      expect(result.dueDate).toBe('2026-04-01');
      expect(result.status).toBe('paid');
      expect(result.notes).toBe('Payment received');
    });

    it('defaults status to "pending" when not provided', () => {
      const vendorId = createTestVendor('Default Status Vendor');
      const userId = createTestUser('user@test.com', 'Test User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 500, date: '2026-01-01' },
        userId,
      );

      expect(result.status).toBe('pending');
    });

    it('sets createdBy to the provided userId', () => {
      const vendorId = createTestVendor('CreatedBy Vendor');
      const userId = createTestUser('creator@test.com', 'Creator User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 100, date: '2026-01-01' },
        userId,
      );

      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(userId);
      expect(result.createdBy?.displayName).toBe('Creator User');
    });

    it('persists the invoice so it appears in listInvoices', () => {
      const vendorId = createTestVendor('Persist Vendor');
      const userId = createTestUser('user@test.com', 'User');

      const created = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 999, date: '2026-01-01' },
        userId,
      );
      const list = invoiceService.listInvoices(db, vendorId);

      expect(list.find((inv) => inv.id === created.id)).toBeDefined();
    });

    it('generates a unique ID for each invoice', () => {
      const vendorId = createTestVendor('Unique ID Vendor');
      const userId = createTestUser('user@test.com', 'User');

      const inv1 = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 100, date: '2026-01-01' },
        userId,
      );
      const inv2 = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 200, date: '2026-01-01' },
        userId,
      );

      expect(inv1.id).toBeDefined();
      expect(inv2.id).toBeDefined();
      expect(inv1.id).not.toBe(inv2.id);
    });

    it('throws NotFoundError when vendor does not exist', () => {
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(
          db,
          'non-existent-vendor-id',
          { amount: 100, date: '2026-01-01' },
          userId,
        );
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.createInvoice(
          db,
          'non-existent-vendor-id',
          { amount: 100, date: '2026-01-01' },
          userId,
        );
      }).toThrow('Vendor not found');
    });

    it('throws ValidationError when amount is 0', () => {
      const vendorId = createTestVendor('Amount Zero Vendor');
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(db, vendorId, { amount: 0, date: '2026-01-01' }, userId);
      }).toThrow(ValidationError);
      expect(() => {
        invoiceService.createInvoice(db, vendorId, { amount: 0, date: '2026-01-01' }, userId);
      }).toThrow('Amount must be greater than 0');
    });

    it('throws ValidationError when amount is negative', () => {
      const vendorId = createTestVendor('Negative Amount Vendor');
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(db, vendorId, { amount: -100, date: '2026-01-01' }, userId);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid date format (not ISO YYYY-MM-DD)', () => {
      const vendorId = createTestVendor('Bad Date Vendor');
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(
          db,
          vendorId,
          { amount: 100, date: '01-15-2026' }, // MM-DD-YYYY
          userId,
        );
      }).toThrow(ValidationError);
      expect(() => {
        invoiceService.createInvoice(db, vendorId, { amount: 100, date: '01-15-2026' }, userId);
      }).toThrow('Date must be a valid ISO date (YYYY-MM-DD)');
    });

    it('throws ValidationError for date that is not a real calendar date', () => {
      const vendorId = createTestVendor('Invalid Calendar Date Vendor');
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(
          db,
          vendorId,
          { amount: 100, date: '2026-13-01' }, // month 13
          userId,
        );
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when dueDate has invalid format', () => {
      const vendorId = createTestVendor('Bad DueDate Vendor');
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(
          db,
          vendorId,
          { amount: 100, date: '2026-01-01', dueDate: 'not-a-date' },
          userId,
        );
      }).toThrow(ValidationError);
      expect(() => {
        invoiceService.createInvoice(
          db,
          vendorId,
          { amount: 100, date: '2026-01-01', dueDate: 'not-a-date' },
          userId,
        );
      }).toThrow('Due date must be a valid ISO date (YYYY-MM-DD)');
    });

    it('throws ValidationError when dueDate is before date', () => {
      const vendorId = createTestVendor('DueDate Before Date Vendor');
      const userId = createTestUser('user@test.com', 'User');

      expect(() => {
        invoiceService.createInvoice(
          db,
          vendorId,
          { amount: 100, date: '2026-03-01', dueDate: '2026-02-01' },
          userId,
        );
      }).toThrow(ValidationError);
      expect(() => {
        invoiceService.createInvoice(
          db,
          vendorId,
          { amount: 100, date: '2026-03-01', dueDate: '2026-02-01' },
          userId,
        );
      }).toThrow('Due date must be on or after the invoice date');
    });

    it('accepts dueDate equal to date (same-day payment)', () => {
      const vendorId = createTestVendor('Same Day Vendor');
      const userId = createTestUser('user@test.com', 'User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 100, date: '2026-03-15', dueDate: '2026-03-15' },
        userId,
      );

      expect(result.date).toBe('2026-03-15');
      expect(result.dueDate).toBe('2026-03-15');
    });

    it('accepts dueDate after date', () => {
      const vendorId = createTestVendor('Future DueDate Vendor');
      const userId = createTestUser('user@test.com', 'User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 100, date: '2026-01-01', dueDate: '2026-01-30' },
        userId,
      );

      expect(result.dueDate).toBe('2026-01-30');
    });

    it('stores dueDate as null when explicitly passed as null', () => {
      const vendorId = createTestVendor('Null DueDate Vendor');
      const userId = createTestUser('user@test.com', 'User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 100, date: '2026-01-01', dueDate: null },
        userId,
      );

      expect(result.dueDate).toBeNull();
    });

    it('accepts claimed status on creation', () => {
      const vendorId = createTestVendor('Claimed Vendor');
      const userId = createTestUser('user@test.com', 'User');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        { amount: 500, date: '2025-01-01', status: 'claimed' },
        userId,
      );

      expect(result.status).toBe('claimed');
    });
  });

  // ─── updateInvoice() ────────────────────────────────────────────────────────

  describe('updateInvoice()', () => {
    it('updates the amount of an existing invoice', () => {
      const vendorId = createTestVendor('Update Amount Vendor');
      createTestUser('user@test.com', 'User');
      const invoiceId = insertRawInvoice(vendorId, { amount: 1000 });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: 2000 });

      expect(result.id).toBe(invoiceId);
      expect(result.amount).toBe(2000);
    });

    it('updates the status of an existing invoice', () => {
      const vendorId = createTestVendor('Update Status Vendor');
      const invoiceId = insertRawInvoice(vendorId, { status: 'pending' });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, { status: 'paid' });

      expect(result.status).toBe('paid');
    });

    it('updates the date of an invoice', () => {
      const vendorId = createTestVendor('Update Date Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-01-01' });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, {
        date: '2026-06-01',
      });

      expect(result.date).toBe('2026-06-01');
    });

    it('updates the dueDate of an invoice', () => {
      const vendorId = createTestVendor('Update DueDate Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-01-01', dueDate: null });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, {
        dueDate: '2026-02-01',
      });

      expect(result.dueDate).toBe('2026-02-01');
    });

    it('clears dueDate by setting to null', () => {
      const vendorId = createTestVendor('Clear DueDate Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-01-01', dueDate: '2026-02-01' });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, { dueDate: null });

      expect(result.dueDate).toBeNull();
    });

    it('updates the invoiceNumber of an invoice', () => {
      const vendorId = createTestVendor('Update InvNum Vendor');
      const invoiceId = insertRawInvoice(vendorId, { invoiceNumber: 'INV-001' });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, {
        invoiceNumber: 'INV-002',
      });

      expect(result.invoiceNumber).toBe('INV-002');
    });

    it('updates the notes of an invoice', () => {
      const vendorId = createTestVendor('Update Notes Vendor');
      const invoiceId = insertRawInvoice(vendorId, { notes: 'Old notes' });

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, {
        notes: 'New notes',
      });

      expect(result.notes).toBe('New notes');
    });

    it('performs a partial update — does not touch fields not provided', () => {
      const vendorId = createTestVendor('Partial Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, {
        invoiceNumber: 'INV-001',
        amount: 1000,
        status: 'pending',
        notes: 'Keep this note',
      });

      // Only update amount
      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: 2000 });

      expect(result.invoiceNumber).toBe('INV-001');
      expect(result.amount).toBe(2000);
      expect(result.status).toBe('pending');
      expect(result.notes).toBe('Keep this note');
    });

    it('throws NotFoundError when vendor does not exist', () => {
      expect(() => {
        invoiceService.updateInvoice(db, 'non-existent-vendor', 'any-invoice-id', {
          amount: 500,
        });
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.updateInvoice(db, 'non-existent-vendor', 'any-invoice-id', {
          amount: 500,
        });
      }).toThrow('Vendor not found');
    });

    it('throws NotFoundError when invoice does not exist', () => {
      const vendorId = createTestVendor('No Invoice Vendor');

      expect(() => {
        invoiceService.updateInvoice(db, vendorId, 'non-existent-invoice-id', { amount: 500 });
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.updateInvoice(db, vendorId, 'non-existent-invoice-id', { amount: 500 });
      }).toThrow('Invoice not found');
    });

    it('throws NotFoundError when invoice belongs to a different vendor (ownership check)', () => {
      const vendor1Id = createTestVendor('Owner Vendor');
      const vendor2Id = createTestVendor('Other Vendor');
      const invoiceId = insertRawInvoice(vendor1Id, { amount: 500 });

      // Attempt to update vendor1's invoice through vendor2's route
      expect(() => {
        invoiceService.updateInvoice(db, vendor2Id, invoiceId, { amount: 999 });
      }).toThrow(NotFoundError);
    });

    it('throws ValidationError when updated amount is 0', () => {
      const vendorId = createTestVendor('Amount Zero Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, { amount: 500 });

      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: 0 });
      }).toThrow(ValidationError);
      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: 0 });
      }).toThrow('Amount must be greater than 0');
    });

    it('throws ValidationError when updated amount is negative', () => {
      const vendorId = createTestVendor('Negative Amount Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, { amount: 500 });

      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: -1 });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid date format on update', () => {
      const vendorId = createTestVendor('Bad Date Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-01-01' });

      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { date: '2026/01/01' });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when updated dueDate has invalid format', () => {
      const vendorId = createTestVendor('Bad DueDate Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-01-01' });

      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { dueDate: 'invalid' });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when updated dueDate is before existing date', () => {
      const vendorId = createTestVendor('DueDate Before Existing Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-06-01' });

      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { dueDate: '2026-01-01' });
      }).toThrow(ValidationError);
      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, { dueDate: '2026-01-01' });
      }).toThrow('Due date must be on or after the invoice date');
    });

    it('validates dueDate against the NEW date when both are updated together', () => {
      const vendorId = createTestVendor('New Date + DueDate Vendor');
      const invoiceId = insertRawInvoice(vendorId, {
        date: '2026-01-01',
        dueDate: '2026-01-15',
      });

      // Moving date to 2026-06-01 and dueDate to 2026-05-01 should fail (dueDate < new date)
      expect(() => {
        invoiceService.updateInvoice(db, vendorId, invoiceId, {
          date: '2026-06-01',
          dueDate: '2026-05-01',
        });
      }).toThrow(ValidationError);
    });

    it('validates dueDate against the new date when new date is provided and dueDate is valid', () => {
      const vendorId = createTestVendor('Valid New Date + DueDate Vendor');
      const invoiceId = insertRawInvoice(vendorId, { date: '2026-01-01' });

      // Move date forward and set dueDate after the new date — should succeed
      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, {
        date: '2026-06-01',
        dueDate: '2026-07-01',
      });

      expect(result.date).toBe('2026-06-01');
      expect(result.dueDate).toBe('2026-07-01');
    });

    it('sets updatedAt to a newer timestamp after update', async () => {
      const vendorId = createTestVendor('Timestamp Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, { amount: 500 });

      const before = invoiceService.listInvoices(db, vendorId)[0].updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 2));

      const result = invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: 750 });

      expect(result.updatedAt).not.toBe(before);
    });

    it('persists the update to the database', () => {
      const vendorId = createTestVendor('Persist Update Vendor');
      const invoiceId = insertRawInvoice(vendorId, { amount: 100 });

      invoiceService.updateInvoice(db, vendorId, invoiceId, { amount: 999 });
      const list = invoiceService.listInvoices(db, vendorId);

      expect(list.find((inv) => inv.id === invoiceId)?.amount).toBe(999);
    });
  });

  // ─── listAllInvoices() ──────────────────────────────────────────────────────

  describe('listAllInvoices()', () => {
    it('returns empty invoices array and zero pagination when no invoices exist', () => {
      const result = invoiceService.listAllInvoices(db, {});

      expect(result.invoices).toHaveLength(0);
      expect(result.pagination.totalItems).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.page).toBe(1);
    });

    it('returns zero summary counts when no invoices exist', () => {
      const result = invoiceService.listAllInvoices(db, {});

      expect(result.summary.pending.count).toBe(0);
      expect(result.summary.pending.totalAmount).toBe(0);
      expect(result.summary.paid.count).toBe(0);
      expect(result.summary.paid.totalAmount).toBe(0);
      expect(result.summary.claimed.count).toBe(0);
      expect(result.summary.claimed.totalAmount).toBe(0);
    });

    it('returns all invoices across multiple vendors with vendorName resolved via JOIN', () => {
      const vendorAId = createTestVendor('Vendor Alpha');
      const vendorBId = createTestVendor('Vendor Beta');
      insertRawInvoice(vendorAId, { amount: 100 });
      insertRawInvoice(vendorBId, { amount: 200 });

      const result = invoiceService.listAllInvoices(db, {});

      expect(result.invoices).toHaveLength(2);
      const vendorNames = result.invoices.map((inv) => inv.vendorName).sort();
      expect(vendorNames).toEqual(['Vendor Alpha', 'Vendor Beta']);
    });

    it('returns correct vendorName on each invoice matching its vendor', () => {
      const vendorAId = createTestVendor('Acme Corp');
      const vendorBId = createTestVendor('BuildRight LLC');
      const invAId = insertRawInvoice(vendorAId, { amount: 500 });
      insertRawInvoice(vendorBId, { amount: 750 });

      const result = invoiceService.listAllInvoices(db, {});

      const invoiceA = result.invoices.find((inv) => inv.id === invAId);
      expect(invoiceA?.vendorName).toBe('Acme Corp');
    });

    it('respects page and pageSize — returns correct slice and pagination metadata', () => {
      const vendorId = createTestVendor('Pagination Vendor');
      insertRawInvoice(vendorId, { date: '2026-01-01', amount: 100 });
      insertRawInvoice(vendorId, { date: '2026-01-02', amount: 200 });
      insertRawInvoice(vendorId, { date: '2026-01-03', amount: 300 });
      insertRawInvoice(vendorId, { date: '2026-01-04', amount: 400 });
      insertRawInvoice(vendorId, { date: '2026-01-05', amount: 500 });

      const result = invoiceService.listAllInvoices(db, { page: 2, pageSize: 2 });

      expect(result.invoices).toHaveLength(2);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.pageSize).toBe(2);
      expect(result.pagination.totalItems).toBe(5);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('returns first page when page is not specified (defaults to page 1)', () => {
      const vendorId = createTestVendor('Default Page Vendor');
      insertRawInvoice(vendorId, { amount: 100 });
      insertRawInvoice(vendorId, { amount: 200 });

      const result = invoiceService.listAllInvoices(db, { pageSize: 1 });

      expect(result.pagination.page).toBe(1);
      expect(result.invoices).toHaveLength(1);
    });

    it('filters by status — returns only matching invoices', () => {
      const vendorId = createTestVendor('Status Filter Vendor');
      insertRawInvoice(vendorId, { status: 'pending', amount: 100 });
      insertRawInvoice(vendorId, { status: 'paid', amount: 200 });
      insertRawInvoice(vendorId, { status: 'claimed', amount: 300 });

      const result = invoiceService.listAllInvoices(db, { status: 'paid' });

      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0].status).toBe('paid');
    });

    it('filters by vendorId — returns only that vendor invoices', () => {
      const vendor1Id = createTestVendor('Filtered Vendor');
      const vendor2Id = createTestVendor('Other Vendor');
      const inv1Id = insertRawInvoice(vendor1Id, { amount: 111 });
      insertRawInvoice(vendor2Id, { amount: 999 });

      const result = invoiceService.listAllInvoices(db, { vendorId: vendor1Id });

      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0].id).toBe(inv1Id);
    });

    it('filters by q — matches partial invoice number case-insensitively', () => {
      const vendorId = createTestVendor('Search Vendor');
      insertRawInvoice(vendorId, { invoiceNumber: 'INV-2026-001', amount: 100 });
      insertRawInvoice(vendorId, { invoiceNumber: 'INV-2026-002', amount: 200 });
      insertRawInvoice(vendorId, { invoiceNumber: 'REC-100', amount: 300 });

      const result = invoiceService.listAllInvoices(db, { q: 'inv-2026' });

      expect(result.invoices).toHaveLength(2);
    });

    it('q search is case-insensitive (uppercase query matches lowercase data)', () => {
      const vendorId = createTestVendor('Case Search Vendor');
      insertRawInvoice(vendorId, { invoiceNumber: 'inv-lower-001', amount: 100 });
      insertRawInvoice(vendorId, { invoiceNumber: 'OTHER-002', amount: 200 });

      const result = invoiceService.listAllInvoices(db, { q: 'INV-LOWER' });

      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0].invoiceNumber).toBe('inv-lower-001');
    });

    it('sorts by amount descending', () => {
      const vendorId = createTestVendor('Amount Sort Vendor');
      insertRawInvoice(vendorId, { amount: 100 });
      insertRawInvoice(vendorId, { amount: 500 });
      insertRawInvoice(vendorId, { amount: 250 });

      const result = invoiceService.listAllInvoices(db, { sortBy: 'amount', sortOrder: 'desc' });

      expect(result.invoices[0].amount).toBe(500);
      expect(result.invoices[1].amount).toBe(250);
      expect(result.invoices[2].amount).toBe(100);
    });

    it('sorts by amount ascending', () => {
      const vendorId = createTestVendor('Amount Asc Sort Vendor');
      insertRawInvoice(vendorId, { amount: 500 });
      insertRawInvoice(vendorId, { amount: 100 });
      insertRawInvoice(vendorId, { amount: 250 });

      const result = invoiceService.listAllInvoices(db, { sortBy: 'amount', sortOrder: 'asc' });

      expect(result.invoices[0].amount).toBe(100);
      expect(result.invoices[1].amount).toBe(250);
      expect(result.invoices[2].amount).toBe(500);
    });

    it('sorts by vendor_name', () => {
      const vendorAId = createTestVendor('Acme Corp');
      const vendorBId = createTestVendor('Zeta Construction');
      const vendorCId = createTestVendor('Midlands Builder');
      insertRawInvoice(vendorAId, { amount: 100 });
      insertRawInvoice(vendorBId, { amount: 200 });
      insertRawInvoice(vendorCId, { amount: 300 });

      const result = invoiceService.listAllInvoices(db, {
        sortBy: 'vendor_name',
        sortOrder: 'asc',
      });

      expect(result.invoices[0].vendorName).toBe('Acme Corp');
      expect(result.invoices[1].vendorName).toBe('Midlands Builder');
      expect(result.invoices[2].vendorName).toBe('Zeta Construction');
    });

    it('summary reflects global invoice counts and totals across ALL invoices (ignores page filter)', () => {
      const vendorId = createTestVendor('Summary Vendor');
      insertRawInvoice(vendorId, { status: 'pending', amount: 100 });
      insertRawInvoice(vendorId, { status: 'pending', amount: 200 });
      insertRawInvoice(vendorId, { status: 'paid', amount: 1000 });

      // Filter to only paid invoices on page 1
      const result = invoiceService.listAllInvoices(db, { status: 'paid', pageSize: 1 });

      // Filtered result should only return the paid invoice
      expect(result.invoices).toHaveLength(1);

      // But summary should be global — counting all 3 invoices
      expect(result.summary.pending.count).toBe(2);
      expect(result.summary.pending.totalAmount).toBe(300);
      expect(result.summary.paid.count).toBe(1);
      expect(result.summary.paid.totalAmount).toBe(1000);
      expect(result.summary.claimed.count).toBe(0);
      expect(result.summary.claimed.totalAmount).toBe(0);
    });

    it('summary has correct zero values for statuses with no invoices', () => {
      const vendorId = createTestVendor('Partial Summary Vendor');
      insertRawInvoice(vendorId, { status: 'paid', amount: 500 });

      const result = invoiceService.listAllInvoices(db, {});

      expect(result.summary.pending.count).toBe(0);
      expect(result.summary.pending.totalAmount).toBe(0);
      expect(result.summary.claimed.count).toBe(0);
      expect(result.summary.claimed.totalAmount).toBe(0);
      expect(result.summary.paid.count).toBe(1);
      expect(result.summary.paid.totalAmount).toBe(500);
    });

    it('combined status + vendorId filters narrow the invoice list correctly', () => {
      const vendor1Id = createTestVendor('Multi Filter Vendor');
      const vendor2Id = createTestVendor('Other Multi Filter Vendor');
      insertRawInvoice(vendor1Id, { status: 'paid', amount: 100 });
      insertRawInvoice(vendor1Id, { status: 'pending', amount: 200 });
      insertRawInvoice(vendor2Id, { status: 'paid', amount: 300 });

      const result = invoiceService.listAllInvoices(db, { status: 'paid', vendorId: vendor1Id });

      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0].amount).toBe(100);
    });
  });

  // ─── getInvoiceById() ───────────────────────────────────────────────────────

  describe('getInvoiceById()', () => {
    it('returns the correct invoice with all fields including vendorName', () => {
      const vendorId = createTestVendor('GetById Vendor');
      const userId = createTestUser('getby@test.com', 'GetBy User');
      const invoiceId = insertRawInvoice(vendorId, {
        invoiceNumber: 'INV-GET-001',
        amount: 4200,
        date: '2026-03-10',
        dueDate: '2026-04-10',
        status: 'paid',
        notes: 'Fetched by ID',
        createdBy: userId,
      });

      const result = invoiceService.getInvoiceById(db, invoiceId);

      expect(result.id).toBe(invoiceId);
      expect(result.vendorId).toBe(vendorId);
      expect(result.vendorName).toBe('GetById Vendor');
      expect(result.invoiceNumber).toBe('INV-GET-001');
      expect(result.amount).toBe(4200);
      expect(result.date).toBe('2026-03-10');
      expect(result.dueDate).toBe('2026-04-10');
      expect(result.status).toBe('paid');
      expect(result.notes).toBe('Fetched by ID');
      expect(result.createdBy?.id).toBe(userId);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('throws NotFoundError when invoice ID does not exist', () => {
      expect(() => {
        invoiceService.getInvoiceById(db, 'non-existent-invoice-id');
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.getInvoiceById(db, 'non-existent-invoice-id');
      }).toThrow('Invoice not found');
    });

    it('returns invoice regardless of which vendor it belongs to (cross-vendor lookup)', () => {
      const vendor1Id = createTestVendor('Cross Vendor One');
      const vendor2Id = createTestVendor('Cross Vendor Two');
      insertRawInvoice(vendor1Id, { amount: 111 });
      const inv2Id = insertRawInvoice(vendor2Id, { amount: 222 });

      const result = invoiceService.getInvoiceById(db, inv2Id);

      expect(result.vendorId).toBe(vendor2Id);
      expect(result.amount).toBe(222);
    });

    it('resolves createdBy to null when not set', () => {
      const vendorId = createTestVendor('No Creator GetById Vendor');
      const invoiceId = insertRawInvoice(vendorId, { createdBy: null });

      const result = invoiceService.getInvoiceById(db, invoiceId);

      expect(result.createdBy).toBeNull();
    });
  });

  // ─── deleteInvoice() ────────────────────────────────────────────────────────

  describe('deleteInvoice()', () => {
    it('deletes an invoice successfully', () => {
      const vendorId = createTestVendor('Delete Vendor');
      const invoiceId = insertRawInvoice(vendorId, { amount: 500 });

      // Verify it exists before deletion
      expect(invoiceService.listInvoices(db, vendorId)).toHaveLength(1);

      invoiceService.deleteInvoice(db, vendorId, invoiceId);

      expect(invoiceService.listInvoices(db, vendorId)).toHaveLength(0);
    });

    it('returns void on successful deletion', () => {
      const vendorId = createTestVendor('Void Delete Vendor');
      const invoiceId = insertRawInvoice(vendorId);

      const result = invoiceService.deleteInvoice(db, vendorId, invoiceId);

      expect(result).toBeUndefined();
    });

    it('throws NotFoundError when vendor does not exist', () => {
      expect(() => {
        invoiceService.deleteInvoice(db, 'non-existent-vendor', 'any-invoice-id');
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.deleteInvoice(db, 'non-existent-vendor', 'any-invoice-id');
      }).toThrow('Vendor not found');
    });

    it('throws NotFoundError when invoice does not exist', () => {
      const vendorId = createTestVendor('Delete Not Found Vendor');

      expect(() => {
        invoiceService.deleteInvoice(db, vendorId, 'non-existent-invoice-id');
      }).toThrow(NotFoundError);
      expect(() => {
        invoiceService.deleteInvoice(db, vendorId, 'non-existent-invoice-id');
      }).toThrow('Invoice not found');
    });

    it('throws NotFoundError when invoice belongs to a different vendor (ownership check)', () => {
      const vendor1Id = createTestVendor('Invoice Owner Vendor');
      const vendor2Id = createTestVendor('Wrong Vendor');
      const invoiceId = insertRawInvoice(vendor1Id);

      // Attempt to delete vendor1's invoice through vendor2
      expect(() => {
        invoiceService.deleteInvoice(db, vendor2Id, invoiceId);
      }).toThrow(NotFoundError);
    });

    it('does not delete invoices from other vendors', () => {
      const vendor1Id = createTestVendor('Protected Vendor');
      const vendor2Id = createTestVendor('Deleting Vendor');
      const inv1Id = insertRawInvoice(vendor1Id);
      const inv2Id = insertRawInvoice(vendor2Id);

      invoiceService.deleteInvoice(db, vendor2Id, inv2Id);

      // vendor1's invoice should still exist
      const remaining = invoiceService.listInvoices(db, vendor1Id);
      expect(remaining.find((inv) => inv.id === inv1Id)).toBeDefined();
    });

    it('deletes only the specified invoice when vendor has multiple invoices', () => {
      const vendorId = createTestVendor('Multi Invoice Delete Vendor');
      const inv1Id = insertRawInvoice(vendorId, { amount: 100 });
      const inv2Id = insertRawInvoice(vendorId, { amount: 200 });
      const inv3Id = insertRawInvoice(vendorId, { amount: 300 });

      invoiceService.deleteInvoice(db, vendorId, inv2Id);

      const remaining = invoiceService.listInvoices(db, vendorId);
      expect(remaining).toHaveLength(2);
      expect(remaining.find((inv) => inv.id === inv1Id)).toBeDefined();
      expect(remaining.find((inv) => inv.id === inv2Id)).toBeUndefined();
      expect(remaining.find((inv) => inv.id === inv3Id)).toBeDefined();
    });
  });
});

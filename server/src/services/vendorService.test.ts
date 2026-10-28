import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as vendorService from './vendorService.js';
import { searchDatabase } from './searchService.js';
import { registerSqlFunctions } from '../db/sqlFunctions.js';
import { NotFoundError, ValidationError, VendorInUseError } from '../errors/AppError.js';
import type { CreateVendorRequest, UpdateVendorRequest } from '@cornerstone/shared';

// Only Date is faked: timers, microtasks and nextTick stay real so async hooks (app.close) still run.
const DO_NOT_FAKE_TIMERS: Array<
  | 'setTimeout'
  | 'clearTimeout'
  | 'setInterval'
  | 'clearInterval'
  | 'setImmediate'
  | 'clearImmediate'
  | 'nextTick'
  | 'queueMicrotask'
  | 'performance'
  | 'hrtime'
> = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'performance',
  'hrtime',
];

afterEach(() => {
  jest.useRealTimers();
});

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
    registerSqlFunctions(sqliteDb);
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
      tradeId?: string | null;
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
        tradeId: options.tradeId ?? null,
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
    status: 'pending' | 'paid' | 'claimed' = 'pending',
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
   * Helper: Insert a progress payment (deposit/refund entry) on an invoice.
   */
  function createTestDeposit(
    invoiceId: string,
    amount: number,
    status: 'pending' | 'paid' | 'claimed',
    entryType: 'deposit' | 'refund' = 'deposit',
  ) {
    const now = new Date().toISOString();
    db.insert(schema.invoiceDeposits)
      .values({
        id: `dep-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        invoiceId,
        amount,
        dueDate: '2026-01-15',
        status,
        entryType,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  /**
   * Helper: Link a vendor to a work item via a budget line.
   */
  function createWorkItemVendorLink(workItemId: string, vendorId: string) {
    const budgetId = `bud-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId,
        vendorId,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
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

  /**
   * Helper: Insert a trade directly into the database.
   */
  function createTestTrade(name: string, options: { color?: string | null } = {}) {
    const id = `trade-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.trades)
      .values({
        id,
        name,
        color: options.color ?? null,
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id, name, color: options.color ?? null };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
    // Migration 0028 seeds 15 default trades — delete them so tests start with an empty trades table.
    // Tests that need trades create them explicitly via createTestTrade().
    db.delete(schema.trades).run();
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

    it('scopeTotal counts every company when no trade is chosen, ignoring the search', () => {
      createTestVendor('Acme Plumbing');
      createTestVendor('Best Electric');
      createTestVendor('Cool Roofing');

      const result = vendorService.listVendors(db, { q: 'Acme' });

      expect(result.pagination.totalItems).toBe(1);
      expect(result.scopeTotal).toBe(3);
    });

    it('scopeTotal counts the companies of the chosen trade only, ignoring the search', () => {
      const plumbing = createTestTrade('Plumbing');
      const electrical = createTestTrade('Electrical');
      createTestVendor('Acme Plumbing', { tradeId: plumbing.id });
      createTestVendor('Best Pipes', { tradeId: plumbing.id });
      createTestVendor('Cool Wires', { tradeId: electrical.id });
      createTestVendor('No Trade Inc');

      const unsearched = vendorService.listVendors(db, { tradeId: plumbing.id });
      const searched = vendorService.listVendors(db, { tradeId: plumbing.id, q: 'Acme' });

      expect(unsearched.scopeTotal).toBe(2);
      expect(searched.pagination.totalItems).toBe(1);
      expect(searched.scopeTotal).toBe(2);
    });

    it('scopeTotal is 0 for an empty table', () => {
      expect(vendorService.listVendors(db, {}).scopeTotal).toBe(0);
    });

    it('returns all vendor fields', () => {
      const userId = createTestUser('creator@test.com', 'Creator User');
      const trade = createTestTrade('Test Plumbing Trade', { color: '#0EA5E9' });
      createTestVendor('Smith Plumbing', {
        tradeId: trade.id,
        phone: '+1 555-1234',
        email: 'smith@plumbing.com',
        address: '123 Main St',
        notes: 'Reliable vendor',
        createdBy: userId,
      });

      const result = vendorService.listVendors(db, {});

      expect(result.vendors).toHaveLength(1);
      const vendor = result.vendors[0]!;
      expect(vendor.name).toBe('Smith Plumbing');
      expect(vendor.trade).not.toBeNull();
      expect(vendor.trade!.id).toBe(trade.id);
      expect(vendor.trade!.name).toBe('Test Plumbing Trade');
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

      expect(result.vendors[0]!.createdBy).toBeNull();
    });

    it('sorts by name ascending by default', () => {
      createTestVendor('Zephyr Windows');
      createTestVendor('Acme Plumbing');
      createTestVendor('Marble Works');

      const result = vendorService.listVendors(db, {});

      expect(result.vendors[0]!.name).toBe('Acme Plumbing');
      expect(result.vendors[1]!.name).toBe('Marble Works');
      expect(result.vendors[2]!.name).toBe('Zephyr Windows');
    });

    it('sorts by name descending when sortOrder is desc', () => {
      createTestVendor('Acme Plumbing');
      createTestVendor('Zephyr Windows');

      const result = vendorService.listVendors(db, { sortBy: 'name', sortOrder: 'desc' });

      expect(result.vendors[0]!.name).toBe('Zephyr Windows');
      expect(result.vendors[1]!.name).toBe('Acme Plumbing');
    });

    it('sorts by trade name ascending', () => {
      // Create real trades so sort-by-trade works correctly
      const roofing = createTestTrade('Roofing');
      const electrical = createTestTrade('Electrical');
      const plumbing = createTestTrade('Plumbing');

      createTestVendor('Vendor A', { tradeId: roofing.id });
      createTestVendor('Vendor B', { tradeId: electrical.id });
      createTestVendor('Vendor C', { tradeId: plumbing.id });

      const result = vendorService.listVendors(db, { sortBy: 'trade', sortOrder: 'asc' });

      // Sort by trade name: Electrical < Plumbing < Roofing
      expect(result.vendors[0]!.name).toBe('Vendor B'); // Electrical
      expect(result.vendors[1]!.name).toBe('Vendor C'); // Plumbing
      expect(result.vendors[2]!.name).toBe('Vendor A'); // Roofing
      // All vendors have their trade objects resolved
      result.vendors.forEach((v) => expect(v.trade).not.toBeNull());
    });

    it('sorts by created_at', () => {
      createTestVendor('First Vendor');
      createTestVendor('Second Vendor');
      createTestVendor('Third Vendor');

      const result = vendorService.listVendors(db, { sortBy: 'created_at', sortOrder: 'asc' });

      expect(result.vendors[0]!.name).toBe('First Vendor');
      expect(result.vendors[2]!.name).toBe('Third Vendor');
    });

    it('sorts by updated_at', () => {
      createTestVendor('Alpha Vendor');
      createTestVendor('Beta Vendor');

      const result = vendorService.listVendors(db, { sortBy: 'updated_at', sortOrder: 'desc' });

      // Beta was inserted later, so updated_at is later
      expect(result.vendors[0]!.name).toBe('Beta Vendor');
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

    it('searches by trade name (case-insensitive)', () => {
      const plumbingTrade = createTestTrade('Plumbing');
      const electricalTrade = createTestTrade('Electrical');
      createTestVendor('Vendor A', { tradeId: plumbingTrade.id });
      createTestVendor('Vendor B', { tradeId: electricalTrade.id });
      createTestVendor('Vendor C', { tradeId: plumbingTrade.id });

      // 'Plumbing' matches trade name — should return vendors with that trade
      const result = vendorService.listVendors(db, { q: 'Plumbing' });

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
      expect(result.vendors[0]!.name).toBe('Acme % Plumbing');
    });

    it('escapes SQL LIKE underscore wildcards in search query', () => {
      createTestVendor('Acme_Plumbing');
      createTestVendor('AcmeBPlumbing');

      const result = vendorService.listVendors(db, { q: 'Acme_Plumbing' });

      // Should match only the literal underscore, not "AcmeBPlumbing"
      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0]!.name).toBe('Acme_Plumbing');
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
      expect(result.vendors[0]!.name).toBe('Vendor 04');
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

  describe('listVendors() firstContactPhone (#2197)', () => {
    let contactCounter = 0;

    function addContact(
      vendorId: string,
      options: { phone?: string | null; createdAt?: string; id?: string } = {},
    ) {
      contactCounter += 1;
      const createdAt = options.createdAt ?? '2026-01-01T00:00:00.000Z';
      db.insert(schema.vendorContacts)
        .values({
          id: options.id ?? `contact-${contactCounter}`,
          vendorId,
          name: `Contact ${contactCounter}`,
          phone: options.phone ?? null,
          createdAt,
          updatedAt: createdAt,
        })
        .run();
    }

    function phoneFor(vendorName: string) {
      const row = vendorService.listVendors(db, {}).vendors.find((v) => v.name === vendorName);
      return row?.firstContactPhone;
    }

    it('is null when the vendor has no contacts', () => {
      createTestVendor('No Contacts Co');
      expect(phoneFor('No Contacts Co')).toBeNull();
    });

    it('is null when contacts have no phone or a blank phone', () => {
      const id = createTestVendor('Blank Phone Co').id;
      addContact(id, { phone: null });
      addContact(id, { phone: '  ' });
      expect(phoneFor('Blank Phone Co')).toBeNull();
    });

    it('picks the contact with the earliest created_at that has a phone', () => {
      const id = createTestVendor('Two Contacts Co').id;
      addContact(id, { phone: '555-0102', createdAt: '2026-02-01T00:00:00.000Z' });
      addContact(id, { phone: '555-0101', createdAt: '2026-01-01T00:00:00.000Z' });
      expect(phoneFor('Two Contacts Co')).toBe('555-0101');
    });

    it('skips an earlier contact without a phone', () => {
      const id = createTestVendor('Skip Co').id;
      addContact(id, { phone: null, createdAt: '2026-01-01T00:00:00.000Z' });
      addContact(id, { phone: '555-0103', createdAt: '2026-02-01T00:00:00.000Z' });
      expect(phoneFor('Skip Co')).toBe('555-0103');
    });

    it('breaks created_at ties by the lower contact id', () => {
      const id = createTestVendor('Tie Co').id;
      addContact(id, { id: 'contact-b', phone: '555-0105' });
      addContact(id, { id: 'contact-a', phone: '555-0104' });
      expect(phoneFor('Tie Co')).toBe('555-0104');
    });

    it('is still set when the vendor has its own phone', () => {
      const id = createTestVendor('Own Phone Co', { phone: '555-0102' }).id;
      addContact(id, { phone: '555-0103' });
      const row = vendorService.listVendors(db, {}).vendors.find((v) => v.name === 'Own Phone Co');
      expect(row?.phone).toBe('555-0102');
      expect(row?.firstContactPhone).toBe('555-0103');
    });

    it('does not include firstContactPhone in getVendorById or createVendor responses', () => {
      const id = createTestVendor('Detail Co').id;
      addContact(id, { phone: '555-0101' });
      expect(vendorService.getVendorById(db, id)).not.toHaveProperty('firstContactPhone');
      expect(
        vendorService.createVendor(
          db,
          { name: 'Created Co' },
          createTestUser('qa@example.com', 'QA'),
        ),
      ).not.toHaveProperty('firstContactPhone');
    });

    it('matches a literal % or backslash in q without wildcard behaviour', () => {
      createTestVendor('Plain Co');
      const pct = createTestVendor('Half% Co').id;
      createTestVendor('Back\\slash Co');
      expect(vendorService.listVendors(db, { q: '%' }).vendors.map((v) => v.id)).toEqual([pct]);
      expect(vendorService.listVendors(db, { q: '\\' }).vendors.map((v) => v.name)).toEqual([
        'Back\\slash Co',
      ]);
    });
  });

  // ─── listVendors() companies list (#2213) ───────────────────────────────────

  describe('listVendors() companies list (#2213)', () => {
    let seq = 0;

    function addContact(
      vendorId: string,
      options: { name?: string; phone?: string | null; email?: string | null } = {},
    ) {
      seq += 1;
      const at = '2026-01-01T00:00:00.000Z';
      db.insert(schema.vendorContacts)
        .values({
          id: `c2213-${seq}`,
          vendorId,
          name: options.name ?? `Contact ${seq}`,
          phone: options.phone ?? null,
          email: options.email ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }

    function addDiary(
      options: {
        vendorId?: string;
        entryDate?: string;
        entryType?: 'daily_log' | 'delivery' | 'general_note';
        status?: 'draft' | 'saved';
        isAutomatic?: boolean;
        metadata?: Record<string, unknown> | null;
      } = {},
    ) {
      seq += 1;
      const at = '2026-01-01T00:00:00.000Z';
      const metadata =
        options.metadata !== undefined
          ? options.metadata
          : options.vendorId
            ? { vendorId: options.vendorId }
            : null;
      db.insert(schema.diaryEntries)
        .values({
          id: `d2213-${seq}`,
          entryType: options.entryType ?? 'daily_log',
          entryDate: options.entryDate ?? '2026-03-01',
          body: 'On site',
          metadata: metadata ? JSON.stringify(metadata) : null,
          status: options.status ?? 'saved',
          isAutomatic: options.isAutomatic ?? false,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }

    const names = (q: Parameters<typeof vendorService.listVendors>[1], ids: string[] = []) =>
      vendorService.listVendors(db, q, ids).vendors.map((v) => v.name);

    describe('folded q across name, trade, phone, e-mail and contact persons', () => {
      it('finds a name with an umlaut by its plain, digraph and accented spellings', () => {
        createTestVendor('Müller Bau');
        createTestVendor('Other Co');

        expect(names({ q: 'Muller' })).toEqual(['Müller Bau']);
        expect(names({ q: 'Mueller' })).toEqual(['Müller Bau']);
        expect(names({ q: 'MÜLLER' })).toEqual(['Müller Bau']);
      });

      it('finds a sharp s by its ss spelling', () => {
        createTestVendor('Fußboden Profis');
        createTestVendor('Other Co');

        expect(names({ q: 'fussboden' })).toEqual(['Fußboden Profis']);
      });

      it("matches the trade's stored name", () => {
        const trade = createTestTrade('Elektrik');
        createTestVendor('Alpha Co', { tradeId: trade.id });
        createTestVendor('Beta Co');

        expect(names({ q: 'elektr' })).toEqual(['Alpha Co']);
      });

      it('matches the company e-mail', () => {
        createTestVendor('Alpha Co', { email: 'office@alpha.example.com' });
        createTestVendor('Beta Co', { email: 'info@beta.example.com' });

        expect(names({ q: 'alpha.example' })).toEqual(['Alpha Co']);
      });

      it('matches a contact person name, e-mail and phone', () => {
        const a = createTestVendor('Alpha Co').id;
        const b = createTestVendor('Beta Co').id;
        createTestVendor('Gamma Co');
        addContact(a, { name: 'Renate Zimmermann', email: 'renate@alpha.example.com' });
        addContact(b, { name: 'Other Person', phone: '+49 30 5550142' });

        expect(names({ q: 'zimmermann' })).toEqual(['Alpha Co']);
        expect(names({ q: 'renate@alpha' })).toEqual(['Alpha Co']);
        expect(names({ q: '5550142' })).toEqual(['Beta Co']);
      });

      it('lists a company once even when several contacts match', () => {
        const a = createTestVendor('Alpha Co').id;
        addContact(a, { name: 'Sam Rivers' });
        addContact(a, { name: 'Sami Rivers' });

        const result = vendorService.listVendors(db, { q: 'rivers' });
        expect(result.vendors.map((v) => v.name)).toEqual(['Alpha Co']);
        expect(result.pagination.totalItems).toBe(1);
      });

      it('matches phone digits when q has at least 3 digits', () => {
        createTestVendor('Alpha Co', { phone: '555-0123' });
        createTestVendor('Beta Co', { phone: '555-0999' });

        expect(names({ q: '555 01' })).toEqual(['Alpha Co']);
      });

      it('matches digits of a contact phone', () => {
        const a = createTestVendor('Alpha Co').id;
        createTestVendor('Beta Co');
        addContact(a, { phone: '(030) 555 01 77' });

        expect(names({ q: '03055501' })).toEqual(['Alpha Co']);
      });

      it('does not use digit matching for fewer than 3 digits', () => {
        createTestVendor('Alpha Co', { phone: '1-2-3' });
        createTestVendor('Beta Co');

        // Digits of the phone are "123": "12" would match them, so a hit would prove the rule broke.
        expect(names({ q: '12' })).toEqual([]);
        expect(names({ q: '1 23' })).toEqual(['Alpha Co']);
      });

      it('treats % and _ as literal characters', () => {
        createTestVendor('Half% Co');
        createTestVendor('Under_score Co');
        createTestVendor('Plain Co');

        expect(names({ q: '%' })).toEqual(['Half% Co']);
        expect(names({ q: '_' })).toEqual(['Under_score Co']);
      });

      it.each(['', '   '])('treats q=%j as no filter', (q) => {
        createTestVendor('Alpha Co');
        createTestVendor('Beta Co');

        expect(names({ q })).toHaveLength(2);
      });

      it('filters and never ranks: the order stays the requested sort', () => {
        createTestVendor('Zeta Bau');
        createTestVendor('Alpha Bau');
        createTestVendor('Bau Mitte');

        expect(names({ q: 'bau', sortBy: 'name', sortOrder: 'asc' })).toEqual([
          'Alpha Bau',
          'Bau Mitte',
          'Zeta Bau',
        ]);
        expect(names({ q: 'bau', sortBy: 'name', sortOrder: 'desc' })).toEqual([
          'Zeta Bau',
          'Bau Mitte',
          'Alpha Bau',
        ]);
      });
    });

    describe('shares one matcher with the vendor group of the command search', () => {
      it('returns the same company ids as searchDatabase for the same q and data', () => {
        const trade = createTestTrade('Fliesen');
        createTestVendor('Müller Bau', { phone: '555-0123', email: 'm@example.com' });
        const b = createTestVendor('Beta Co', { tradeId: trade.id });
        const c = createTestVendor('Gamma Co');
        createTestVendor('Unrelated Co');
        addContact(c.id, { name: 'Frau Müller', phone: '+49 555 0123' });
        addContact(b.id, { name: 'Zed', email: 'zed@fliesen.example.com' });

        for (const q of ['mueller', 'fliesen', '555 01', 'example.com', 'zed', 'none-such']) {
          const list = vendorService
            .listVendors(db, { q, pageSize: 100 })
            .vendors.map((v) => v.id)
            .sort();
          const group = searchDatabase(db, { q, types: ['vendor'], limit: 100 }).find(
            (g) => g.type === 'vendor',
          );
          const search = (group?.items ?? []).map((i) => i.id).sort();
          expect(list).toEqual(search);
        }
      });
    });

    describe('tradeIds', () => {
      it("finds a company whose trade's name does not contain q when its trade id is listed", () => {
        const tile = createTestTrade('Fliesen');
        const wood = createTestTrade('Holz');
        createTestVendor('Alpha Co', { tradeId: tile.id });
        createTestVendor('Beta Co', { tradeId: wood.id });

        // "tile" is what an English user typed; the stored name is German.
        expect(names({ q: 'tile' }, [])).toEqual([]);
        expect(names({ q: 'tile' }, [tile.id])).toEqual(['Alpha Co']);
      });

      it('widens the text match instead of replacing it', () => {
        const tile = createTestTrade('Fliesen');
        createTestVendor('Alpha Co', { tradeId: tile.id });
        createTestVendor('Tile Depot');
        createTestVendor('Beta Co');

        expect(names({ q: 'tile', sortBy: 'name', sortOrder: 'asc' }, [tile.id])).toEqual([
          'Alpha Co',
          'Tile Depot',
        ]);
      });

      it('ignores unknown ids without an error or extra rows', () => {
        createTestVendor('Alpha Co');
        createTestVendor('Beta Co');

        expect(names({ q: 'alpha' }, ['no-such-trade'])).toEqual(['Alpha Co']);
      });

      it('is ignored when q is missing or blank: all rows come back', () => {
        const tile = createTestTrade('Fliesen');
        createTestVendor('Alpha Co', { tradeId: tile.id });
        createTestVendor('Beta Co');

        expect(names({}, [tile.id])).toHaveLength(2);
        expect(names({ q: '  ' }, [tile.id])).toHaveLength(2);
      });

      it('keeps tradeId as an AND filter', () => {
        const a = createTestTrade('Fliesen');
        const b = createTestTrade('Holz');
        createTestVendor('Alpha Tile', { tradeId: a.id });
        createTestVendor('Beta Tile', { tradeId: b.id });
        createTestVendor('Tile Depot', { tradeId: a.id });

        // tradeId=A & q=tile & tradeIds=B: only trade-A companies that match by text.
        expect(names({ tradeId: a.id, q: 'tile', sortBy: 'name' }, [b.id])).toEqual([
          'Alpha Tile',
          'Tile Depot',
        ]);
      });
    });

    describe('contactCount', () => {
      it('is 0 without contacts and counts every contact otherwise', () => {
        createTestVendor('Alpha Co');
        const b = createTestVendor('Beta Co').id;
        addContact(b);
        addContact(b, { phone: '555-0101' });

        const rows = vendorService.listVendors(db, {}).vendors;
        expect(rows.find((v) => v.name === 'Alpha Co')?.contactCount).toBe(0);
        expect(rows.find((v) => v.name === 'Beta Co')?.contactCount).toBe(2);
      });

      it('does not count the contacts of other companies', () => {
        const a = createTestVendor('Alpha Co').id;
        const b = createTestVendor('Beta Co').id;
        addContact(a);
        addContact(b);
        addContact(b);
        addContact(b);

        const rows = vendorService.listVendors(db, {}).vendors;
        expect(rows.find((v) => v.name === 'Alpha Co')?.contactCount).toBe(1);
      });

      it('is a list-only field: detail responses do not carry it (contacts array instead)', () => {
        const id = createTestVendor('Detail Co').id;
        expect(vendorService.getVendorById(db, id)).not.toHaveProperty('contactCount');
      });
    });

    describe('lastOnSite', () => {
      const lastOnSiteOf = (name: string) =>
        vendorService.listVendors(db, {}).vendors.find((v) => v.name === name)?.lastOnSite;

      it('is null when the company has no daily log', () => {
        createTestVendor('Alpha Co');
        expect(lastOnSiteOf('Alpha Co')).toBeNull();
      });

      it('is the latest entry date of its saved manual daily logs', () => {
        const a = createTestVendor('Alpha Co').id;
        addDiary({ vendorId: a, entryDate: '2026-02-01' });
        addDiary({ vendorId: a, entryDate: '2026-04-15' });
        addDiary({ vendorId: a, entryDate: '2026-03-01' });

        expect(lastOnSiteOf('Alpha Co')).toBe('2026-04-15');
      });

      it('ignores drafts', () => {
        const a = createTestVendor('Alpha Co').id;
        addDiary({ vendorId: a, entryDate: '2026-02-01' });
        addDiary({ vendorId: a, entryDate: '2026-05-01', status: 'draft' });

        expect(lastOnSiteOf('Alpha Co')).toBe('2026-02-01');
      });

      it('ignores automatic entries', () => {
        const a = createTestVendor('Alpha Co').id;
        addDiary({ vendorId: a, entryDate: '2026-02-01' });
        addDiary({ vendorId: a, entryDate: '2026-05-01', isAutomatic: true });

        expect(lastOnSiteOf('Alpha Co')).toBe('2026-02-01');
      });

      it('ignores deliveries, even with vendor text or an id in their metadata', () => {
        const a = createTestVendor('Alpha Co').id;
        addDiary({
          entryType: 'delivery',
          entryDate: '2026-05-01',
          metadata: { vendor: 'Alpha Co', vendorId: a },
        });
        addDiary({
          entryType: 'delivery',
          entryDate: '2026-05-02',
          metadata: { vendor: 'Alpha Co' },
        });

        expect(lastOnSiteOf('Alpha Co')).toBeNull();
      });

      it('ignores other entry types and logs without a company', () => {
        const a = createTestVendor('Alpha Co').id;
        addDiary({ entryType: 'general_note', entryDate: '2026-05-01', metadata: { vendorId: a } });
        addDiary({ entryDate: '2026-05-02', metadata: null });
        addDiary({ entryDate: '2026-05-03', metadata: { vendorId: null } });

        expect(lastOnSiteOf('Alpha Co')).toBeNull();
      });

      it("does not take another company's daily log", () => {
        const a = createTestVendor('Alpha Co').id;
        const b = createTestVendor('Beta Co').id;
        addDiary({ vendorId: a, entryDate: '2026-03-01' });
        addDiary({ vendorId: b, entryDate: '2026-04-01' });

        expect(lastOnSiteOf('Alpha Co')).toBe('2026-03-01');
        expect(lastOnSiteOf('Beta Co')).toBe('2026-04-01');
      });

      it('returns a future date as stored', () => {
        const a = createTestVendor('Alpha Co').id;
        addDiary({ vendorId: a, entryDate: '2099-12-31' });

        expect(lastOnSiteOf('Alpha Co')).toBe('2099-12-31');
      });
    });

    describe('sorting', () => {
      function seedLastOnSite() {
        const a = createTestVendor('Alpha Co').id;
        const b = createTestVendor('Beta Co').id;
        createTestVendor('Gamma Co');
        createTestVendor('Delta Co');
        addDiary({ vendorId: a, entryDate: '2026-01-10' });
        addDiary({ vendorId: b, entryDate: '2026-03-10' });
      }

      it('sorts by last_on_site ascending with companies without a value last', () => {
        seedLastOnSite();
        expect(names({ sortBy: 'last_on_site', sortOrder: 'asc' })).toEqual([
          'Alpha Co',
          'Beta Co',
          'Delta Co',
          'Gamma Co',
        ]);
      });

      it('sorts by last_on_site descending with companies without a value still last', () => {
        seedLastOnSite();
        expect(names({ sortBy: 'last_on_site', sortOrder: 'desc' })).toEqual([
          'Beta Co',
          'Alpha Co',
          'Delta Co',
          'Gamma Co',
        ]);
      });

      it('breaks last_on_site ties by name, then id', () => {
        const x1 = createTestVendor('Same Name');
        const x2 = createTestVendor('Same Name');
        const other = createTestVendor('Aaa Co');
        for (const v of [x1, x2, other]) addDiary({ vendorId: v.id, entryDate: '2026-02-02' });

        const rows = vendorService.listVendors(db, {
          sortBy: 'last_on_site',
          sortOrder: 'desc',
        }).vendors;
        const sameIds = [x1.id, x2.id].sort();
        expect(rows.map((v) => v.id)).toEqual([other.id, ...sameIds]);
      });

      it('sorts by name with equal names ordered by id in both directions', () => {
        const ids = [createTestVendor('Twin').id, createTestVendor('Twin').id].sort();
        const asc = vendorService.listVendors(db, { sortBy: 'name', sortOrder: 'asc' });
        const desc = vendorService.listVendors(db, { sortBy: 'name', sortOrder: 'desc' });

        expect(asc.vendors.map((v) => v.id)).toEqual(ids);
        expect(desc.vendors.map((v) => v.id)).toEqual(ids);
      });

      it('breaks trade ties by name, then id', () => {
        const trade = createTestTrade('Fliesen');
        createTestVendor('Charlie', { tradeId: trade.id });
        createTestVendor('Alpha', { tradeId: trade.id });
        createTestVendor('Bravo', { tradeId: trade.id });

        expect(names({ sortBy: 'trade', sortOrder: 'asc' })).toEqual(['Alpha', 'Bravo', 'Charlie']);
        expect(names({ sortBy: 'trade', sortOrder: 'desc' })).toEqual([
          'Alpha',
          'Bravo',
          'Charlie',
        ]);
      });

      it.each(['created_at', 'updated_at'] as const)(
        'breaks %s ties by name, then id',
        (sortBy) => {
          const at = '2026-01-01T00:00:00.000Z';
          const base = { createdAt: at, updatedAt: at };
          db.insert(schema.vendors)
            .values([
              { id: 'v-3', name: 'Same', ...base },
              { id: 'v-1', name: 'Same', ...base },
              { id: 'v-2', name: 'Aardvark', ...base },
            ])
            .run();

          const ids = vendorService
            .listVendors(db, { sortBy, sortOrder: 'desc' })
            .vendors.map((v) => v.id);
          expect(ids).toEqual(['v-2', 'v-1', 'v-3']);
        },
      );

      it('pages a tie stably: page 1 and page 2 together hold every company exactly once', () => {
        const at = '2026-01-01T00:00:00.000Z';
        const rows = Array.from({ length: 7 }, (_, i) => ({
          id: `tie-${i}`,
          name: 'Identical',
          createdAt: at,
          updatedAt: at,
        }));
        db.insert(schema.vendors).values(rows).run();

        const pages = [1, 2, 3, 4].map((page) =>
          vendorService
            .listVendors(db, { sortBy: 'created_at', sortOrder: 'asc', page, pageSize: 2 })
            .vendors.map((v) => v.id),
        );
        const all = pages.flat();
        expect(all).toHaveLength(7);
        expect(new Set(all).size).toBe(7);
        expect(all).toEqual([...all].sort());
      });
    });
  });

  // ─── getVendorById() ────────────────────────────────────────────────────────

  describe('getVendorById()', () => {
    it('returns a vendor by ID with trade null when no tradeId set', () => {
      const vendor = createTestVendor('Test Vendor');

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.id).toBe(vendor.id);
      expect(result.name).toBe('Test Vendor');
      expect(result.trade).toBeNull();
    });

    it('returns a vendor by ID (trade populated when tradeId references existing trade)', () => {
      const trade = createTestTrade('Roofing');
      const vendor = createTestVendor('Roofing Vendor', { tradeId: trade.id });

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.id).toBe(vendor.id);
      expect(result.trade).not.toBeNull();
      expect(result.trade!.id).toBe(trade.id);
      expect(result.trade!.name).toBe('Roofing');
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
      expect(result.stillToPay).toBe(0);
    });

    it('includes correct invoiceCount when vendor has invoices', () => {
      const vendor = createTestVendor('Multi Invoice Vendor');
      createTestInvoice(vendor.id, 'pending', 500);
      createTestInvoice(vendor.id, 'paid', 300);
      createTestInvoice(vendor.id, 'claimed', 200);

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.invoiceCount).toBe(3);
    });

    // Mutation guard for every stillToPay case below: the old implementation was
    // SUM(amount) WHERE status IN ('pending','claimed'); each assertion fails under it.
    it('D-06: counts only pending invoices; claimed (submitted) and paid never count', () => {
      const vendor = createTestVendor('Balance Vendor');
      createTestInvoice(vendor.id, 'pending', 500);
      createTestInvoice(vendor.id, 'claimed', 300); // old SUM would have added 300
      createTestInvoice(vendor.id, 'paid', 1000);

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.stillToPay).toBe(500);
      expect(result.invoiceCount).toBe(3);
    });

    it('D-06: stillToPay is 0 with only paid and claimed invoices', () => {
      const vendor = createTestVendor('Settled Vendor');
      createTestInvoice(vendor.id, 'paid', 1000);
      createTestInvoice(vendor.id, 'claimed', 250);

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(0);
    });

    it('subtracts a paid progress payment from a pending invoice', () => {
      const vendor = createTestVendor('Progress Vendor');
      const invoiceId = createTestInvoice(vendor.id, 'pending', 1000);
      createTestDeposit(invoiceId, 400, 'paid');

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(600);
    });

    it('subtracts claimed progress payments too', () => {
      const vendor = createTestVendor('Progress Vendor 2');
      const invoiceId = createTestInvoice(vendor.id, 'pending', 1000);
      createTestDeposit(invoiceId, 400, 'paid');
      createTestDeposit(invoiceId, 100, 'claimed');

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(500);
    });

    it('adds a pending progress payment on a quotation (quotation itself adds nothing)', () => {
      const vendor = createTestVendor('Quote Vendor');
      const invoiceId = createTestInvoice(vendor.id, 'pending', 2000);
      db.update(schema.invoices)
        .set({ status: 'quotation' })
        .where(eq(schema.invoices.id, invoiceId))
        .run();
      createTestDeposit(invoiceId, 300, 'pending');

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(300);
    });

    it('keeps a pending progress payment inside a pending invoice total (no double count)', () => {
      const vendor = createTestVendor('Pending Progress Vendor');
      const invoiceId = createTestInvoice(vendor.id, 'pending', 1000);
      createTestDeposit(invoiceId, 250, 'pending');

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(1000);
    });

    it('ignores a pending refund entry', () => {
      const vendor = createTestVendor('Refund Vendor');
      const invoiceId = createTestInvoice(vendor.id, 'pending', 1000);
      createTestDeposit(invoiceId, 200, 'pending', 'refund');

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(1000);
    });

    it('excludes another vendor invoices and progress payments', () => {
      const vendor = createTestVendor('Mine');
      const other = createTestVendor('Theirs');
      createTestInvoice(vendor.id, 'pending', 100);
      const otherInvoice = createTestInvoice(other.id, 'pending', 5000);
      createTestDeposit(otherInvoice, 700, 'pending');

      expect(vendorService.getVendorById(db, vendor.id).stillToPay).toBe(100);
    });

    it('stillToPay is 0 when all invoices are paid', () => {
      const vendor = createTestVendor('Paid Up Vendor');
      createTestInvoice(vendor.id, 'paid', 999);
      createTestInvoice(vendor.id, 'paid', 500);

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.stillToPay).toBe(0);
    });

    it('returns all optional fields including null values', () => {
      const vendor = createTestVendor('Sparse Vendor');

      const result = vendorService.getVendorById(db, vendor.id);

      expect(result.trade).toBeNull();
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
      expect(result.stillToPay).toBe(1000);
    });
  });

  // ─── Company figures (#2244) ────────────────────────────────────────────────

  describe('company money, tasks and site days (#2244)', () => {
    let seq2244 = 0;
    const AT = '2026-01-01T00:00:00.000Z';

    function addInvoice(
      vendorId: string,
      status: 'pending' | 'paid' | 'claimed' | 'quotation',
      amount: number,
    ) {
      seq2244 += 1;
      const id = `inv2244-${seq2244}`;
      db.insert(schema.invoices)
        .values({ id, vendorId, amount, date: '2026-01-01', status, createdAt: AT, updatedAt: AT })
        .run();
      return id;
    }

    function addProgress(
      invoiceId: string,
      amount: number,
      status: 'pending' | 'paid' | 'claimed',
      entryType: 'deposit' | 'refund' = 'deposit',
    ) {
      seq2244 += 1;
      db.insert(schema.invoiceDeposits)
        .values({
          id: `dep2244-${seq2244}`,
          invoiceId,
          amount,
          dueDate: '2026-01-15',
          status,
          entryType,
          createdAt: AT,
          updatedAt: AT,
        })
        .run();
    }

    function addTask(vendorId: string, status: 'not_started' | 'in_progress' | 'completed') {
      seq2244 += 1;
      db.insert(schema.workItems)
        .values({
          id: `wi2244-${seq2244}`,
          title: `Task ${seq2244}`,
          status,
          assignedVendorId: vendorId,
          createdAt: AT,
          updatedAt: AT,
        })
        .run();
    }

    function addLog(
      options: {
        vendorId?: string;
        date?: string;
        status?: 'draft' | 'saved';
        isAutomatic?: boolean;
        entryType?: 'daily_log' | 'general_note';
        rawMetadata?: string | null;
      } = {},
    ) {
      seq2244 += 1;
      const metadata =
        options.rawMetadata !== undefined
          ? options.rawMetadata
          : JSON.stringify({ vendorId: options.vendorId });
      db.insert(schema.diaryEntries)
        .values({
          id: `log2244-${seq2244}`,
          entryType: options.entryType ?? 'daily_log',
          entryDate: options.date ?? '2026-03-01',
          body: 'On site',
          metadata,
          status: options.status ?? 'saved',
          isAutomatic: options.isAutomatic ?? false,
          createdAt: AT,
          updatedAt: AT,
        })
        .run();
    }

    describe('money fields on the detail', () => {
      it('is all zeros for a company without records', () => {
        const id = createTestVendor('Empty Co').id;
        const detail = vendorService.getVendorById(db, id);

        expect(detail.stillToPay).toBe(0);
        expect(detail.paid).toBe(0);
        expect(detail.offers).toEqual({
          count: 0,
          amount: 0,
          paid: 0,
          stillToPay: 0,
          remainingOnOffer: 0,
        });
      });

      // Mutation: summing only paid-status invoices would miss the claimed (submitted) 300 and
      // the progress payments; counting claimed as unpaid would raise stillToPay.
      it('counts paid, submitted (claimed) and progress payments as Paid; only pending as Still to pay', () => {
        const id = createTestVendor('Mixed Co').id;
        const pending = addInvoice(id, 'pending', 1000);
        addProgress(pending, 400, 'paid');
        addInvoice(id, 'claimed', 300);
        addInvoice(id, 'paid', 200);

        const detail = vendorService.getVendorById(db, id);

        expect(detail.stillToPay).toBe(600);
        expect(detail.paid).toBe(900);
        expect(detail.invoiceCount).toBe(3);
      });

      it('nets a paid refund against Paid', () => {
        const id = createTestVendor('Refund Co').id;
        const paid = addInvoice(id, 'paid', 500);
        addProgress(paid, 100, 'paid', 'refund');

        const detail = vendorService.getVendorById(db, id);

        expect(detail.paid).toBe(400);
        expect(detail.stillToPay).toBe(0);
      });

      it('reports offers (quotations) separately with paid, still to pay and remaining', () => {
        const id = createTestVendor('Offer Co').id;
        const offer = addInvoice(id, 'quotation', 2000);
        addProgress(offer, 500, 'paid');
        addProgress(offer, 300, 'pending');
        addInvoice(id, 'pending', 100);

        const detail = vendorService.getVendorById(db, id);

        expect(detail.offers.count).toBe(1);
        expect(detail.offers.amount).toBe(2000);
        expect(detail.offers.paid).toBe(500);
        expect(detail.offers.stillToPay).toBe(300);
        expect(detail.offers.remainingOnOffer).toBe(1200); // 2000 less paid 500 and pending 300
        // The offer's pending progress payment and the pending invoice both count as Still to pay.
        expect(detail.stillToPay).toBe(400);
        expect(detail.invoiceCount).toBe(2);
      });

      it('keeps every company figure separate (no cross-contamination)', () => {
        const a = createTestVendor('Alpha Money').id;
        const b = createTestVendor('Beta Money').id;
        addInvoice(a, 'pending', 700);
        addInvoice(b, 'paid', 50);

        expect(vendorService.getVendorById(db, a).stillToPay).toBe(700);
        expect(vendorService.getVendorById(db, a).paid).toBe(0);
        expect(vendorService.getVendorById(db, b).stillToPay).toBe(0);
        expect(vendorService.getVendorById(db, b).paid).toBe(50);
      });
    });

    describe('openTaskCount', () => {
      it('counts tasks assigned to the company that are not completed', () => {
        const id = createTestVendor('Task Co').id;
        const other = createTestVendor('Other Task Co').id;
        addTask(id, 'not_started');
        addTask(id, 'in_progress');
        addTask(id, 'completed');
        addTask(other, 'not_started');

        expect(vendorService.getVendorById(db, id).openTaskCount).toBe(2);
        expect(vendorService.getVendorById(db, other).openTaskCount).toBe(1);
      });

      it('is 0 without tasks', () => {
        expect(
          vendorService.getVendorById(db, createTestVendor('No Task Co').id).openTaskCount,
        ).toBe(0);
      });
    });

    describe('onSiteDays and lastOnSite', () => {
      it('is 0 and null without daily logs', () => {
        const detail = vendorService.getVendorById(db, createTestVendor('Never Co').id);

        expect(detail.onSiteDays).toBe(0);
        expect(detail.lastOnSite).toBeNull();
      });

      it('counts distinct dates, so two logs on one day are one site day', () => {
        const id = createTestVendor('Site Co').id;
        addLog({ vendorId: id, date: '2026-03-01' });
        addLog({ vendorId: id, date: '2026-03-01' });
        addLog({ vendorId: id, date: '2026-03-05' });

        const detail = vendorService.getVendorById(db, id);

        expect(detail.onSiteDays).toBe(2);
        expect(detail.lastOnSite).toBe('2026-03-05');
      });

      it('ignores drafts, automatic entries, other entry types and other companies', () => {
        const id = createTestVendor('Strict Co').id;
        const other = createTestVendor('Else Co').id;
        addLog({ vendorId: id, date: '2026-01-10' });
        addLog({ vendorId: id, date: '2026-09-01', status: 'draft' });
        addLog({ vendorId: id, date: '2026-09-02', isAutomatic: true });
        addLog({ vendorId: id, date: '2026-09-03', entryType: 'general_note' });
        addLog({ vendorId: other, date: '2026-09-04' });

        const detail = vendorService.getVendorById(db, id);

        expect(detail.onSiteDays).toBe(1);
        expect(detail.lastOnSite).toBe('2026-01-10');
      });

      it('does not fail on invalid or missing metadata JSON and skips those rows', () => {
        const id = createTestVendor('Json Co').id;
        addLog({ rawMetadata: '{not json' });
        addLog({ rawMetadata: null });
        addLog({ vendorId: id, date: '2026-02-02' });

        const detail = vendorService.getVendorById(db, id);
        expect(detail.onSiteDays).toBe(1);
        expect(detail.lastOnSite).toBe('2026-02-02');
        // The list shares the guard: a bad row must not break the whole query.
        expect(vendorService.listVendors(db, {}).vendors.find((v) => v.id === id)?.lastOnSite).toBe(
          '2026-02-02',
        );
      });
    });

    describe('list money fields and the still_to_pay sort', () => {
      function seedMoney() {
        const low = createTestVendor('Low Co').id;
        const high = createTestVendor('High Co').id;
        const zeroB = createTestVendor('Zero B').id;
        const zeroA = createTestVendor('Zero A').id;
        addInvoice(low, 'pending', 100);
        addInvoice(high, 'pending', 900);
        const offer = addInvoice(high, 'quotation', 1000);
        addProgress(offer, 250, 'paid');
        addInvoice(zeroB, 'paid', 40);
        return { low, high, zeroA, zeroB };
      }

      it('attaches stillToPay, paid and offers to each row and equals the detail', () => {
        const { low, high, zeroA } = seedMoney();
        const rows = vendorService.listVendors(db, {}).vendors;

        for (const id of [low, high, zeroA]) {
          const row = rows.find((v) => v.id === id)!;
          const detail = vendorService.getVendorById(db, id);
          expect(row.stillToPay).toBe(detail.stillToPay);
          expect(row.paid).toBe(detail.paid);
          expect(row.offers).toEqual(detail.offers);
        }
        expect(rows.find((v) => v.id === high)!.stillToPay).toBe(900);
        expect(rows.find((v) => v.id === high)!.offers!.paid).toBe(250);
        expect(rows.find((v) => v.id === zeroA)!.offers!.count).toBe(0);
      });

      it('sorts ascending by still to pay, ties by name then id', () => {
        seedMoney();
        const asc = vendorService.listVendors(db, { sortBy: 'still_to_pay', sortOrder: 'asc' });

        expect(asc.vendors.map((v) => v.name)).toEqual(['Zero A', 'Zero B', 'Low Co', 'High Co']);
      });

      it('sorts descending by still to pay and keeps the zero tie in name order', () => {
        seedMoney();
        const desc = vendorService.listVendors(db, { sortBy: 'still_to_pay', sortOrder: 'desc' });

        expect(desc.vendors.map((v) => v.name)).toEqual(['High Co', 'Low Co', 'Zero A', 'Zero B']);
      });

      it('breaks equal figures and equal names by id', () => {
        const ids = [createTestVendor('Twin').id, createTestVendor('Twin').id].sort();

        for (const sortOrder of ['asc', 'desc'] as const) {
          const rows = vendorService.listVendors(db, { sortBy: 'still_to_pay', sortOrder });
          expect(rows.vendors.map((v) => v.id)).toEqual(ids);
        }
      });

      it('pages after the sort and keeps totalItems', () => {
        seedMoney();
        const page1 = vendorService.listVendors(db, {
          sortBy: 'still_to_pay',
          sortOrder: 'desc',
          page: 1,
          pageSize: 3,
        });
        const page2 = vendorService.listVendors(db, {
          sortBy: 'still_to_pay',
          sortOrder: 'desc',
          page: 2,
          pageSize: 3,
        });

        expect(page1.vendors.map((v) => v.name)).toEqual(['High Co', 'Low Co', 'Zero A']);
        expect(page2.vendors.map((v) => v.name)).toEqual(['Zero B']);
        expect(page1.pagination.totalItems).toBe(4);
        expect(page2.vendors[0]!.stillToPay).toBe(0);
        expect(page2.vendors[0]!.paid).toBe(40);
      });

      it('applies the filter before sorting and hydrates list-only fields', () => {
        const { high } = seedMoney();
        addContact2244(high);
        const result = vendorService.listVendors(db, {
          q: 'High',
          sortBy: 'still_to_pay',
          sortOrder: 'asc',
        });

        expect(result.vendors.map((v) => v.name)).toEqual(['High Co']);
        expect(result.vendors[0]!.contactCount).toBe(1);
        expect(result.vendors[0]!.firstContactPhone).toBe('555-0100');
      });

      it('returns an empty page for an empty filter result', () => {
        seedMoney();
        const result = vendorService.listVendors(db, {
          q: 'nomatchxyz',
          sortBy: 'still_to_pay',
          sortOrder: 'asc',
        });

        expect(result.vendors).toEqual([]);
        expect(result.pagination.totalItems).toBe(0);
      });

      function addContact2244(vendorId: string) {
        db.insert(schema.vendorContacts)
          .values({
            id: `vc2244-${vendorId}`,
            vendorId,
            name: 'Pat',
            phone: '555-0100',
            createdAt: AT,
            updatedAt: AT,
          })
          .run();
      }
    });
  });

  describe('gaps closed with #2244 (whole-file coverage)', () => {
    it('rejects an unknown tradeId on create and on update', () => {
      const userId = createTestUser('gap@test.com', 'Gap');
      const vendor = createTestVendor('Gap Co');

      expect(() =>
        vendorService.createVendor(db, { name: 'New', tradeId: 'no-such-trade' }, userId),
      ).toThrow('Trade does not exist');
      expect(() => vendorService.updateVendor(db, vendor.id, { tradeId: 'no-such-trade' })).toThrow(
        'Trade does not exist',
      );
    });

    it('still_to_pay: a page past the last page is empty and totalItems stays correct', () => {
      createTestVendor('One');
      createTestVendor('Two');

      const result = vendorService.listVendors(db, {
        sortBy: 'still_to_pay',
        sortOrder: 'asc',
        page: 5,
        pageSize: 2,
      });

      expect(result.vendors).toEqual([]);
      expect(result.pagination.totalItems).toBe(2);
      expect(result.pagination.page).toBe(5);
    });

    it('carries a stored trade translationKey and sorts by updated_at ascending', () => {
      const trade = createTestTrade('Plumbing');
      db.update(schema.trades)
        .set({ translationKey: 'trades.plumbing' })
        .where(eq(schema.trades.id, trade.id))
        .run();
      const first = createTestVendor('Older', { tradeId: trade.id });
      createTestVendor('Newer');

      const detail = vendorService.getVendorById(db, first.id);
      expect(detail.trade?.translationKey).toBe('trades.plumbing');

      const asc = vendorService.listVendors(db, { sortBy: 'updated_at', sortOrder: 'asc' });
      expect(asc.vendors.map((v) => v.name)).toEqual(['Older', 'Newer']);
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
      expect(result.trade).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
      expect(result.address).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a vendor with all fields', () => {
      const userId = createTestUser('creator@test.com', 'Creator');
      const trade = createTestTrade('Plumbing');
      const data: CreateVendorRequest = {
        name: 'Full Vendor',
        tradeId: trade.id,
        phone: '+1 555-0001',
        email: 'full@vendor.com',
        address: '100 Oak Ave, Springfield IL',
        notes: 'Best vendor in town',
      };

      const result = vendorService.createVendor(db, data, userId);

      expect(result.name).toBe('Full Vendor');
      expect(result.trade).not.toBeNull();
      expect(result.trade!.id).toBe(trade.id);
      expect(result.trade!.name).toBe('Plumbing');
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

      expect(result.trade).toBeNull();
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

    it('returns VendorDetail shape with invoiceCount and stillToPay', () => {
      const vendor = createTestVendor('Invoice Vendor');
      createTestInvoice(vendor.id, 'pending', 750);

      const result = vendorService.updateVendor(db, vendor.id, { name: 'Updated Invoice Vendor' });

      expect(result.invoiceCount).toBe(1);
      expect(result.stillToPay).toBe(750);
    });

    it('updates tradeId only (partial update)', () => {
      const roofing = createTestTrade('Roofing');
      const electrical = createTestTrade('Electrical');
      const vendor = createTestVendor('Partial Vendor', {
        tradeId: roofing.id,
        phone: '555-1234',
      });

      const result = vendorService.updateVendor(db, vendor.id, {
        tradeId: electrical.id,
      });

      expect(result.name).toBe('Partial Vendor');
      expect(result.trade).not.toBeNull();
      expect(result.trade!.id).toBe(electrical.id);
      expect(result.trade!.name).toBe('Electrical');
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

    it('clears tradeId by setting to null', () => {
      const plumbing = createTestTrade('Plumbing');
      const vendor = createTestVendor('Trade Vendor', { tradeId: plumbing.id });

      const result = vendorService.updateVendor(db, vendor.id, { tradeId: null });

      expect(result.trade).toBeNull();
    });

    it('clears phone by setting to null', () => {
      const vendor = createTestVendor('Phone Clear Vendor', { phone: '555-1111' });

      const result = vendorService.updateVendor(db, vendor.id, { phone: null });

      expect(result.phone).toBeNull();
    });

    it('updates multiple fields at once', () => {
      const roofing = createTestTrade('Roofing');
      const electrical = createTestTrade('Electrical');
      const vendor = createTestVendor('Multi Update Vendor', {
        tradeId: roofing.id,
        phone: '555-0000',
      });

      const result = vendorService.updateVendor(db, vendor.id, {
        name: 'Updated Multi Vendor',
        tradeId: electrical.id,
        phone: '555-9999',
        email: 'multi@vendor.com',
      });

      expect(result.name).toBe('Updated Multi Vendor');
      expect(result.trade).not.toBeNull();
      expect(result.trade!.id).toBe(electrical.id);
      expect(result.trade!.name).toBe('Electrical');
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

      // Deterministic clock: ms-precision ISO timestamps can collide on a fast runner, so jump the

      // system time forward instead of sleeping (restored by the file-level afterEach).

      jest.useFakeTimers({ now: Date.now() + 60_000, doNotFake: DO_NOT_FAKE_TIMERS });

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
      expect(thrown?.details?.budgetLineCount).toBe(0);
    });

    it('VendorInUseError includes budgetLineCount in details', () => {
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
      expect(thrown?.details?.budgetLineCount).toBe(2);
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
      expect(thrown?.details?.budgetLineCount).toBe(1);
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

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as tradeService from './tradeService.js';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  TradeInUseError,
} from '../errors/AppError.js';
import type { CreateTradeRequest, UpdateTradeRequest } from '@cornerstone/shared';

describe('Trade Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  let tradeTimestampOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Helper: Insert a trade directly into the database.
   */
  function createTestTrade(
    name: string,
    options: {
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
    } = {},
  ) {
    const id = `trade-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + tradeTimestampOffset).toISOString();
    tradeTimestampOffset += 1;

    db.insert(schema.trades)
      .values({
        id,
        name,
        description: options.description ?? null,
        color: options.color ?? null,
        sortOrder: options.sortOrder ?? 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name, ...options, createdAt: timestamp, updatedAt: timestamp };
  }

  /**
   * Helper: Insert a vendor referencing a trade.
   */
  function createTestVendor(tradeId: string) {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name: `Test Vendor ${id}`,
        tradeId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    tradeTimestampOffset = 0;
    // Migration 0028 seeds 15 default trades — delete them so tests start with an empty table
    db.delete(schema.trades).run();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listTrades() ──────────────────────────────────────────────────────────

  describe('listTrades()', () => {
    it('returns empty list when no trades exist', () => {
      const result = tradeService.listTrades(db);
      expect(result).toHaveLength(0);
    });

    it('returns all trades when multiple exist', () => {
      createTestTrade('Plumbing');
      createTestTrade('Electrical');
      createTestTrade('Carpentry');

      const result = tradeService.listTrades(db);
      expect(result).toHaveLength(3);
    });

    it('returns trades sorted by sortOrder ascending, then name ascending', () => {
      createTestTrade('Zeta Trade', { sortOrder: 10 });
      createTestTrade('Alpha Trade', { sortOrder: 5 });
      createTestTrade('Beta Trade', { sortOrder: 5 });

      const result = tradeService.listTrades(db);
      expect(result[0]!.name).toBe('Alpha Trade');
      expect(result[1]!.name).toBe('Beta Trade');
      expect(result[2]!.name).toBe('Zeta Trade');
    });

    it('returns all trade fields', () => {
      const trade = createTestTrade('Test Plumbing', {
        description: 'Pipe and drain work',
        color: '#3B82F6',
        sortOrder: 5,
      });

      const result = tradeService.listTrades(db);
      const found = result.find((t) => t.id === trade.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test Plumbing');
      expect(found!.description).toBe('Pipe and drain work');
      expect(found!.color).toBe('#3B82F6');
      expect(found!.sortOrder).toBe(5);
      expect(found!.createdAt).toBeDefined();
      expect(found!.updatedAt).toBeDefined();
    });

    it('filters trades by name search (case-insensitive)', () => {
      createTestTrade('Plumbing');
      createTestTrade('Electrical');
      createTestTrade('PLUMBING Fixtures');

      const result = tradeService.listTrades(db, 'plumbing');
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.name.toLowerCase().includes('plumbing'))).toBe(true);
    });

    it('returns empty list when search matches nothing', () => {
      createTestTrade('Plumbing');
      createTestTrade('Electrical');

      const result = tradeService.listTrades(db, 'nonexistent');
      expect(result).toHaveLength(0);
    });

    it('returns all trades when search is empty string (no filter)', () => {
      createTestTrade('Plumbing');
      createTestTrade('Electrical');

      const result = tradeService.listTrades(db, '');
      expect(result).toHaveLength(2);
    });

    it('returns trades with null description and null color', () => {
      const trade = createTestTrade('Masonry', { description: null, color: null });

      const result = tradeService.listTrades(db);
      const found = result.find((t) => t.id === trade.id);
      expect(found).toBeDefined();
      expect(found!.description).toBeNull();
      expect(found!.color).toBeNull();
    });
  });

  // ─── getTradeById() ────────────────────────────────────────────────────────

  describe('getTradeById()', () => {
    it('returns a trade by ID', () => {
      const trade = createTestTrade('Roofing', { color: '#FF5733', sortOrder: 2 });

      const result = tradeService.getTradeById(db, trade.id);

      expect(result.id).toBe(trade.id);
      expect(result.name).toBe('Roofing');
      expect(result.color).toBe('#FF5733');
      expect(result.sortOrder).toBe(2);
    });

    it('throws NotFoundError when trade does not exist', () => {
      expect(() => {
        tradeService.getTradeById(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        tradeService.getTradeById(db, 'non-existent-id');
      }).toThrow('Trade not found');
    });

    it('returns trade with null description and color', () => {
      const trade = createTestTrade('Glazing', { description: null, color: null });

      const result = tradeService.getTradeById(db, trade.id);

      expect(result.description).toBeNull();
      expect(result.color).toBeNull();
    });
  });

  // ─── createTrade() ─────────────────────────────────────────────────────────

  describe('createTrade()', () => {
    it('creates a trade with name only', () => {
      const data: CreateTradeRequest = { name: 'HVAC' };

      const result = tradeService.createTrade(db, data);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('HVAC');
      expect(result.description).toBeNull();
      expect(result.color).toBeNull();
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a trade with all fields', () => {
      const data: CreateTradeRequest = {
        name: 'Custom Electrical',
        description: 'Wiring and electrical work',
        color: '#FFAA00',
        sortOrder: 3,
      };

      const result = tradeService.createTrade(db, data);

      expect(result.name).toBe('Custom Electrical');
      expect(result.description).toBe('Wiring and electrical work');
      expect(result.color).toBe('#FFAA00');
      expect(result.sortOrder).toBe(3);
    });

    it('trims leading and trailing whitespace from name', () => {
      const data: CreateTradeRequest = { name: '  Tiling  ' };

      const result = tradeService.createTrade(db, data);

      expect(result.name).toBe('Tiling');
    });

    it('persists trade in the database', () => {
      const data: CreateTradeRequest = { name: 'Landscaping' };
      const created = tradeService.createTrade(db, data);

      const fetched = tradeService.getTradeById(db, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Landscaping');
    });

    it('throws ValidationError for empty name', () => {
      const data: CreateTradeRequest = { name: '' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow('Trade name must be between 1 and 200 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const data: CreateTradeRequest = { name: '   ' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const data: CreateTradeRequest = { name: 'a'.repeat(201) };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow('Trade name must be between 1 and 200 characters');
    });

    it('accepts name with exactly 200 characters', () => {
      const name = 'T'.repeat(200);
      const data: CreateTradeRequest = { name };

      const result = tradeService.createTrade(db, data);

      expect(result.name).toBe(name);
    });

    it('throws ValidationError for description exceeding 2000 characters', () => {
      const data: CreateTradeRequest = {
        name: 'Test Trade',
        description: 'a'.repeat(2001),
      };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow('Trade description must be at most 2000 characters');
    });

    it('accepts description with exactly 2000 characters', () => {
      const data: CreateTradeRequest = {
        name: 'Test Trade',
        description: 'a'.repeat(2000),
      };

      const result = tradeService.createTrade(db, data);

      expect(result.description).toHaveLength(2000);
    });

    it('throws ValidationError for invalid hex color format (no hash)', () => {
      const data: CreateTradeRequest = { name: 'Test Trade', color: 'FF5733' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow('Color must be a hex color code in format #RRGGBB');
    });

    it('throws ValidationError for color as a word', () => {
      const data: CreateTradeRequest = { name: 'Test Trade', color: 'blue' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for 3-digit hex color', () => {
      const data: CreateTradeRequest = { name: 'Test Trade', color: '#FFF' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const data: CreateTradeRequest = { name: 'Test Trade', sortOrder: -1 };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ValidationError);

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow('Sort order must be a non-negative integer');
    });

    it('throws ConflictError for duplicate name (exact match)', () => {
      createTestTrade('Plumbing');
      const data: CreateTradeRequest = { name: 'Plumbing' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ConflictError);

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow('A trade with this name already exists');
    });

    it('throws ConflictError for duplicate name (case-insensitive)', () => {
      createTestTrade('Electrical');
      const data: CreateTradeRequest = { name: 'ELECTRICAL' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ConflictError);
    });

    it('throws ConflictError for duplicate name after trimming', () => {
      createTestTrade('Carpentry');
      const data: CreateTradeRequest = { name: '  CARPENTRY  ' };

      expect(() => {
        tradeService.createTrade(db, data);
      }).toThrow(ConflictError);
    });

    it('accepts null color without validation error', () => {
      const data: CreateTradeRequest = { name: 'Test Trade', color: null };

      const result = tradeService.createTrade(db, data);

      expect(result.color).toBeNull();
    });

    it('accepts null description without validation error', () => {
      const data: CreateTradeRequest = { name: 'Test Trade', description: null };

      const result = tradeService.createTrade(db, data);

      expect(result.description).toBeNull();
    });

    it('creates trade with sortOrder 0 by default', () => {
      const data: CreateTradeRequest = { name: 'Default Sort Trade' };

      const result = tradeService.createTrade(db, data);

      expect(result.sortOrder).toBe(0);
    });
  });

  // ─── updateTrade() ─────────────────────────────────────────────────────────

  describe('updateTrade()', () => {
    it('updates the name of an existing trade', () => {
      const trade = createTestTrade('Old Trade Name');

      const data: UpdateTradeRequest = { name: 'New Trade Name' };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.id).toBe(trade.id);
      expect(result.name).toBe('New Trade Name');
    });

    it('updates description only (partial update)', () => {
      const trade = createTestTrade('Plumbing Spec', { color: '#FF0000', sortOrder: 3 });

      const data: UpdateTradeRequest = { description: 'Updated description' };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.name).toBe('Plumbing Spec');
      expect(result.description).toBe('Updated description');
      expect(result.color).toBe('#FF0000');
      expect(result.sortOrder).toBe(3);
    });

    it('updates color only', () => {
      const trade = createTestTrade('Electrical Work', { color: '#FF0000' });

      const data: UpdateTradeRequest = { color: '#00FF00' };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.color).toBe('#00FF00');
      expect(result.name).toBe('Electrical Work');
    });

    it('removes color by setting to null', () => {
      const trade = createTestTrade('Tiling Work', { color: '#FF0000' });

      const data: UpdateTradeRequest = { color: null };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.color).toBeNull();
    });

    it('removes description by setting to null', () => {
      const trade = createTestTrade('Roofing Spec', { description: 'Some description' });

      const data: UpdateTradeRequest = { description: null };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.description).toBeNull();
    });

    it('updates sortOrder only', () => {
      const trade = createTestTrade('HVAC Work', { sortOrder: 1 });

      const data: UpdateTradeRequest = { sortOrder: 10 };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.sortOrder).toBe(10);
      expect(result.name).toBe('HVAC Work');
    });

    it('updates all fields at once', () => {
      const trade = createTestTrade('Old Trade', {
        description: 'Old desc',
        color: '#000000',
        sortOrder: 1,
      });

      const data: UpdateTradeRequest = {
        name: 'New Trade',
        description: 'New description',
        color: '#FFFFFF',
        sortOrder: 99,
      };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.name).toBe('New Trade');
      expect(result.description).toBe('New description');
      expect(result.color).toBe('#FFFFFF');
      expect(result.sortOrder).toBe(99);
    });

    it('trims name before updating', () => {
      const trade = createTestTrade('Old Trade Name');

      const data: UpdateTradeRequest = { name: '  Trimmed Name  ' };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.name).toBe('Trimmed Name');
    });

    it('allows updating name to the same value (no conflict with itself)', () => {
      const trade = createTestTrade('Same Name Trade');

      const data: UpdateTradeRequest = { name: 'Same Name Trade' };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.name).toBe('Same Name Trade');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const trade = createTestTrade('Timestamp Test');

      await new Promise((resolve) => setTimeout(resolve, 1));

      const data: UpdateTradeRequest = { name: 'Updated Trade' };
      const result = tradeService.updateTrade(db, trade.id, data);

      expect(result.updatedAt).not.toBe(trade.createdAt);
    });

    it('throws NotFoundError when trade does not exist', () => {
      const data: UpdateTradeRequest = { name: 'Test' };

      expect(() => {
        tradeService.updateTrade(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);

      expect(() => {
        tradeService.updateTrade(db, 'non-existent-id', data);
      }).toThrow('Trade not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const trade = createTestTrade('Test Trade');

      const data: UpdateTradeRequest = {};

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ValidationError);

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name', () => {
      const trade = createTestTrade('Test Trade');

      const data: UpdateTradeRequest = { name: '' };

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const trade = createTestTrade('Test Trade');

      const data: UpdateTradeRequest = { name: 'a'.repeat(201) };

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid hex color format', () => {
      const trade = createTestTrade('Test Trade');

      const data: UpdateTradeRequest = { color: 'not-a-color' };

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative sortOrder', () => {
      const trade = createTestTrade('Test Trade');

      const data: UpdateTradeRequest = { sortOrder: -5 };

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ValidationError);
    });

    it('throws ConflictError when new name conflicts with another trade (excluding self)', () => {
      createTestTrade('Plumbing');
      const trade = createTestTrade('Electrical');

      const data: UpdateTradeRequest = { name: 'Plumbing' };

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ConflictError);

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow('A trade with this name already exists');
    });

    it('throws ConflictError for case-insensitive name conflict excluding self', () => {
      createTestTrade('Roofing');
      const trade = createTestTrade('HVAC');

      const data: UpdateTradeRequest = { name: 'ROOFING' };

      expect(() => {
        tradeService.updateTrade(db, trade.id, data);
      }).toThrow(ConflictError);
    });
  });

  // ─── deleteTrade() ─────────────────────────────────────────────────────────

  describe('deleteTrade()', () => {
    it('deletes a trade successfully', () => {
      const trade = createTestTrade('Delete Me Trade');

      tradeService.deleteTrade(db, trade.id);

      expect(() => {
        tradeService.getTradeById(db, trade.id);
      }).toThrow(NotFoundError);
    });

    it('removes trade from list after deletion', () => {
      const trade1 = createTestTrade('Trade One');
      createTestTrade('Trade Two');

      tradeService.deleteTrade(db, trade1.id);

      const result = tradeService.listTrades(db);
      expect(result.find((t) => t.id === trade1.id)).toBeUndefined();
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundError when trade does not exist', () => {
      expect(() => {
        tradeService.deleteTrade(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        tradeService.deleteTrade(db, 'non-existent-id');
      }).toThrow('Trade not found');
    });

    it('throws TradeInUseError when trade is referenced by a vendor', () => {
      const trade = createTestTrade('In Use Trade');
      createTestVendor(trade.id);

      expect(() => {
        tradeService.deleteTrade(db, trade.id);
      }).toThrow(TradeInUseError);

      expect(() => {
        tradeService.deleteTrade(db, trade.id);
      }).toThrow('Trade is in use and cannot be deleted');
    });

    it('includes vendorCount in TradeInUseError details', () => {
      const trade = createTestTrade('Vendor Count Trade');
      createTestVendor(trade.id);
      createTestVendor(trade.id);
      createTestVendor(trade.id);

      let thrownError: TradeInUseError | null = null;
      try {
        tradeService.deleteTrade(db, trade.id);
      } catch (err) {
        if (err instanceof TradeInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError?.details?.vendorCount).toBe(3);
    });

    it('TradeInUseError has code TRADE_IN_USE and statusCode 409', () => {
      const trade = createTestTrade('Code Check Trade');
      createTestVendor(trade.id);

      let thrownError: TradeInUseError | null = null;
      try {
        tradeService.deleteTrade(db, trade.id);
      } catch (err) {
        if (err instanceof TradeInUseError) {
          thrownError = err;
        }
      }

      expect(thrownError?.code).toBe('TRADE_IN_USE');
      expect(thrownError?.statusCode).toBe(409);
    });

    it('can delete trade not referenced by any vendor', () => {
      const trade1 = createTestTrade('Safe Trade');
      const trade2 = createTestTrade('Vendor Trade');
      createTestVendor(trade2.id);

      // trade1 should be safely deletable
      tradeService.deleteTrade(db, trade1.id);

      expect(() => {
        tradeService.getTradeById(db, trade1.id);
      }).toThrow(NotFoundError);

      // trade2 still exists
      const found = tradeService.getTradeById(db, trade2.id);
      expect(found.id).toBe(trade2.id);
    });
  });

  // ─── translationKey field ──────────────────────────────────────────────────

  describe('translationKey field', () => {
    it('listTrades() returns null translationKey for user-created trades', () => {
      createTestTrade('Custom Plastering');

      const result = tradeService.listTrades(db);
      const found = result.find((t) => t.name === 'Custom Plastering');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBeNull();
    });

    it('listTrades() returns translationKey for predefined trades after migration', () => {
      // Migration 0028 seeds trade-plumbing; migration 0030 sets translation_key on it.
      // We deleted seeded trades in beforeEach, so re-insert plumbing with a key.
      const now = new Date().toISOString();
      db.insert(schema.trades)
        .values({
          id: 'trade-plumbing',
          name: 'Plumbing',
          translationKey: 'trades.plumbing',
          color: null,
          description: null,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = tradeService.listTrades(db);
      const found = result.find((t) => t.id === 'trade-plumbing');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBe('trades.plumbing');
    });

    it('getTradeById() returns null translationKey for user-created trade', () => {
      const trade = createTestTrade('Bespoke Tiling');

      const result = tradeService.getTradeById(db, trade.id);
      expect(result.translationKey).toBeNull();
    });

    it('getTradeById() returns translationKey when the column is set in DB', () => {
      const now = new Date().toISOString();
      db.insert(schema.trades)
        .values({
          id: 'trade-electrical',
          name: 'Electrical',
          translationKey: 'trades.electrical',
          color: null,
          description: null,
          sortOrder: 2,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = tradeService.getTradeById(db, 'trade-electrical');
      expect(result.translationKey).toBe('trades.electrical');
    });

    it('createTrade() always sets translationKey to null on new rows', () => {
      const result = tradeService.createTrade(db, { name: 'New Insulation Trade' });
      expect(result.translationKey).toBeNull();
    });
  });
});

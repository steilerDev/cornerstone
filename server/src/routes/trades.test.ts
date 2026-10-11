import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { TradeListResponse, TradeSingleResponse, ApiErrorResponse } from '@cornerstone/shared';
import { trades, vendors } from '../db/schema.js';

describe('Trade Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-trade-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
    // Migration 0028 seeds 15 default trades — delete them so tests start with an empty table
    app.db.delete(trades).run();
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

  let tradeTimestampOffset = 0;

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

    app.db
      .insert(trades)
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
    app.db
      .insert(vendors)
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

  // ─── GET /api/trades ───────────────────────────────────────────────────────

  describe('GET /api/trades', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty list when no trades exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      expect(body.trades).toHaveLength(0);
    });

    it('returns 200 with list of trades', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Plumbing');
      createTestTrade('Electrical');

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      expect(body.trades).toHaveLength(2);
    });

    it('returns all trade fields in list', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Roofing', {
        description: 'Roof work',
        color: '#FF5733',
        sortOrder: 3,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      const found = body.trades.find((t) => t.id === trade.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Roofing');
      expect(found!.description).toBe('Roof work');
      expect(found!.color).toBe('#FF5733');
      expect(found!.sortOrder).toBe(3);
    });

    it('filters trades by search query (case-insensitive)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Plumbing');
      createTestTrade('Electrical');
      createTestTrade('Plumbing Fixtures');

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades?search=plumbing',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      expect(body.trades).toHaveLength(2);
      expect(body.trades.every((t) => t.name.toLowerCase().includes('plumbing'))).toBe(true);
    });

    it('returns empty list when search matches nothing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Plumbing');

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades?search=nonexistent',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      expect(body.trades).toHaveLength(0);
    });

    it('allows member user to list trades', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/trades ──────────────────────────────────────────────────────

  describe('POST /api/trades', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        payload: { name: 'Test Trade' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates a trade with name only (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: 'HVAC' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.id).toBeDefined();
      expect(body.trade.name).toBe('HVAC');
      expect(body.trade.description).toBeNull();
      expect(body.trade.color).toBeNull();
      expect(body.trade.sortOrder).toBe(0);
      expect(body.trade.createdAt).toBeDefined();
      expect(body.trade.updatedAt).toBeDefined();
    });

    it('creates a trade with all fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: {
          name: 'Electrical Work',
          description: 'Wiring and installations',
          color: '#FFAA00',
          sortOrder: 3,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.name).toBe('Electrical Work');
      expect(body.trade.description).toBe('Wiring and installations');
      expect(body.trade.color).toBe('#FFAA00');
      expect(body.trade.sortOrder).toBe(3);
    });

    it('trims name on creation', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: '  Tiling  ' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.name).toBe('Tiling');
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { description: 'No name' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid color format', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: 'Test Trade', color: 'blue' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 409 CONFLICT for duplicate trade name', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Plumbing');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: 'Plumbing' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('already exists');
    });

    it('returns 409 CONFLICT for duplicate name (case-insensitive)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Electrical');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: 'ELECTRICAL' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('strips unknown properties (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: 'Test Trade', unknownField: 'should be stripped' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.name).toBe('Test Trade');
    });

    it('allows member user to create a trade', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie },
        payload: { name: 'Member Created Trade' },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── GET /api/trades/:id ───────────────────────────────────────────────────

  describe('GET /api/trades/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/trades/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with trade by ID', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Masonry', { color: '#FF5733', sortOrder: 2 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.id).toBe(trade.id);
      expect(body.trade.name).toBe('Masonry');
      expect(body.trade.color).toBe('#FF5733');
      expect(body.trade.sortOrder).toBe(2);
    });

    it('returns 404 NOT_FOUND for non-existent trade', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('allows member user to get trade by ID', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const trade = createTestTrade('Member View Trade');

      const response = await app.inject({
        method: 'GET',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── PATCH /api/trades/:id ─────────────────────────────────────────────────

  describe('PATCH /api/trades/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/trades/some-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('updates trade name (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Old Trade Name', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { name: 'New Trade Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.id).toBe(trade.id);
      expect(body.trade.name).toBe('New Trade Name');
      expect(body.trade.color).toBe('#FF0000'); // Unchanged
    });

    it('updates description only (partial update, 200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Test Trade');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { description: 'Updated description' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.description).toBe('Updated description');
      expect(body.trade.name).toBe('Test Trade'); // Unchanged
    });

    it('clears color by setting to null (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Color Trade', { color: '#FF0000' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { color: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.color).toBeNull();
    });

    it('updates sortOrder (200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Sort Order Trade', { sortOrder: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { sortOrder: 99 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.sortOrder).toBe(99);
    });

    it('allows updating name to the same value (no conflict, 200)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Same Name Trade');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { name: 'Same Name Trade' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.name).toBe('Same Name Trade');
    });

    it('returns 409 CONFLICT when name conflicts with another trade (excluding self)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Plumbing');
      const trade = createTestTrade('Electrical');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { name: 'Plumbing' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 409 CONFLICT for case-insensitive name conflict', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Roofing');
      const trade = createTestTrade('HVAC');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { name: 'ROOFING' },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Empty PATCH Trade');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid color in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Color Test Trade');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { color: 'not-valid' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND for non-existent trade', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/trades/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('allows member user to update a trade', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const trade = createTestTrade('Member Update Trade');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
        payload: { name: 'Member Updated Trade' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.name).toBe('Member Updated Trade');
    });
  });

  // ─── DELETE /api/trades/:id ────────────────────────────────────────────────

  describe('DELETE /api/trades/:id', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/trades/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('deletes a trade successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Delete Me Trade');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('trade no longer accessible after deletion', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Gone Trade');

      await app.inject({
        method: 'DELETE',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(getResponse.statusCode).toBe(404);
    });

    it('returns 404 NOT_FOUND for non-existent trade', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/trades/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 TRADE_IN_USE when trade is referenced by a vendor', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('In Use Trade');
      createTestVendor(trade.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('TRADE_IN_USE');
    });

    it('suppresses details in 409 TRADE_IN_USE response (suppressDetails=true)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Detail Suppressed Trade');
      createTestVendor(trade.id);
      createTestVendor(trade.id);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('TRADE_IN_USE');
      expect(body.error.details).toBeUndefined();
    });

    it('allows member user to delete a trade', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const trade = createTestTrade('Member Delete Trade');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ─── translationKey field in API responses ─────────────────────────────────

  describe('translationKey field in API responses', () => {
    it('GET /api/trades returns null translationKey for user-created trades', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      createTestTrade('Custom Scaffolding');

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      const found = body.trades.find((t) => t.name === 'Custom Scaffolding');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBeNull();
    });

    it('GET /api/trades returns translationKey for predefined seeded trades', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      // Re-insert a predefined trade with its translation key (seeded tables were cleared in beforeEach)
      const now = new Date().toISOString();
      app.db
        .insert(trades)
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

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeListResponse>();
      const found = body.trades.find((t) => t.id === 'trade-plumbing');
      expect(found).toBeDefined();
      expect(found!.translationKey).toBe('trades.plumbing');
    });

    it('GET /api/trades/:id returns null translationKey for user-created trade', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const trade = createTestTrade('Bespoke Ironwork');

      const response = await app.inject({
        method: 'GET',
        url: `/api/trades/${trade.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.translationKey).toBeNull();
    });

    it('GET /api/trades/:id returns translationKey when set on the row', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const now = new Date().toISOString();
      app.db
        .insert(trades)
        .values({
          id: 'trade-carpentry',
          name: 'Carpentry',
          translationKey: 'trades.carpentry',
          color: null,
          description: null,
          sortOrder: 5,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/trades/trade-carpentry',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.translationKey).toBe('trades.carpentry');
    });

    it('POST /api/trades always creates trade with null translationKey', async () => {
      const { cookie } = await createUserWithSession(
        'admin@test.com',
        'Admin',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/trades',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New Waterproofing Trade' }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<TradeSingleResponse>();
      expect(body.trade.translationKey).toBeNull();
    });
  });

  describe('GET /api/trades vendorCount (#2213)', () => {
    it('returns the number of companies per trade', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const a = createTestTrade('Alpha Trade', { sortOrder: 1 });
      const b = createTestTrade('Beta Trade', { sortOrder: 2 });
      createTestVendor(a.id);
      createTestVendor(a.id);

      const response = await app.inject({ method: 'GET', url: '/api/trades', headers: { cookie } });

      const list = response.json<TradeListResponse>().trades;
      expect(list.map((t) => [t.id, t.vendorCount])).toEqual([
        [a.id, 2],
        [b.id, 0],
      ]);
    });
  });

  describe('PATCH /api/trades/:id rename rule (#2213)', () => {
    function insertBuiltIn() {
      const now = new Date().toISOString();
      app.db
        .insert(trades)
        .values({
          id: 'trade-built-in',
          name: 'Plumbing',
          translationKey: 'trades.plumbing',
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    async function patch(body: Record<string, unknown>) {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      return app.inject({
        method: 'PATCH',
        url: '/api/trades/trade-built-in',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    it('clears translationKey when the name changes', async () => {
      insertBuiltIn();
      const res = await patch({ name: 'Sanitary' });
      expect(res.statusCode).toBe(200);
      expect(res.json<TradeSingleResponse>().trade.translationKey).toBeNull();
    });

    it('keeps translationKey when the name is unchanged', async () => {
      insertBuiltIn();
      const res = await patch({ name: 'Plumbing' });
      expect(res.json<TradeSingleResponse>().trade.translationKey).toBe('trades.plumbing');
    });
  });

  describe('POST /api/trades/:id/merge (#2213)', () => {
    async function merge(id: string, body: unknown, cookie?: string) {
      return app.inject({
        method: 'POST',
        url: `/api/trades/${id}/merge`,
        headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    it('returns 401 without authentication', async () => {
      const a = createTestTrade('Source Trade');
      const b = createTestTrade('Target Trade');
      const res = await merge(a.id, { targetTradeId: b.id });
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
      expect(app.db.select().from(trades).all()).toHaveLength(2);
    });

    it('returns 200 with the kept trade and movedVendorCount, for a member too', async () => {
      const { cookie } = await createUserWithSession('m@test.com', 'Member', 'password', 'member');
      const a = createTestTrade('Source Trade');
      const b = createTestTrade('Target Trade');
      createTestVendor(a.id);
      createTestVendor(a.id);
      createTestVendor(b.id);

      const res = await merge(a.id, { targetTradeId: b.id }, cookie);

      expect(res.statusCode).toBe(200);
      const body = res.json<{
        trade: { id: string; vendorCount: number };
        movedVendorCount: number;
      }>();
      expect(body.movedVendorCount).toBe(2);
      expect(body.trade).toMatchObject({ id: b.id, vendorCount: 3 });
      expect(
        app.db
          .select()
          .from(trades)
          .all()
          .map((t) => t.id),
      ).toEqual([b.id]);
      expect(
        app.db
          .select()
          .from(vendors)
          .all()
          .every((v) => v.tradeId === b.id),
      ).toBe(true);
    });

    it('returns 200 with movedVendorCount 0 for a trade without companies', async () => {
      const { cookie } = await createUserWithSession('u@test.com', 'User', 'password');
      const a = createTestTrade('Source Trade');
      const b = createTestTrade('Target Trade');
      const res = await merge(a.id, { targetTradeId: b.id }, cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json<{ movedVendorCount: number }>().movedVendorCount).toBe(0);
    });

    it('returns 404 for an unknown trade', async () => {
      const { cookie } = await createUserWithSession('u@test.com', 'User', 'password');
      const b = createTestTrade('Target Trade');
      const res = await merge('nope', { targetTradeId: b.id }, cookie);
      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
    });

    it('returns 404 for a second merge of the same trade (double submit)', async () => {
      const { cookie } = await createUserWithSession('u@test.com', 'User', 'password');
      const a = createTestTrade('Source Trade');
      const b = createTestTrade('Target Trade');
      expect((await merge(a.id, { targetTradeId: b.id }, cookie)).statusCode).toBe(200);
      expect((await merge(a.id, { targetTradeId: b.id }, cookie)).statusCode).toBe(404);
    });

    it.each([
      ['a missing targetTradeId', {}],
      ['an empty targetTradeId', { targetTradeId: '' }],
      ['an unknown extra property', { targetTradeId: 'x', extra: 1 }],
      ['a non-string targetTradeId', { targetTradeId: 5 }],
    ])('returns 400 VALIDATION_ERROR for %s', async (_label, body) => {
      const { cookie } = await createUserWithSession('u@test.com', 'User', 'password');
      const a = createTestTrade('Source Trade');
      const res = await merge(a.id, body, cookie);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
      expect(app.db.select().from(trades).all()).toHaveLength(1);
    });

    it('returns 400 when the target is the same trade', async () => {
      const { cookie } = await createUserWithSession('u@test.com', 'User', 'password');
      const a = createTestTrade('Source Trade');
      const res = await merge(a.id, { targetTradeId: a.id }, cookie);
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when the target does not exist and keeps the companies', async () => {
      const { cookie } = await createUserWithSession('u@test.com', 'User', 'password');
      const a = createTestTrade('Source Trade');
      const v = createTestVendor(a.id);
      const res = await merge(a.id, { targetTradeId: 'no-such-trade' }, cookie);
      expect(res.statusCode).toBe(400);
      expect(
        app.db
          .select()
          .from(vendors)
          .all()
          .find((r) => r.id === v)!.tradeId,
      ).toBe(a.id);
    });
  });
});

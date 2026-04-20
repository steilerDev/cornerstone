/**
 * Integration tests for user preferences routes.
 *
 * Tests cover:
 * - GET /api/users/me/preferences (401, empty list, list with items)
 * - PATCH /api/users/me/preferences (401, 400 validation, 200 upsert, update existing)
 * - DELETE /api/users/me/preferences/:key (401, 404, 204 success)
 *
 * Uses Fastify app.inject() for in-process HTTP testing.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('Preferences Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-prefs-test-'));
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
      // ignore cleanup errors
    }
  });

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function createUserWithSession(
    email = 'user@example.com',
    role: 'admin' | 'member' = 'member',
  ): Promise<{ cookie: string; userId: string }> {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', role);
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { cookie: `cornerstone_session=${token}`, userId: user.id };
  }

  // ─── GET /api/users/me/preferences ────────────────────────────────────────

  describe('GET /api/users/me/preferences', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with empty preferences array for a new user', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ preferences: unknown[] }>();
      expect(body.preferences).toEqual([]);
    });

    it('returns 200 with preferences after upsert', async () => {
      const { cookie } = await createUserWithSession();

      // Create a preference first
      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        preferences: Array<{ key: string; value: string; updatedAt: string }>;
      }>();
      expect(body.preferences).toHaveLength(1);
      expect(body.preferences[0]!.key).toBe('theme');
      expect(body.preferences[0]!.value).toBe('dark');
      expect(typeof body.preferences[0]!.updatedAt).toBe('string');
    });

    it("returns only the authenticated user's preferences", async () => {
      const { cookie: cookie1 } = await createUserWithSession('user1@example.com');
      const { cookie: cookie2 } = await createUserWithSession('user2@example.com');

      // User 1 creates a preference
      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie: cookie1, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      // User 2 checks their own preferences
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
        headers: { cookie: cookie2 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ preferences: unknown[] }>();
      expect(body.preferences).toEqual([]);
    });
  });

  // ─── PATCH /api/users/me/preferences ──────────────────────────────────────

  describe('PATCH /api/users/me/preferences', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 when key is missing from body', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ value: 'dark' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when key is empty string', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: '', value: 'dark' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when value is missing from body', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when key exceeds 100 characters', async () => {
      const { cookie } = await createUserWithSession();
      const longKey = 'k'.repeat(101);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: longKey, value: 'dark' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 200 with the upserted preference on success', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        preference: { key: string; value: string; updatedAt: string };
      }>();
      expect(body.preference).toBeDefined();
      expect(body.preference.key).toBe('theme');
      expect(body.preference.value).toBe('dark');
      expect(typeof body.preference.updatedAt).toBe('string');
    });

    it('updates existing key without creating a duplicate', async () => {
      const { cookie } = await createUserWithSession();

      // First upsert
      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      // Second upsert with same key
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'light' }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ preference: { key: string; value: string } }>();
      expect(body.preference.value).toBe('light');

      // Verify only one row exists
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
        headers: { cookie },
      });
      const listBody = listResponse.json<{ preferences: unknown[] }>();
      expect(listBody.preferences).toHaveLength(1);
    });

    it('accepts JSON string as a valid value for dashboard.hiddenCards', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'dashboard.hiddenCards', value: '[]' }),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── DELETE /api/users/me/preferences/:key ─────────────────────────────────

  describe('DELETE /api/users/me/preferences/:key', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/theme',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 NOT_FOUND when preference key does not exist', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/non-existent-key',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 204 on successful deletion', async () => {
      const { cookie } = await createUserWithSession();

      // Create the preference first
      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/theme',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('removes the preference so it no longer appears in GET', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/theme',
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
        headers: { cookie },
      });
      const body = listResponse.json<{ preferences: unknown[] }>();
      expect(body.preferences).toEqual([]);
    });

    it('returns 404 on second delete of the same key (already deleted)', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/theme',
        headers: { cookie },
      });

      const second = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/theme',
        headers: { cookie },
      });

      expect(second.statusCode).toBe(404);
    });

    it('handles URL-encoded dot-notation keys (dashboard.hiddenCards)', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'dashboard.hiddenCards', value: '[]' }),
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/users/me/preferences/${encodeURIComponent('dashboard.hiddenCards')}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('does not delete preference for a different user', async () => {
      const { cookie: cookie1 } = await createUserWithSession('user1@example.com');
      const { cookie: cookie2 } = await createUserWithSession('user2@example.com');

      // User 1 creates a preference
      await app.inject({
        method: 'PATCH',
        url: '/api/users/me/preferences',
        headers: { cookie: cookie1, 'content-type': 'application/json' },
        payload: JSON.stringify({ key: 'theme', value: 'dark' }),
      });

      // User 2 tries to delete a key they don't have
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/preferences/theme',
        headers: { cookie: cookie2 },
      });

      // Should 404 because user 2 has no 'theme' preference
      expect(response.statusCode).toBe(404);

      // Verify user 1's preference is intact
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/users/me/preferences',
        headers: { cookie: cookie1 },
      });
      const body = listResponse.json<{ preferences: unknown[] }>();
      expect(body.preferences).toHaveLength(1);
    });
  });
});

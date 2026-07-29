/**
 * Integration tests for application settings routes.
 *
 * Tests cover:
 * - GET /api/settings (401, nulls before any write, values after write)
 * - PATCH /api/settings (401, 400 validation, partial update, null clearing, 200 shape)
 *
 * Uses Fastify app.inject() for in-process HTTP testing.
 *
 * Story: #1877 Source contact fields, household sender setting & document attachment typing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, HouseholdSettingsResponse } from '@cornerstone/shared';

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('Settings Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-settings-test-'));
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

  // ─── GET /api/settings ─────────────────────────────────────────────────────

  describe('GET /api/settings', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/settings',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with both settings null before any write', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/settings',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings).toEqual({ householdName: null, householdAddress: null });
    });

    it('returns 200 with persisted settings after a PATCH', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          householdName: 'The Smith Family',
          householdAddress: '123 Main St',
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/settings',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings).toEqual({
        householdName: 'The Smith Family',
        householdAddress: '123 Main St',
      });
    });

    it('settings are application-wide, not per-user (visible to a different authenticated user)', async () => {
      const { cookie: cookie1 } = await createUserWithSession('user1@example.com');
      const { cookie: cookie2 } = await createUserWithSession('user2@example.com');

      await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie: cookie1, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdName: 'Shared Household' }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/settings',
        headers: { cookie: cookie2 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings.householdName).toBe('Shared Household');
    });
  });

  // ─── PATCH /api/settings ────────────────────────────────────────────────────

  describe('PATCH /api/settings', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ householdName: 'Name' }),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 VALIDATION_ERROR when body is empty ({})', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when an unknown property is included (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ bogusField: 'x' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when householdName exceeds 200 characters', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdName: 'A'.repeat(201) }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when householdAddress exceeds 500 characters', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdAddress: 'B'.repeat(501) }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 200 with updated settings when only householdName is provided', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdName: 'Only Name' }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings.householdName).toBe('Only Name');
      expect(body.settings.householdAddress).toBeNull();
    });

    it('partial update leaves the other field untouched', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          householdName: 'Original Name',
          householdAddress: 'Original Address',
        }),
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdName: 'Updated Name' }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings.householdName).toBe('Updated Name');
      expect(body.settings.householdAddress).toBe('Original Address');
    });

    it('setting householdAddress to null clears the previously stored value', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdAddress: 'To Be Cleared' }),
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdAddress: null }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings.householdAddress).toBeNull();
    });

    it('returns 200 with both fields when both are provided', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          householdName: 'Both Fields',
          householdAddress: '789 Pine Rd',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdSettingsResponse>();
      expect(body.settings).toEqual({
        householdName: 'Both Fields',
        householdAddress: '789 Pine Rd',
      });
    });

    it('is accessible to a non-admin (member) user — no admin gate', async () => {
      const { cookie } = await createUserWithSession('member@example.com', 'member');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ householdName: 'Member Update' }),
      });

      expect(response.statusCode).toBe(200);
    });
  });
});

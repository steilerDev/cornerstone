/**
 * Integration tests for GET /api/config route.
 *
 * Tests cover:
 * - GET /api/config returns 200 with expected shape
 * - Default currency is EUR
 * - Response Content-Type is application/json
 * - Endpoint is accessible without authentication
 * - CURRENCY env var is reflected in the response
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import type { AppConfigResponse } from '@cornerstone/shared';

describe('Config Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-config-route-test-'));
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

  describe('GET /api/config', () => {
    it('returns 200 with currency field', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AppConfigResponse>();
      expect(body).toHaveProperty('currency');
    });

    it('returns EUR as the default currency when CURRENCY env is not set', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AppConfigResponse>();
      expect(body.currency).toBe('EUR');
    });

    it('returns application/json Content-Type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('is accessible without an authentication cookie (no 401)', async () => {
      // No cookie in request — endpoint must be publicly accessible
      const response = await app.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).not.toBe(401);
      expect(response.statusCode).toBe(200);
    });

    it('reflects CURRENCY env var in the response', async () => {
      // Must create a custom app instance AFTER setting the env var so the
      // config plugin reads the overridden value.
      process.env.CURRENCY = 'CHF';
      const customApp = await buildApp();

      try {
        const response = await customApp.inject({
          method: 'GET',
          url: '/api/config',
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<AppConfigResponse>();
        expect(body.currency).toBe('CHF');
      } finally {
        await customApp.close();
        delete process.env.CURRENCY;
      }
    });

    it('returns the exact AppConfigResponse shape with no extra fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/config',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AppConfigResponse>();
      // Only 'currency' field should be present per the API contract
      expect(Object.keys(body)).toEqual(['currency']);
    });
  });
});

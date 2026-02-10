import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('OIDC Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-oidc-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');

    // Disable OIDC by default (tests will enable when needed)
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_REDIRECT_URI;
  });

  afterEach(async () => {
    // Close the app if it was created
    if (app) {
      await app.close();
    }

    // Restore original environment
    process.env = originalEnv;

    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('GET /api/auth/oidc/login', () => {
    it('returns 404 with OIDC_NOT_CONFIGURED when OIDC is not enabled', async () => {
      // Given: Server with OIDC disabled (default)
      app = await buildApp();

      // When: Requesting OIDC login
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/login',
      });

      // Then: Returns 404
      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('OIDC_NOT_CONFIGURED');
      expect(body.error.message).toBe('OIDC is not configured');
    });

    it('accepts requests without query parameters', async () => {
      // Given: Server with OIDC disabled
      app = await buildApp();

      // When: Requesting OIDC login without redirect parameter
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/login',
      });

      // Then: Returns 404 (OIDC not configured)
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/auth/oidc/callback', () => {
    it('redirects to /login?error=oidc_not_configured when OIDC not enabled', async () => {
      // Given: Server with OIDC disabled
      app = await buildApp();

      // When: Requesting OIDC callback
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      // Then: Redirects to login with error
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/login?error=oidc_not_configured');
    });

    // NOTE: Deep callback error paths (error parameter, missing/invalid state, missing code)
    // cannot be tested as integration tests when OIDC is disabled, because the route immediately
    // returns oidc_not_configured before checking anything else. These error paths are covered
    // by unit tests in oidcService.test.ts and would require a fully configured OIDC environment
    // (with real issuer, client ID, secret, redirect URI) to test here. Since this suite tests
    // with OIDC disabled, we only verify the oidc_not_configured path.
  });

  describe('OIDC Configuration Validation', () => {
    it('oidcEnabled is false when OIDC env vars are not set', async () => {
      // Given: Server with no OIDC env vars
      app = await buildApp();

      // Then: OIDC is not enabled
      expect(app.config.oidcEnabled).toBe(false);
    });

    it('oidcEnabled is false when only some OIDC env vars are set', async () => {
      // Given: Partial OIDC configuration
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      // Missing OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI

      app = await buildApp();

      // Then: OIDC is not enabled
      expect(app.config.oidcEnabled).toBe(false);
    });

    it('oidcEnabled is true when all OIDC env vars are set', async () => {
      // Given: Complete OIDC configuration
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      process.env.OIDC_CLIENT_SECRET = 'secret-456';
      process.env.OIDC_REDIRECT_URI = 'https://app.example.com/api/auth/oidc/callback';

      app = await buildApp();

      // Then: OIDC is enabled
      expect(app.config.oidcEnabled).toBe(true);
    });
  });
});

/**
 * Integration tests for /api/auth/oidc/* route handlers.
 *
 * Covers:
 *   - Basic short-circuit behavior when OIDC is not configured
 *   - OIDC config validation (oidcEnabled derivation)
 *   - Issue #1865: account-linking behavior on /api/auth/oidc/callback —
 *     successful login via email match, rejection when no account matches,
 *     and the deactivated-account redirect still firing post-link.
 *
 * Strategy:
 *   - oidcService is fully mocked (discoverOidcConfig, buildAuthorizationUrl,
 *     consumeState, handleCallback) so the callback route can be driven via
 *     app.inject() without a real OIDC provider.
 *   - buildApp() + app.inject() for HTTP layer validation.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type * as AppModule from '../app.js';
import type * as UserServiceModule from '../services/userService.js';

// ─── Mock oidcService BEFORE importing app ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

const mockDiscoverOidcConfig = jest.fn() as AnyMock;
const mockBuildAuthorizationUrl = jest.fn() as AnyMock;
const mockConsumeState = jest.fn() as AnyMock;
const mockHandleCallback = jest.fn() as AnyMock;
const mockStoreState = jest.fn() as AnyMock;
const mockResetCache = jest.fn() as AnyMock;

jest.unstable_mockModule('../services/oidcService.js', () => ({
  discoverOidcConfig: mockDiscoverOidcConfig,
  buildAuthorizationUrl: mockBuildAuthorizationUrl,
  consumeState: mockConsumeState,
  handleCallback: mockHandleCallback,
  storeState: mockStoreState,
  resetCache: mockResetCache,
}));

// ─── Dynamic imports (after mocks) ─────────────────────────────────────────

let buildApp: typeof AppModule.buildApp;
let userService: typeof UserServiceModule;

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
    process.env.SECURE_COOKIES = 'false';

    // Disable OIDC by default (tests will enable when needed)
    delete process.env.OIDC_ISSUER;
    delete process.env.OIDC_CLIENT_ID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.EXTERNAL_URL;

    // Import modules after mocks are set up (only once)
    if (!buildApp) {
      buildApp = (await import('../app.js')).buildApp;
      userService = await import('../services/userService.js');
    }

    // Reset mocks before each test
    jest.clearAllMocks();
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

    // NOTE: Deep callback error paths that depend on state/code validation (error parameter,
    // missing/invalid state) still require a fully configured OIDC environment to reach — see
    // the "account linking" describe block below, which configures OIDC and mocks oidcService
    // so the rest of the callback flow (account resolution, linking, deactivation) can be
    // exercised via app.inject().
  });

  describe('OIDC Configuration Validation', () => {
    it('oidcEnabled is false when OIDC env vars are not set', async () => {
      // Given: Server with no OIDC env vars
      app = await buildApp();

      // Then: OIDC is not enabled
      expect(app.config.oidcEnabled).toBe(false);
    });

    it('oidcEnabled is false when only some OIDC env vars are set', async () => {
      // Given: Partial OIDC configuration (missing CLIENT_SECRET)
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      // Missing OIDC_CLIENT_SECRET

      app = await buildApp();

      // Then: OIDC is not enabled
      expect(app.config.oidcEnabled).toBe(false);
    });

    it('oidcEnabled is true when required OIDC env vars are set', async () => {
      // Given: Required OIDC configuration (redirect URI is optional)
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      process.env.OIDC_CLIENT_SECRET = 'secret-456';

      app = await buildApp();

      // Then: OIDC is enabled
      expect(app.config.oidcEnabled).toBe(true);
    });
  });

  describe('GET /api/auth/oidc/callback — account linking (issue #1865)', () => {
    beforeEach(async () => {
      // Enable OIDC for this describe block
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      process.env.OIDC_CLIENT_SECRET = 'secret-456';

      app = await buildApp();

      // Default mock behavior: discovery succeeds, state resolves to app root
      mockDiscoverOidcConfig.mockResolvedValue({});
      mockConsumeState.mockReturnValue('/');
    });

    it('logs in successfully when the OIDC email matches an existing local account', async () => {
      // Given: A pre-existing local account
      const user = await userService.createLocalUser(
        app.db,
        'match@example.com',
        'Match User',
        'password123456',
      );
      mockConsumeState.mockReturnValue('/dashboard');
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-match-1',
        email: user.email,
        name: 'Match User',
      });

      // When: The OIDC callback is invoked
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      // Then: Redirects to the original app path (not an error redirect)
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/dashboard');

      // And: A session cookie is set
      const setCookieHeader = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : setCookieHeader;
      expect(cookies).toContain('cornerstone_session=');

      // And: The account was linked (oidcSubject set), not re-created
      const linkedUser = userService.findById(app.db, user.id);
      expect(linkedUser?.oidcSubject).toBe('sub-match-1');
      expect(linkedUser?.authProvider).toBe('local');
    });

    it('redirects to /login?error=oidc_no_matching_account when no account matches by email', async () => {
      // Given: No account exists for this email
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-no-match',
        email: 'nomatch@example.com',
        name: 'No Match',
      });

      // When: The OIDC callback is invoked
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      // Then: Redirects to exactly the no-matching-account error path
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/login?error=oidc_no_matching_account');

      // And: No user was created
      expect(userService.countUsers(app.db)).toBe(0);
    });

    it('redirects to /login?error=account_deactivated for a deactivated linked account', async () => {
      // Given: A deactivated local account whose email matches the OIDC claim
      const user = await userService.createLocalUser(
        app.db,
        'deactivated@example.com',
        'Deactivated User',
        'password123456',
      );
      userService.deactivateUser(app.db, user.id);
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-deactivated',
        email: user.email,
        name: 'Deactivated User',
      });

      // When: The OIDC callback is invoked
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      // Then: Redirects to the deactivated-account error path (post-link — the account is
      // still linked even though login is rejected)
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/login?error=account_deactivated');

      const linkedUser = userService.findById(app.db, user.id);
      expect(linkedUser?.oidcSubject).toBe('sub-deactivated');
    });
  });
});

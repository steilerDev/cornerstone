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
import type * as OidcRoutesModule from './oidc.js';

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
let oidcRoutes: typeof OidcRoutesModule;

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
      oidcRoutes = await import('./oidc.js');
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
        emailVerified: true,
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
        emailVerified: true,
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
        emailVerified: true,
      });

      // When: The OIDC callback is invoked
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      // Then: Redirects to the deactivated-account error path, and the subject is NOT
      // bound (a deactivated account is never linked)
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/login?error=account_deactivated');

      const linkedUser = userService.findById(app.db, user.id);
      expect(linkedUser?.oidcSubject).toBeNull();
    });

    it('redirects to /login?error=oidc_email_unverified and does not link when the email is unverified', async () => {
      const user = await userService.createLocalUser(
        app.db,
        'unverified@example.com',
        'Unverified User',
        'password123456',
      );
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-unverified',
        email: user.email,
        emailVerified: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/login?error=oidc_email_unverified');
      const setCookie = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
      expect(cookies).not.toContain('cornerstone_session=');
      expect(userService.findById(app.db, user.id)?.oidcSubject).toBeNull();
    });

    it('logs in an already-linked subject even when the email is unverified', async () => {
      const user = await userService.createLocalUser(
        app.db,
        'linked@example.com',
        'Linked User',
        'password123456',
      );
      userService.findOrLinkOidcUser(app.db, {
        sub: 'sub-linked',
        email: user.email,
        emailVerified: true,
      });
      mockConsumeState.mockReturnValue('/dashboard');
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-linked',
        email: user.email,
        emailVerified: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/dashboard');
      const setCookie = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
      expect(cookies).toContain('cornerstone_session=');
    });

    it('re-binds a changed subject for the same email and logs a warning', async () => {
      const user = await userService.createLocalUser(
        app.db,
        'rebind@example.com',
        'Rebind User',
        'password123456',
      );
      userService.findOrLinkOidcUser(app.db, {
        sub: 'sub-old',
        email: user.email,
        emailVerified: true,
      });
      const warnSpy = jest.spyOn(app.log, 'warn');
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-new',
        email: user.email,
        emailVerified: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(userService.findById(app.db, user.id)?.oidcSubject).toBe('sub-new');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ previousSub: 'sub-old', sub: 'sub-new', userId: user.id }),
        'OIDC subject re-bound for existing account',
      );
      warnSpy.mockRestore();
    });

    it('links case-insensitively when the IdP email differs only in case', async () => {
      const user = await userService.createLocalUser(
        app.db,
        'Admin@Example.com',
        'Admin User',
        'password123456',
      );
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-case',
        email: 'admin@example.com',
        emailVerified: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz',
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(userService.findById(app.db, user.id)?.oidcSubject).toBe('sub-case');
    });

    it('does not create a new user when linking an existing account', async () => {
      const user = await userService.createLocalUser(
        app.db,
        'count@example.com',
        'Count User',
        'password123456',
      );
      const before = userService.countUsers(app.db);
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-count',
        email: user.email,
        emailVerified: true,
      });

      await app.inject({ method: 'GET', url: '/api/auth/oidc/callback?code=abc&state=xyz' });

      expect(userService.countUsers(app.db)).toBe(before);
    });
  });

  describe('GET /api/auth/oidc/callback — error paths', () => {
    beforeEach(async () => {
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      process.env.OIDC_CLIENT_SECRET = 'secret-456';
      app = await buildApp();
      mockDiscoverOidcConfig.mockResolvedValue({});
      mockConsumeState.mockReturnValue('/');
    });

    async function callback(query: string) {
      return app.inject({ method: 'GET', url: `/api/auth/oidc/callback${query}` });
    }

    it('redirects to oidc_error when the provider returns an error parameter', async () => {
      const response = await callback('?error=access_denied');
      expect(response.headers.location).toBe('/login?error=oidc_error');
    });

    it('redirects to invalid_state when the state parameter is missing', async () => {
      const response = await callback('?code=abc');
      expect(response.headers.location).toBe('/login?error=invalid_state');
    });

    it('redirects to invalid_state when the state is unknown or expired', async () => {
      mockConsumeState.mockReturnValue(undefined);
      const response = await callback('?code=abc&state=bad');
      expect(response.headers.location).toBe('/login?error=invalid_state');
    });

    it('redirects to missing_email when an unlinked identity has no email claim', async () => {
      mockHandleCallback.mockResolvedValue({ sub: 'sub-x', email: '', emailVerified: true });
      const response = await callback('?code=abc&state=xyz');
      expect(response.headers.location).toBe('/login?error=missing_email');
    });

    it('logs in a linked user even when the IdP returns no email claim', async () => {
      const user = await userService.createLocalUser(
        app.db,
        'noemail@example.com',
        'No Email',
        'password123456',
      );
      userService.findOrLinkOidcUser(app.db, {
        sub: 'sub-noemail',
        email: user.email,
        emailVerified: true,
      });
      mockConsumeState.mockReturnValue('/dashboard');
      mockHandleCallback.mockResolvedValue({ sub: 'sub-noemail', email: '', emailVerified: false });

      const response = await callback('?code=abc&state=xyz');

      expect(response.headers.location).toBe('/dashboard');
      const setCookie = response.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '');
      expect(cookies).toContain('cornerstone_session=');
    });

    it('redirects to oidc_error when the token exchange fails', async () => {
      mockHandleCallback.mockRejectedValue(new Error('boom'));
      const response = await callback('?code=abc&state=xyz');
      expect(response.headers.location).toBe('/login?error=oidc_error');
    });
  });

  describe('redirect_uri consistency across both legs (issue #2026)', () => {
    beforeEach(async () => {
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      process.env.OIDC_CLIENT_SECRET = 'secret-456';
      mockDiscoverOidcConfig.mockResolvedValue({});
      mockConsumeState.mockReturnValue('/');
      mockBuildAuthorizationUrl.mockReturnValue({
        authorizationUrl: 'https://idp/auth',
        state: 's',
      });
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-uri',
        email: 'nobody@example.com',
        emailVerified: true,
      });
    });

    function stripped(u: URL): string {
      const copy = new URL(u.href);
      copy.search = '';
      copy.hash = '';
      return copy.href;
    }

    async function runBothLegs(host: string) {
      await app.inject({ method: 'GET', url: '/api/auth/oidc/login', headers: { host } });
      await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=xyz&iss=https%3A%2F%2Foidc.example.com',
        headers: { host },
      });
      const leg1Call = mockBuildAuthorizationUrl.mock.calls[0];
      const leg2Call = mockHandleCallback.mock.calls[0];
      expect(leg1Call).toBeDefined();
      expect(leg2Call).toBeDefined();
      const leg1 = (leg1Call as unknown[])[1] as string;
      const leg2 = (leg2Call as unknown[])[1] as URL;
      return { leg1, leg2 };
    }

    it('uses EXTERNAL_URL for both legs even when the request host is internal', async () => {
      process.env.EXTERNAL_URL = 'https://cornerstone.example.com';
      app = await buildApp();

      const { leg1, leg2 } = await runBothLegs('internal.local:3000');

      expect(leg1).toBe('https://cornerstone.example.com/api/auth/oidc/callback');
      expect(stripped(leg2)).toBe(new URL(leg1).href);
      expect(leg2.searchParams.get('code')).toBe('abc');
      expect(leg2.searchParams.get('state')).toBe('xyz');
      expect(leg2.searchParams.get('iss')).toBe('https://oidc.example.com');
    });

    it('falls back to the request origin for both legs when EXTERNAL_URL is unset', async () => {
      delete process.env.EXTERNAL_URL;
      app = await buildApp();

      const { leg1, leg2 } = await runBothLegs('app.local:3000');

      expect(leg1).toBe('http://app.local:3000/api/auth/oidc/callback');
      expect(stripped(leg2)).toBe(leg1);
    });
  });

  describe('buildOidcRedirectUri', () => {
    it('exposes the callback path constant', () => {
      expect(oidcRoutes.OIDC_CALLBACK_PATH).toBe('/api/auth/oidc/callback');
    });

    it('preserves a path prefix in EXTERNAL_URL', () => {
      const uri = oidcRoutes.buildOidcRedirectUri(
        'https://example.com/cornerstone',
        'http://internal:3000',
      );
      expect(uri.href).toBe('https://example.com/cornerstone/api/auth/oidc/callback');
    });

    it('uses the request origin when no external URL is configured', () => {
      const uri = oidcRoutes.buildOidcRedirectUri(undefined, 'http://app.local:3000');
      expect(uri.href).toBe('http://app.local:3000/api/auth/oidc/callback');
    });

    it('treats an empty external URL as unset', () => {
      const uri = oidcRoutes.buildOidcRedirectUri('', 'http://app.local:3000');
      expect(uri.href).toBe('http://app.local:3000/api/auth/oidc/callback');
    });

    it('normalises an uppercase host identically on both legs', () => {
      const a = oidcRoutes.buildOidcRedirectUri(undefined, 'https://APP.Example.COM');
      const b = oidcRoutes.buildOidcRedirectUri('https://APP.Example.COM', 'http://x');
      expect(a.href).toBe('https://app.example.com/api/auth/oidc/callback');
      expect(b.href).toBe(a.href);
    });

    it('keeps a percent-encoded query intact when set via the URL setter', () => {
      const uri = oidcRoutes.buildOidcRedirectUri(undefined, 'http://app.local:3000');
      uri.search = new URL(
        '/api/auth/oidc/callback?iss=https%3A%2F%2Fidp.example.com&code=a%20b',
        'http://x',
      ).search;
      expect(uri.search).toBe('?iss=https%3A%2F%2Fidp.example.com&code=a%20b');
      expect(uri.searchParams.get('iss')).toBe('https://idp.example.com');
    });
  });

  describe('GET /api/auth/oidc/callback — JIT provisioning (issue #2142)', () => {
    const CALLBACK = '/api/auth/oidc/callback?code=abc&state=xyz';

    async function startApp(flag?: string) {
      process.env.OIDC_ISSUER = 'https://oidc.example.com';
      process.env.OIDC_CLIENT_ID = 'client-123';
      process.env.OIDC_CLIENT_SECRET = 'secret-456';
      if (flag === undefined) delete process.env.OIDC_JIT_PROVISIONING;
      else process.env.OIDC_JIT_PROVISIONING = flag;
      app = await buildApp();
      mockDiscoverOidcConfig.mockResolvedValue({});
      mockConsumeState.mockReturnValue('/');
    }

    async function seedAdmin() {
      return userService.createLocalUser(
        app.db,
        'admin@example.com',
        'Admin',
        'password123456',
        'admin',
      );
    }

    function sessionCookie(response: { headers: Record<string, unknown> }): string {
      const raw = response.headers['set-cookie'];
      const all = Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
      const match = all.map((c) => /cornerstone_session=([^;]+)/.exec(c)).find((m) => m);
      return match ? `cornerstone_session=${match[1]}` : '';
    }

    function findByEmail(email: string) {
      return userService.findByEmail(app.db, email);
    }

    it.each([['false'], [undefined]])(
      'flag off (OIDC_JIT_PROVISIONING=%s): unmatched email redirects to oidc_no_matching_account',
      async (flag) => {
        await startApp(flag);
        await seedAdmin();
        mockHandleCallback.mockResolvedValue({
          sub: 'sub-off',
          email: 'new@example.com',
          emailVerified: true,
        });

        const response = await app.inject({ method: 'GET', url: CALLBACK });

        expect(response.statusCode).toBe(302);
        expect(response.headers.location).toBe('/login?error=oidc_no_matching_account');
        expect(findByEmail('new@example.com')).toBeUndefined();
        expect(userService.countUsers(app.db)).toBe(1);
      },
    );

    it('flag on: provisions a member, sets a session cookie and logs only the user id', async () => {
      await startApp('true');
      await seedAdmin();
      mockConsumeState.mockReturnValue('/dashboard');
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-secret-xyz',
        email: 'new@example.com',
        emailVerified: true,
        name: 'New Person',
      });
      const infoSpy = jest.spyOn(app.log, 'info');

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/dashboard');
      expect(sessionCookie(response)).not.toBe('');

      const created = findByEmail('new@example.com')!;
      expect(created.role).toBe('member');
      expect(created.authProvider).toBe('oidc');
      expect(created.oidcSubject).toBe('sub-secret-xyz');
      expect(created.passwordHash).toBeNull();
      expect(created.displayName).toBe('New Person');
      expect(created.deactivatedAt).toBeNull();
      expect(userService.countUsers(app.db)).toBe(2);

      const provisionedCalls = infoSpy.mock.calls.filter((c) => c[1] === 'OIDC user provisioned');
      expect(provisionedCalls).toHaveLength(1);
      expect(provisionedCalls[0]?.[0]).toEqual({ userId: created.id });
      const serialized = JSON.stringify(provisionedCalls[0] ?? []);
      expect(serialized).not.toContain('new@example.com');
      expect(serialized).not.toContain('sub-secret-xyz');
      expect(serialized.toLowerCase()).not.toContain('token');
      infoSpy.mockRestore();
    });

    it.each([
      ['name', { name: 'Full Name', preferredUsername: 'puser' }, 'Full Name'],
      ['preferred_username', { preferredUsername: 'puser' }, 'puser'],
      ['email', {}, 'dn@example.com'],
    ])('derives the display name from %s', async (_label, claims, expected) => {
      await startApp('true');
      await seedAdmin();
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-dn',
        email: 'dn@example.com',
        emailVerified: true,
        ...claims,
      });

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.statusCode).toBe(302);
      expect(findByEmail('dn@example.com')?.displayName).toBe(expected);
    });

    it('flag on: missing email redirects to missing_email without creating a user', async () => {
      await startApp('true');
      await seedAdmin();
      mockHandleCallback.mockResolvedValue({ sub: 's-me', email: '', emailVerified: true });

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.headers.location).toBe('/login?error=missing_email');
      expect(userService.countUsers(app.db)).toBe(1);
    });

    it('flag on: unverified email redirects to oidc_email_unverified without creating a user', async () => {
      await startApp('true');
      await seedAdmin();
      mockHandleCallback.mockResolvedValue({
        sub: 's-unv',
        email: 'unv@example.com',
        emailVerified: false,
      });

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.headers.location).toBe('/login?error=oidc_email_unverified');
      expect(sessionCookie(response)).toBe('');
      expect(userService.countUsers(app.db)).toBe(1);
    });

    it('flag on: a deactivated matching account redirects to account_deactivated', async () => {
      await startApp('true');
      await seedAdmin();
      const deact = await userService.createLocalUser(
        app.db,
        'deact@example.com',
        'Deact',
        'password123456',
      );
      userService.deactivateUser(app.db, deact.id);
      mockHandleCallback.mockResolvedValue({
        sub: 's-deact',
        email: 'deact@example.com',
        emailVerified: true,
      });

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.headers.location).toBe('/login?error=account_deactivated');
      expect(sessionCookie(response)).toBe('');
      expect(userService.countUsers(app.db)).toBe(2);
    });

    it('flag on: an active matching account is linked, not duplicated', async () => {
      await startApp('true');
      await seedAdmin();
      const active = await userService.createLocalUser(
        app.db,
        'active@example.com',
        'Active',
        'password123456',
      );
      mockHandleCallback.mockResolvedValue({
        sub: 's-act',
        email: 'active@example.com',
        emailVerified: true,
      });

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/');
      expect(userService.findById(app.db, active.id)?.oidcSubject).toBe('s-act');
      expect(userService.countUsers(app.db)).toBe(2);
    });

    it('flag on: with zero users redirects to oidc_no_matching_account and creates nothing', async () => {
      await startApp('true');
      mockHandleCallback.mockResolvedValue({
        sub: 's-zero',
        email: 'first@example.com',
        emailVerified: true,
      });

      const response = await app.inject({ method: 'GET', url: CALLBACK });

      expect(response.headers.location).toBe('/login?error=oidc_no_matching_account');
      expect(userService.countUsers(app.db)).toBe(0);
    });

    it('flag on: two concurrent first logins for the same identity create exactly one user', async () => {
      await startApp('true');
      await seedAdmin();
      mockHandleCallback.mockResolvedValue({
        sub: 'sub-concurrent',
        email: 'race@example.com',
        emailVerified: true,
      });

      const [a, b] = await Promise.all([
        app.inject({ method: 'GET', url: CALLBACK }),
        app.inject({ method: 'GET', url: CALLBACK }),
      ]);

      expect(a.statusCode).toBe(302);
      expect(b.statusCode).toBe(302);
      expect(a.headers.location).toBe('/');
      expect(b.headers.location).toBe('/');
      expect(userService.countUsers(app.db)).toBe(2);

      const ids: string[] = [];
      for (const r of [a, b]) {
        const cookie = sessionCookie(r);
        expect(cookie).not.toBe('');
        const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
        expect(me.statusCode).toBe(200);
        ids.push(JSON.parse(me.body).user.id);
      }
      expect(ids[0]).toBe(ids[1]);
      expect(ids[0]).toBe(findByEmail('race@example.com')!.id);
    });
  });
});

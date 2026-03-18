import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';

describe('DAV Token Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-dav-tokens-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  async function createUserWithSession(
    email = 'user@test.com',
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  // ─── GET /api/users/me/dav/token ────────────────────────────────────────────

  describe('GET /api/users/me/dav/token', () => {
    it('returns { hasToken: false } initially', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ hasToken: boolean }>();
      expect(body.hasToken).toBe(false);
    });

    it('returns { hasToken: true, createdAt } after POST', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ hasToken: boolean; createdAt?: string }>();
      expect(body.hasToken).toBe(true);
      expect(body.createdAt).toBeDefined();
    });

    it('returns { hasToken: false } after DELETE', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      await app.inject({
        method: 'DELETE',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ hasToken: boolean }>();
      expect(body.hasToken).toBe(false);
    });

    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/token',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/users/me/dav/token ───────────────────────────────────────────

  describe('POST /api/users/me/dav/token', () => {
    it('generates token and returns it in body', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ token: string }>();
      expect(body.token).toBeDefined();
      expect(body.token).toHaveLength(64);
      expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('POST again returns a different token (regeneration)', async () => {
      const { cookie } = await createUserWithSession();

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const token1 = res1.json<{ token: string }>().token;
      const token2 = res2.json<{ token: string }>().token;
      expect(token1).not.toBe(token2);
    });

    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── DELETE /api/users/me/dav/token ─────────────────────────────────────────

  describe('DELETE /api/users/me/dav/token', () => {
    it('returns 204', async () => {
      const { cookie } = await createUserWithSession();

      // Generate first
      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/users/me/dav/token',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /api/users/me/dav/profile ─────────────────────────────────────────

  describe('GET /api/users/me/dav/profile', () => {
    it('returns 404 when no token exists', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/profile',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('DAV_TOKEN_NOT_FOUND');
    });

    it('returns .mobileconfig XML with correct Content-Type when token exists', async () => {
      const { cookie } = await createUserWithSession();

      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/profile',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/x-apple-aspen-config');
      expect(response.headers['content-disposition']).toContain('Cornerstone.mobileconfig');
    });

    it('profile XML contains CalDAV and CardDAV account payloads', async () => {
      const { cookie } = await createUserWithSession('profile@test.com');

      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/profile',
        headers: { cookie },
      });

      const body = response.payload;
      // Should contain CalDAV payload
      expect(body).toContain('com.apple.caldav.account');
      // Should contain CardDAV payload
      expect(body).toContain('com.apple.carddav.account');
      // Should contain the user's email
      expect(body).toContain('profile@test.com');
      // Should be a plist
      expect(body).toContain('<?xml');
      expect(body).toContain('<plist');
    });

    it('profile uses bare hostname (not full URL) and path-only principalURL', async () => {
      const { cookie } = await createUserWithSession('bare@test.com');

      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/profile',
        headers: { cookie },
      });

      const body = response.payload;

      // CalDAVHostName and CardDAVHostName must be bare hostname, not full URL
      expect(body).toContain('<key>CalDAVHostName</key>');
      expect(body).toContain('<key>CardDAVHostName</key>');
      // Should NOT contain protocol:// in hostname fields
      expect(body).not.toMatch(/<key>CalDAVHostName<\/key>\s*<string>https?:\/\//);
      expect(body).not.toMatch(/<key>CardDAVHostName<\/key>\s*<string>https?:\/\//);

      // PrincipalURL must be path-only
      expect(body).toContain('<key>CalDAVPrincipalURL</key>');
      expect(body).toContain('<string>/dav/principals/default/</string>');
      expect(body).toContain('<key>CardDAVPrincipalURL</key>');

      // Account description fields
      expect(body).toContain('<key>CalDAVAccountDescription</key>');
      expect(body).toContain('<string>Cornerstone Calendar</string>');
      expect(body).toContain('<key>CardDAVAccountDescription</key>');
      expect(body).toContain('<string>Cornerstone Contacts</string>');
    });

    it('profile uses EXTERNAL_URL when configured', async () => {
      // Close the current app and recreate with EXTERNAL_URL
      await app.close();
      process.env.EXTERNAL_URL = 'https://myhouse.example.com';
      app = await buildApp();

      const { cookie } = await createUserWithSession('ext@test.com');

      await app.inject({
        method: 'POST',
        url: '/api/users/me/dav/token',
        headers: { cookie },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/profile',
        headers: { cookie },
      });

      const body = response.payload;
      // HostName should be the external hostname
      expect(body).toContain('<string>myhouse.example.com</string>');
      // Port should be 443 for https
      expect(body).toContain('<integer>443</integer>');
      // UseSSL should be true
      expect(body).toContain('<key>CalDAVUseSSL</key>');
      expect(body).toContain('<true/>');
    });

    it('returns 401 without session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/me/dav/profile',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

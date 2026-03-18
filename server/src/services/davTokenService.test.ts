import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from './userService.js';
import * as davTokenService from './davTokenService.js';
import type { FastifyInstance } from 'fastify';

describe('davTokenService', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-dav-token-service-test-'));
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

  async function createUser(email = 'user@test.com') {
    return userService.createLocalUser(app.db, email, 'Test User', 'password', 'member');
  }

  // ─── getTokenStatus ────────────────────────────────────────────────────────

  describe('getTokenStatus', () => {
    it('returns { hasToken: false } for user with no token', async () => {
      const user = await createUser();
      const status = davTokenService.getTokenStatus(app.db, user.id);
      expect(status).toEqual({ hasToken: false });
    });

    it('returns { hasToken: true, createdAt } after token generation', async () => {
      const user = await createUser();
      davTokenService.generateToken(app.db, user.id);

      const status = davTokenService.getTokenStatus(app.db, user.id);
      expect(status.hasToken).toBe(true);
      expect(status.createdAt).toBeDefined();
      expect(typeof status.createdAt).toBe('string');
    });

    it('returns { hasToken: false } for unknown userId', () => {
      const status = davTokenService.getTokenStatus(app.db, 'no-such-user');
      expect(status).toEqual({ hasToken: false });
    });
  });

  // ─── generateToken ─────────────────────────────────────────────────────────

  describe('generateToken', () => {
    it('returns a 64-char hex string', async () => {
      const user = await createUser();
      const token = davTokenService.generateToken(app.db, user.id);

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('token can be validated after generation', async () => {
      const user = await createUser();
      const token = davTokenService.generateToken(app.db, user.id);

      const validated = davTokenService.validateToken(app.db, token);
      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe(user.id);
    });

    it('replaces existing token when called again', async () => {
      const user = await createUser();
      const token1 = davTokenService.generateToken(app.db, user.id);
      const token2 = davTokenService.generateToken(app.db, user.id);

      expect(token1).not.toBe(token2);

      // Old token no longer valid
      const old = davTokenService.validateToken(app.db, token1);
      expect(old).toBeNull();

      // New token is valid
      const fresh = davTokenService.validateToken(app.db, token2);
      expect(fresh).not.toBeNull();
    });

    it('generates unique tokens across different users', async () => {
      const user1 = await createUser('user1@test.com');
      const user2 = await createUser('user2@test.com');

      const token1 = davTokenService.generateToken(app.db, user1.id);
      const token2 = davTokenService.generateToken(app.db, user2.id);

      expect(token1).not.toBe(token2);
    });
  });

  // ─── validateToken ─────────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('returns { userId, email } for a valid token', async () => {
      const user = await createUser('validate@test.com');
      const token = davTokenService.generateToken(app.db, user.id);

      const result = davTokenService.validateToken(app.db, token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(user.id);
      expect(result!.email).toBe('validate@test.com');
    });

    it('returns null for an invalid/unknown token', () => {
      const result = davTokenService.validateToken(app.db, 'not-a-real-token-at-all-123456');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = davTokenService.validateToken(app.db, '');
      expect(result).toBeNull();
    });
  });

  // ─── revokeToken ───────────────────────────────────────────────────────────

  describe('revokeToken', () => {
    it('clears token; subsequent validateToken returns null', async () => {
      const user = await createUser();
      const token = davTokenService.generateToken(app.db, user.id);

      // Confirm valid before revoke
      expect(davTokenService.validateToken(app.db, token)).not.toBeNull();

      davTokenService.revokeToken(app.db, user.id);

      // Now invalid
      expect(davTokenService.validateToken(app.db, token)).toBeNull();
    });

    it('getTokenStatus returns { hasToken: false } after revoke', async () => {
      const user = await createUser();
      davTokenService.generateToken(app.db, user.id);
      davTokenService.revokeToken(app.db, user.id);

      const status = davTokenService.getTokenStatus(app.db, user.id);
      expect(status).toEqual({ hasToken: false });
    });

    it('is a no-op for user that never had a token', async () => {
      const user = await createUser();
      // Should not throw
      expect(() => davTokenService.revokeToken(app.db, user.id)).not.toThrow();
    });
  });
});

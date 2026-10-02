import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// Static import: resolved BEFORE the userService mock below is registered, so it is the real module.
import * as actualUserService from '../services/userService.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import type * as AppModule from '../app.js';

// Spy-able wrappers around the real implementations (everything else passes through untouched).
const dummySpy = jest.fn(actualUserService.verifyDummyPassword);
const rehashSpy = jest.fn(actualUserService.rehashPassword);

jest.unstable_mockModule('../services/userService.js', () => ({
  ...actualUserService,
  verifyDummyPassword: dummySpy,
  rehashPassword: rehashSpy,
}));

let buildApp: typeof AppModule.buildApp;

const TEST_PARAMS = { n: 16384, r: 8, p: 1 };
const PROD_PARAMS = { n: 131072, r: 8, p: 1 };
const PASSWORD = 'correct-horse-battery';

describe('POST /api/auth/login — password hash hardening', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let warnSpies: Array<jest.SpiedFunction<(...args: never[]) => void>>;

  beforeEach(async () => {
    if (!buildApp) {
      ({ buildApp } = await import('../app.js'));
    }
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-auth-hashing-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    actualUserService.setPasswordHashParamsForTesting(TEST_PARAMS);
    dummySpy.mockClear();
    rehashSpy.mockClear();
    rehashSpy.mockImplementation(actualUserService.rehashPassword);

    app = await buildApp();

    // Request loggers are children of app.log; capture their warn calls.
    warnSpies = [];
    const originalChild = app.log.child.bind(app.log);
    jest.spyOn(app.log, 'child').mockImplementation(((
      ...args: Parameters<typeof originalChild>
    ) => {
      const child = originalChild(...args);
      warnSpies.push(jest.spyOn(child, 'warn') as never);
      return child;
    }) as never);
  });

  afterEach(async () => {
    actualUserService.setPasswordHashParamsForTesting(TEST_PARAMS);
    await app.close();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  const login = (email: string, password = PASSWORD) =>
    app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });

  const storedHash = (id: string) =>
    app.db.select().from(users).where(eq(users.id, id)).get()!.passwordHash!;

  const warnCalls = () => warnSpies.flatMap((spy) => spy.mock.calls as unknown[][]);

  /** A user whose hash uses the (legacy-sized) test parameters, then the current set becomes production. */
  async function seedLegacyUser(email = 'legacy@example.com') {
    const user = await actualUserService.createLocalUser(app.db, email, 'Legacy', PASSWORD);
    actualUserService.setPasswordHashParamsForTesting(PROD_PARAMS);
    return user;
  }

  describe('rehash on login', () => {
    it('upgrades a legacy hash to the current parameters after a successful login', async () => {
      const user = await seedLegacyUser();
      const before = storedHash(user.id);
      expect(before).toMatch(/n=16384,/);

      const response = await login(user.email);

      expect(response.statusCode).toBe(200);
      const after = storedHash(user.id);
      expect(after).not.toBe(before);
      expect(after).toMatch(/^\$scrypt\$n=131072,r=8,p=1\$/);
      await expect(actualUserService.verifyPassword(after, PASSWORD)).resolves.toBe(true);
      expect(rehashSpy).toHaveBeenCalledTimes(1);
      expect(dummySpy).not.toHaveBeenCalled();
    });

    it('leaves a current-parameter hash untouched on login', async () => {
      const user = await actualUserService.createLocalUser(
        app.db,
        'current@example.com',
        'Current',
        PASSWORD,
      );
      const before = storedHash(user.id);

      const response = await login(user.email);

      expect(response.statusCode).toBe(200);
      expect(storedHash(user.id)).toBe(before);
      expect(rehashSpy).not.toHaveBeenCalled();
    });

    it('does not rehash after a wrong password', async () => {
      const user = await seedLegacyUser();
      const before = storedHash(user.id);

      const response = await login(user.email, 'wrong-password-123');

      expect(response.statusCode).toBe(401);
      expect(storedHash(user.id)).toBe(before);
      expect(rehashSpy).not.toHaveBeenCalled();
    });

    it('still logs in and warns without the password when the rehash fails', async () => {
      const user = await seedLegacyUser();
      const before = storedHash(user.id);
      rehashSpy.mockRejectedValueOnce(new Error('database is locked'));

      const response = await login(user.email);

      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();
      expect(storedHash(user.id)).toBe(before);
      const calls = warnCalls();
      expect(calls).toHaveLength(1);
      const [bindings, message] = calls[0] as [Record<string, unknown>, string];
      expect(bindings.userId).toBe(user.id);
      expect(message).toBe('Failed to rehash password after login');
      expect(
        JSON.stringify(calls[0], (_k, v) => (v instanceof Error ? v.message : v)),
      ).not.toContain(PASSWORD);
    });

    it('ignores a lost compare-and-swap: login succeeds, nothing is logged, the newer hash stays', async () => {
      const user = await seedLegacyUser();
      const newerHash = await actualUserService.hashPassword('changed-meanwhile-789');
      rehashSpy.mockImplementationOnce(async (db, userId, oldHash, password) => {
        db.update(users).set({ passwordHash: newerHash }).where(eq(users.id, userId)).run();
        return actualUserService.rehashPassword(db, userId, oldHash, password);
      });

      const response = await login(user.email);

      expect(response.statusCode).toBe(200);
      expect(storedHash(user.id)).toBe(newerHash);
      expect(warnCalls()).toHaveLength(0);
    });
  });

  describe('timing-oracle mitigation (dummy verification)', () => {
    it('burns a dummy verification when a legacy-hash login fails, and still counts the failed attempt', async () => {
      const user = await seedLegacyUser();

      const response = await login(user.email, 'wrong-password-123');

      expect(response.statusCode).toBe(401);
      expect(dummySpy).toHaveBeenCalledTimes(1);
      const row = app.db.select().from(users).where(eq(users.id, user.id)).get();
      expect(row?.failedLoginAttempts).toBe(1);
    });

    it('does not burn a dummy verification when a current-parameter login fails', async () => {
      const user = await actualUserService.createLocalUser(
        app.db,
        'current@example.com',
        'Current',
        PASSWORD,
      );

      const response = await login(user.email, 'wrong-password-123');

      expect(response.statusCode).toBe(401);
      expect(dummySpy).not.toHaveBeenCalled();
    });

    it('does not burn a dummy verification on a successful login', async () => {
      const user = await seedLegacyUser();

      await login(user.email);

      expect(dummySpy).not.toHaveBeenCalled();
    });

    it('burns a dummy verification for unknown and SSO-only accounts with identical 401 bodies', async () => {
      const sso = actualUserService.createSsoOnlyUser(app.db, 'sso@example.com', 'SSO', 'member');
      const deactivated = actualUserService.createSsoOnlyUser(
        app.db,
        'gone@example.com',
        'Gone',
        'member',
      );
      actualUserService.deactivateUser(app.db, deactivated.id);

      const unknown = await login('nobody@example.com');
      const ssoResponse = await login(sso.email);
      const deactivatedResponse = await login(deactivated.email);

      expect(dummySpy).toHaveBeenCalledTimes(3);
      for (const response of [ssoResponse, deactivatedResponse]) {
        expect(response.statusCode).toBe(401);
        expect(JSON.parse(response.body)).toEqual(JSON.parse(unknown.body));
      }
      expect((JSON.parse(unknown.body) as ApiErrorResponse).error.code).toBe('INVALID_CREDENTIALS');
    });
  });
});

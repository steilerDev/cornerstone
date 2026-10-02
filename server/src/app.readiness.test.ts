import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
// Static import: resolved BEFORE the userService mock below is registered, so it is the real module.
import * as actualUserService from './services/userService.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type * as AppModule from './app.js';

const hashSpy = jest.fn(actualUserService.hashPassword);
const verifySpy = jest.fn(actualUserService.verifyPassword);

jest.unstable_mockModule('./services/userService.js', () => ({
  ...actualUserService,
  hashPassword: hashSpy,
  verifyPassword: verifySpy,
}));

let buildApp: typeof AppModule.buildApp;

describe('GET /api/health/ready — cached password-hash self-check', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    if (!buildApp) {
      ({ buildApp } = await import('./app.js'));
    }
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-readiness-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    hashSpy.mockReset();
    hashSpy.mockImplementation(actualUserService.hashPassword);
    verifySpy.mockReset();
    verifySpy.mockImplementation(actualUserService.verifyPassword);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  const ready = () => app.inject({ method: 'GET', url: '/api/health/ready' });

  it('returns { status: "ready", timestamp } with an ISO timestamp', async () => {
    const response = await ready();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as { status: string; timestamp: string };
    expect(Object.keys(body).sort()).toEqual(['status', 'timestamp']);
    expect(body.status).toBe('ready');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('runs the hash round-trip once across consecutive probes', async () => {
    const first = await ready();
    const second = await ready();
    const third = await ready();

    expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([200, 200, 200]);
    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(verifySpy).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight self-check between concurrent first probes', async () => {
    const responses = await Promise.all([ready(), ready(), ready()]);

    expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure: the next probe retries and succeeds, then stays cached', async () => {
    hashSpy.mockRejectedValueOnce(new Error('scrypt unavailable'));

    const failed = await ready();
    const retried = await ready();
    const cached = await ready();

    expect(failed.statusCode).toBe(500);
    expect(retried.statusCode).toBe(200);
    expect(cached.statusCode).toBe(200);
    expect(hashSpy).toHaveBeenCalledTimes(2);
  });

  it('fails the probe when the round-trip verification returns false, and retries next time', async () => {
    verifySpy.mockResolvedValueOnce(false);

    const failed = await ready();
    const retried = await ready();

    expect(failed.statusCode).toBe(500);
    expect(retried.statusCode).toBe(200);
    expect(hashSpy).toHaveBeenCalledTimes(2);
  });

  it('still checks the database on every probe even when the hash check is cached', async () => {
    await ready();
    const runSpy = jest.spyOn(app.db, 'run');

    const response = await ready();

    expect(response.statusCode).toBe(200);
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });
});

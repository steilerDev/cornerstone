import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('Rate Limit Plugin', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-ratelimit-test-'));
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
      // Ignore cleanup errors
    }
  });

  it('rate-limited routes include standard rate-limit headers', async () => {
    // The /api/auth/setup route has per-route rate limiting configured.
    // Check that rate-limit headers are included in the response.
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        email: 'admin@example.com',
        displayName: 'Admin',
        password: 'SecurePassword123',
      },
    });

    // Setup succeeds (first user created) and includes rate-limit headers
    expect(response.statusCode).toBe(201);
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 with RATE_LIMIT_EXCEEDED when per-route limit is exceeded', async () => {
    // The /api/auth/setup route has a strict limit of 5 per 15 minutes.
    // We exceed it to trigger 429.

    // Make 5 requests (limit is max=5)
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          email: `admin${i}@example.com`,
          displayName: 'Admin',
          password: 'SecurePassword123',
        },
      });
    }

    // The 6th request should be rate-limited
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        email: 'extra@example.com',
        displayName: 'Extra',
        password: 'SecurePassword123',
      },
    });

    // Then: 429 with RATE_LIMIT_EXCEEDED error code
    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toContain('Too many requests');
  });
});

describe('Login Route Rate Limiting — Configurable via Env (Issue #1970)', () => {
  let app: FastifyInstance | undefined;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-ratelimit-configurable-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = undefined;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('AC3: configured max exceeded → 429 with RATE_LIMIT_EXCEEDED', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '3';
    app = await buildApp();

    // Make 3 requests — each returns 401 (wrong credentials) but counts toward limit
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@x.com', password: 'wrong' },
      });
    }

    // 4th request exceeds the configured limit of 3
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@x.com', password: 'wrong' },
    });

    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body).error.code).toBe('RATE_LIMIT_EXCEEDED');
    // Prove the configured max reached the route: header on the 429 response reflects limit=3
    expect(response.headers['x-ratelimit-limit']).toBe('3');
  });

  it('AC4: defaults are exactly max=20 and window="15 minutes" and route uses them', async () => {
    // No AUTH_RATE_LIMIT_MAX or AUTH_RATE_LIMIT_WINDOW in env
    app = await buildApp();

    expect(app.config.authRateLimitMax).toBe(20);
    expect(app.config.authRateLimitWindow).toBe('15 minutes');

    // Prove the route actually uses the configured max: x-ratelimit-limit must equal '20'
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@x.com', password: 'wrong' },
    });
    expect(response.headers['x-ratelimit-limit']).toBe('20');
    // Prove the configured window reached the route: reset = ceil(900_000ms / 1000) = 900s
    // If timeWindow were deleted from auth.ts the route would inherit the global '1 minute'
    // default and this header would be '60', not '900'.
    expect(response.headers['x-ratelimit-reset']).toBe('900');
  });

  it('rate-limit headers present on login route', async () => {
    app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@x.com', password: 'wrong' },
    });

    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

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

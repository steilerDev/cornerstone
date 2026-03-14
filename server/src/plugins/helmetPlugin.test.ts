import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('Helmet Plugin — security headers', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-helmet-test-'));
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

  it('API response includes content-security-policy header', async () => {
    // When: Any API request is made
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    // Then: CSP header is present
    expect(response.headers['content-security-policy']).toBeDefined();
    expect(typeof response.headers['content-security-policy']).toBe('string');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    // upgrade-insecure-requests must NOT be present (app never terminates TLS)
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });

  it('API response does not include strict-transport-security header (TLS terminates at proxy)', async () => {
    // When: Any API request is made
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    // Then: HSTS header is NOT present (app runs behind TLS-terminating proxy)
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('API response includes x-frame-options header with value SAMEORIGIN', async () => {
    // When: Any API request is made
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    // Then: X-Frame-Options is SAMEORIGIN
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('API response includes x-content-type-options header with value nosniff', async () => {
    // When: Any API request is made
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    // Then: X-Content-Type-Options is nosniff
    expect(response.headers['x-content-type-options']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

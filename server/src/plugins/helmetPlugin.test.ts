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

  it("CSP header contains frame-src 'self' (allows same-origin iframes for PDF preview)", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain("frame-src 'none'");
  });

  // Story #1891: blob: URLs are used for the client-side-generated PDF preview iframe
  // (pdfmake produces a Blob, rendered via URL.createObjectURL). Without 'blob:' in
  // frame-src, the browser blocks navigation to the blob: URL and the iframe silently
  // stays blank (this is exactly what e2e-test-engineer's hardened waitForPreviewReady/
  // waitForPreviewRegenerated assertions in reportWizardExpansion.spec.ts are designed
  // to catch — see the QA spec for #1891).
  it("CSP header's frame-src directive contains exactly \"'self' blob:\" in that order (exact emitted serialization)", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();
    // helmet/CSP serializes each directive as "directive-name value1 value2; ..." — assert
    // the exact frame-src clause (not just substring containment of 'blob:' anywhere in
    // the header, which could pass even if blob: leaked into an unrelated directive).
    const frameSrcClause = csp
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('frame-src'));
    expect(frameSrcClause).toBe("frame-src 'self' blob:");
  });

  it('CSP header directives other than frame-src are unchanged by the blob: addition', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const csp = response.headers['content-security-policy'] as string;
    const clauses = new Map(
      csp
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => {
          const [name, ...rest] = c.split(' ');
          return [name!, rest.join(' ')];
        }),
    );

    expect(clauses.get('default-src')).toBe("'self'");
    expect(clauses.get('script-src')).toBe("'self'");
    expect(clauses.get('style-src')).toBe("'self' 'unsafe-inline'");
    expect(clauses.get('img-src')).toBe("'self' data: blob:");
    expect(clauses.get('font-src')).toBe("'self'");
    expect(clauses.get('connect-src')).toBe("'self'");
    expect(clauses.get('object-src')).toBe("'none'");
    expect(clauses.get('base-uri')).toBe("'self'");
    expect(clauses.get('form-action')).toBe("'self'");
    // upgrade-insecure-requests must still be absent (directive removed via `null`)
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it("CSP header contains object-src 'none' (no <object>/<embed> allowed)", async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const csp = response.headers['content-security-policy'] as string;
    expect(csp).toContain("object-src 'none'");
  });
});

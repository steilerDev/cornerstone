/**
 * Response-schema test for GET /api/settings/integrations (Story #2217).
 *
 * The status builder is mocked to return a valid body plus injected extra keys at the root, in a
 * card and in an env list; the route's response schema (`additionalProperties: false`) must strip
 * them, so a future field added to the builder by mistake cannot reach the client.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { IntegrationsStatusResponse } from '@cornerstone/shared';
import type * as AppModule from '../app.js';
import type * as UserServiceModule from '../services/userService.js';
import type * as SessionServiceModule from '../services/sessionService.js';

const env = { required: ['A_NAME'], optional: ['B_NAME'] };

const injected = {
  paperless: {
    configured: false,
    host: null,
    filterTag: null,
    env: { ...env, leakedList: ['fake-secret-9'] },
    paperlessApiToken: 'fake-secret-1',
  },
  ai: { configured: false, provider: null, model: null, host: null, env },
  singleSignOn: {
    configured: false,
    issuerHost: null,
    jitProvisioning: false,
    redirectUri: 'http://x.example.test/api/auth/oidc/callback',
    oidcClientSecret: 'fake-secret-2',
    env,
  },
  calendarContacts: { davUrl: 'http://x.example.test/dav/', env },
  backups: {
    enabled: true,
    cadence: '0 2 * * *',
    retention: null,
    lastRun: { timestamp: '2026-10-01T02:00:00.000Z', success: true, error: 'fake-secret-3' },
    nextRun: null,
    env,
  },
  diaryEvents: { enabled: true, env },
  money: { currency: 'EUR', vatRate: 0.19, env },
  photos: { storagePath: '/data/photos', maxFileSizeBytes: 1048576, env },
  publicAddress: {
    externalUrl: null,
    trustProxy: false,
    secureCookies: true,
    llmApiKey: 'fake-secret-4',
    env,
  },
  rootLeak: 'fake-secret-5',
};

jest.unstable_mockModule('../services/integrationsService.js', () => ({
  buildIntegrationsStatus: () => injected,
}));

let buildApp: typeof AppModule.buildApp;
let userService: typeof UserServiceModule;
let sessionService: typeof SessionServiceModule;

describe('GET /api/settings/integrations response schema', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-integrations-schema-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    if (!buildApp) {
      ({ buildApp } = await import('../app.js'));
      userService = await import('../services/userService.js');
      sessionService = await import('../services/sessionService.js');
    }
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('strips injected extra keys at the root, in cards, in env lists and in lastRun', async () => {
    const user = await userService.createLocalUser(
      app.db,
      'admin@example.test',
      'Test Admin',
      'password',
      'admin',
    );
    const token = sessionService.createSession(app.db, user.id, 3600);

    const response = await app.inject({
      method: 'GET',
      url: '/api/settings/integrations',
      headers: { cookie: `cornerstone_session=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('fake-secret');
    const body = response.json<IntegrationsStatusResponse & Record<string, unknown>>();
    expect(body.rootLeak).toBeUndefined();
    expect(Object.keys(body.paperless).sort()).toEqual(['configured', 'env', 'filterTag', 'host']);
    expect(Object.keys(body.paperless.env).sort()).toEqual(['optional', 'required']);
    expect(Object.keys(body.backups.lastRun as object).sort()).toEqual(['success', 'timestamp']);
    // legitimate values still pass through
    expect(body.money).toMatchObject({ currency: 'EUR', vatRate: 0.19 });
  });
});

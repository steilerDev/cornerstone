/**
 * Integration tests for GET /api/settings/integrations (Story #2217).
 *
 * Covers: auth (401 / 403 / 200), the exact response shape, the "no secrets" rule with fake
 * secrets in the environment, the not-configured state, and request-origin / TRUST_PROXY URLs.
 *
 * Uses Fastify app.inject(); synthetic data only.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, IntegrationsStatusResponse } from '@cornerstone/shared';

const URL_PATH = '/api/settings/integrations';

const CARDS = [
  'ai',
  'backups',
  'calendarContacts',
  'diaryEvents',
  'money',
  'paperless',
  'photos',
  'publicAddress',
  'singleSignOn',
];

const CARD_KEYS: Record<string, string[]> = {
  paperless: ['configured', 'env', 'filterTag', 'host'],
  ai: ['configured', 'env', 'host', 'model', 'provider'],
  singleSignOn: ['configured', 'env', 'issuerHost', 'jitProvisioning', 'redirectUri'],
  calendarContacts: ['davUrl', 'env'],
  backups: ['cadence', 'enabled', 'env', 'lastRun', 'nextRun', 'retention'],
  diaryEvents: ['enabled', 'env'],
  money: ['currency', 'env', 'vatRate'],
  photos: ['env', 'maxFileSizeBytes', 'storagePath'],
  publicAddress: ['env', 'externalUrl', 'secureCookies', 'trustProxy'],
};

const ENV_TABLE: Record<string, { required: string[]; optional: string[] }> = {
  paperless: {
    required: ['PAPERLESS_URL', 'PAPERLESS_API_TOKEN'],
    optional: ['PAPERLESS_EXTERNAL_URL', 'PAPERLESS_FILTER_TAG'],
  },
  ai: {
    required: ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'],
    optional: ['LLM_PROVIDER', 'LLM_REQUEST_TIMEOUT_MS', 'LLM_MAX_TOKENS'],
  },
  singleSignOn: {
    required: ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET'],
    optional: ['OIDC_JIT_PROVISIONING'],
  },
  calendarContacts: { required: [], optional: [] },
  backups: { required: ['BACKUP_CADENCE'], optional: ['BACKUP_RETENTION', 'BACKUP_DIR'] },
  diaryEvents: { required: [], optional: ['DIARY_AUTO_EVENTS'] },
  money: { required: [], optional: ['CURRENCY', 'VAT_RATE'] },
  photos: { required: [], optional: ['PHOTO_STORAGE_PATH', 'PHOTO_MAX_FILE_SIZE_MB'] },
  publicAddress: { required: [], optional: ['EXTERNAL_URL', 'TRUST_PROXY', 'SECURE_COOKIES'] },
};

const INTEGRATION_ENV_NAMES = [
  'PAPERLESS_URL',
  'PAPERLESS_API_TOKEN',
  'PAPERLESS_EXTERNAL_URL',
  'PAPERLESS_FILTER_TAG',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_PROVIDER',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_JIT_PROVISIONING',
  'EXTERNAL_URL',
  'TRUST_PROXY',
  'BACKUP_CADENCE',
  'BACKUP_RETENTION',
  'BACKUP_DIR',
  'PHOTO_MAX_FILE_SIZE_MB',
  'PHOTO_STORAGE_PATH',
  'CURRENCY',
  'VAT_RATE',
  'DIARY_AUTO_EVENTS',
];

describe('GET /api/settings/integrations', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  async function start(env: Record<string, string> = {}): Promise<void> {
    if (app) await app.close();
    Object.assign(process.env, env);
    app = await buildApp();
  }

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-integrations-test-'));
    for (const name of INTEGRATION_ENV_NAMES) delete process.env[name];
    mkdirSync(join(tempDir, 'data'));
    process.env.DATABASE_URL = join(tempDir, 'data', 'test.db');
    process.env.BACKUP_DIR = join(tempDir, 'backups');
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'data', 'photos');
    process.env.SECURE_COOKIES = 'false';
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

  async function sessionFor(role: 'admin' | 'member', email = `${role}@example.test`) {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', role);
    const token = sessionService.createSession(app.db, user.id, 3600);
    return `cornerstone_session=${token}`;
  }

  async function get(
    cookie: string,
    headers: Record<string, string> = {},
  ): Promise<IntegrationsStatusResponse> {
    const response = await app.inject({
      method: 'GET',
      url: URL_PATH,
      headers: { cookie, ...headers },
    });
    expect(response.statusCode).toBe(200);
    return response.json<IntegrationsStatusResponse>();
  }

  describe('auth', () => {
    it('returns 401 UNAUTHORIZED without a session', async () => {
      const response = await app.inject({ method: 'GET', url: URL_PATH });
      expect(response.statusCode).toBe(401);
      expect(response.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 FORBIDDEN for a member', async () => {
      const cookie = await sessionFor('member');
      const response = await app.inject({ method: 'GET', url: URL_PATH, headers: { cookie } });
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiErrorResponse>().error.code).toBe('FORBIDDEN');
    });

    it('returns 200 for an admin', async () => {
      const cookie = await sessionFor('admin');
      const response = await app.inject({ method: 'GET', url: URL_PATH, headers: { cookie } });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('shape', () => {
    it('has exactly the nine cards, each with exactly its contract keys', async () => {
      const body = await get(await sessionFor('admin'));
      expect(Object.keys(body).sort()).toEqual(CARDS);
      for (const card of CARDS) {
        const value = body[card as keyof IntegrationsStatusResponse] as Record<string, unknown>;
        expect(Object.keys(value).sort()).toEqual(CARD_KEYS[card]);
        expect(Object.keys(value.env as object).sort()).toEqual(['optional', 'required']);
      }
    });

    it('lists the contract env names for every card', async () => {
      const body = await get(await sessionFor('admin'));
      for (const card of CARDS) {
        expect(body[card as keyof IntegrationsStatusResponse].env).toEqual(ENV_TABLE[card]);
      }
    });
  });

  describe('not configured', () => {
    it('reports configured=false and null host, provider, model and issuer host', async () => {
      const body = await get(await sessionFor('admin'), { host: 'house.example.test' });
      expect(body.paperless).toMatchObject({ configured: false, host: null, filterTag: null });
      expect(body.ai).toMatchObject({
        configured: false,
        provider: null,
        model: null,
        host: null,
      });
      expect(body.singleSignOn).toMatchObject({ configured: false, issuerHost: null });
      expect(body.publicAddress.externalUrl).toBeNull();
      expect(body.backups).toMatchObject({
        enabled: false,
        cadence: null,
        retention: null,
        lastRun: null,
        nextRun: null,
      });
    });

    it('builds redirectUri and davUrl from the request origin', async () => {
      const body = await get(await sessionFor('admin'), { host: 'house.example.test' });
      expect(body.singleSignOn.redirectUri).toBe(
        'http://house.example.test/api/auth/oidc/callback',
      );
      expect(body.calendarContacts.davUrl).toBe('http://house.example.test/dav/');
    });

    it('uses the forwarded origin when TRUST_PROXY is on', async () => {
      await start({ TRUST_PROXY: 'true' });
      const body = await get(await sessionFor('admin'), {
        host: 'internal.local:3000',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'public.example.test',
      });
      expect(body.singleSignOn.redirectUri).toBe(
        'https://public.example.test/api/auth/oidc/callback',
      );
      expect(body.calendarContacts.davUrl).toBe('https://public.example.test/dav/');
      expect(body.publicAddress.trustProxy).toBe(true);
    });

    it('ignores forwarded headers when TRUST_PROXY is off', async () => {
      const body = await get(await sessionFor('admin'), {
        host: 'internal.local:3000',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'public.example.test',
      });
      expect(body.calendarContacts.davUrl).toBe('http://internal.local:3000/dav/');
    });
  });

  describe('configured, and the no-secrets rule', () => {
    const SECRET_ENV = {
      PAPERLESS_URL: 'https://u1:p1@docs.example.test:8443/base?x=1',
      PAPERLESS_API_TOKEN: 'fake-paperless-token-0001',
      LLM_BASE_URL: 'https://llm.example.test/v1',
      LLM_API_KEY: 'fake-llm-key-0002',
      LLM_MODEL: 'model-x',
      OIDC_ISSUER: 'https://login.example.test/realm',
      OIDC_CLIENT_ID: 'fake-client-id-0003',
      OIDC_CLIENT_SECRET: 'fake-client-secret-0004',
      EXTERNAL_URL: 'https://u5:p5@house.example.test/cs?q=1#h',
    };

    it('contains no secret, credential, query or hash anywhere in the body', async () => {
      await start(SECRET_ENV);
      const response = await app.inject({
        method: 'GET',
        url: URL_PATH,
        headers: { cookie: await sessionFor('admin') },
      });
      expect(response.statusCode).toBe(200);
      for (const leak of [
        'fake-paperless-token-0001',
        'fake-llm-key-0002',
        'fake-client-id-0003',
        'fake-client-secret-0004',
        'u1',
        'p1',
        'u5',
        'p5',
        '?x=1',
        '?q=1',
        '#h',
      ]) {
        expect(response.body).not.toContain(leak);
      }
    });

    it('reports host-only values and the credential-free public address', async () => {
      await start(SECRET_ENV);
      const body = await get(await sessionFor('admin'));
      expect(body.paperless).toMatchObject({ configured: true, host: 'docs.example.test:8443' });
      expect(body.ai).toMatchObject({
        configured: true,
        host: 'llm.example.test',
        model: 'model-x',
      });
      expect(body.singleSignOn).toMatchObject({
        configured: true,
        issuerHost: 'login.example.test',
        redirectUri: 'https://house.example.test/cs/api/auth/oidc/callback',
      });
      expect(body.publicAddress.externalUrl).toBe('https://house.example.test/cs');
      expect(body.calendarContacts.davUrl).toBe('https://house.example.test/cs/dav/');
    });

    it('caps photos.maxFileSizeBytes at 50 MiB and reports the storage path', async () => {
      await start({ PHOTO_MAX_FILE_SIZE_MB: '60' });
      const body = await get(await sessionFor('admin'));
      expect(body.photos.maxFileSizeBytes).toBe(50 * 1024 * 1024);
      expect(body.photos.storagePath).toBe(join(tempDir, 'data', 'photos'));
    });

    it('reports an enabled backup schedule with a next run', async () => {
      await start({ BACKUP_CADENCE: '0 2 * * *', BACKUP_RETENTION: '5' });
      const body = await get(await sessionFor('admin'));
      expect(body.backups).toMatchObject({
        enabled: true,
        cadence: '0 2 * * *',
        retention: 5,
        lastRun: null,
      });
      expect(new Date(body.backups.nextRun as string).toISOString()).toBe(body.backups.nextRun);
    });
  });
});

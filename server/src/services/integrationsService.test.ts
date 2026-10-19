/**
 * Unit tests for integrationsService.ts (Story #2217): the field-by-field status builder.
 * Secrets must never reach the result; env lists are fresh copies; photo limit is capped.
 */
import { describe, it, expect } from '@jest/globals';
import type { BackupSchedulerStatus } from '@cornerstone/shared';
import { INTEGRATION_ENV, loadConfig, type AppConfig } from '../plugins/config.js';
import { buildIntegrationsStatus } from './integrationsService.js';

const ORIGIN = 'http://request.example.test:3000';
const OFF: BackupSchedulerStatus = { enabled: false, lastRun: null, nextRuns: [] };

const SECRETS = [
  'fake-paperless-token-0001',
  'fake-llm-key-0002',
  'fake-client-id-0003',
  'fake-client-secret-0004',
];

function build(
  env: Record<string, string | undefined> = {},
  scheduler: BackupSchedulerStatus = OFF,
  config?: AppConfig,
) {
  return buildIntegrationsStatus({
    config: config ?? loadConfig(env),
    scheduler,
    origin: ORIGIN,
  });
}

const FULL_ENV = {
  PAPERLESS_URL: 'https://u1:p1@docs.example.test:8443/base?x=1',
  PAPERLESS_API_TOKEN: SECRETS[0],
  LLM_BASE_URL: 'https://llm.example.test/v1',
  LLM_API_KEY: SECRETS[1],
  LLM_MODEL: 'model-x',
  OIDC_ISSUER: 'https://login.example.test/realm',
  OIDC_CLIENT_ID: SECRETS[2],
  OIDC_CLIENT_SECRET: SECRETS[3],
  EXTERNAL_URL: 'https://u5:p5@house.example.test/cs?q=1#h',
};

describe('buildIntegrationsStatus', () => {
  describe('secrets', () => {
    it('never serializes a token, key, client id or client secret', () => {
      const json = JSON.stringify(build(FULL_ENV));
      for (const secret of SECRETS) expect(json).not.toContain(secret);
    });

    it('never serializes URL credentials, query strings or hashes', () => {
      const json = JSON.stringify(build(FULL_ENV));
      for (const leak of ['u1', 'p1', 'u5', 'p5', '?x=1', '?q=1', '#h']) {
        expect(json).not.toContain(leak);
      }
    });

    it('does not spread config: an extra property on the config never appears', () => {
      const config = {
        ...loadConfig(FULL_ENV),
        secretX: 'fake-extra-secret-0005',
      } as AppConfig;
      const json = JSON.stringify(build({}, OFF, config));
      expect(json).not.toContain('fake-extra-secret-0005');
      expect(json).not.toContain('secretX');
      for (const secret of SECRETS) expect(json).not.toContain(secret);
    });
  });

  describe('hosts', () => {
    it('shows host only for Paperless, AI and OIDC', () => {
      const s = build(FULL_ENV);
      expect(s.paperless).toMatchObject({ configured: true, host: 'docs.example.test:8443' });
      expect(s.ai).toMatchObject({
        configured: true,
        host: 'llm.example.test',
        model: 'model-x',
        provider: 'generic',
      });
      expect(s.singleSignOn).toMatchObject({
        configured: true,
        issuerHost: 'login.example.test',
      });
    });

    it('prefers the Paperless external URL host for display', () => {
      const s = build({
        ...FULL_ENV,
        PAPERLESS_EXTERNAL_URL: 'https://paperless.public.example.test/x',
      });
      expect(s.paperless.host).toBe('paperless.public.example.test');
    });

    it('reports the full external URL without credentials, query or hash', () => {
      const s = build(FULL_ENV);
      expect(s.publicAddress.externalUrl).toBe('https://house.example.test/cs');
      expect(s.singleSignOn.redirectUri).toBe(
        'https://house.example.test/cs/api/auth/oidc/callback',
      );
      expect(s.calendarContacts.davUrl).toBe('https://house.example.test/cs/dav/');
    });

    it('reports nulls and request-origin URLs when nothing is configured', () => {
      const s = build({});
      expect(s.paperless).toMatchObject({ configured: false, host: null, filterTag: null });
      expect(s.ai).toMatchObject({
        configured: false,
        provider: null,
        model: null,
        host: null,
      });
      expect(s.singleSignOn).toMatchObject({ configured: false, issuerHost: null });
      expect(s.singleSignOn.redirectUri).toBe(`${ORIGIN}/api/auth/oidc/callback`);
      expect(s.calendarContacts.davUrl).toBe(`${ORIGIN}/dav/`);
      expect(s.publicAddress.externalUrl).toBeNull();
    });

    it('hides details when only part of the setup is present', () => {
      const s = build({
        PAPERLESS_URL: 'https://docs.example.test',
        LLM_BASE_URL: 'https://llm.example.test/v1',
        LLM_MODEL: 'model-x',
        OIDC_ISSUER: 'https://login.example.test',
      });
      expect(s.paperless).toMatchObject({ configured: false, host: null });
      expect(s.ai).toMatchObject({ configured: false, host: null, model: null, provider: null });
      expect(s.singleSignOn).toMatchObject({ configured: false, issuerHost: null });
    });

    it('passes the Paperless filter tag through as configured', () => {
      expect(build({ ...FULL_ENV, PAPERLESS_FILTER_TAG: 'cornerstone' }).paperless.filterTag).toBe(
        'cornerstone',
      );
    });

    it('passes the OIDC JIT flag through', () => {
      expect(build({ OIDC_JIT_PROVISIONING: 'true' }).singleSignOn.jitProvisioning).toBe(true);
      expect(build({}).singleSignOn.jitProvisioning).toBe(false);
    });
  });

  describe('env lists', () => {
    const keys = Object.keys(INTEGRATION_ENV) as (keyof typeof INTEGRATION_ENV)[];

    it('returns the contract lists for all nine cards', () => {
      const s = build({});
      expect(keys).toHaveLength(9);
      for (const key of keys) {
        expect(s[key].env).toEqual({
          required: [...INTEGRATION_ENV[key].required],
          optional: [...INTEGRATION_ENV[key].optional],
        });
      }
    });

    it('returns fresh copies: mutating a result never changes the shared table or a rebuild', () => {
      const first = build({});
      const before = JSON.stringify(INTEGRATION_ENV);
      for (const key of keys) {
        expect(first[key].env.required).not.toBe(INTEGRATION_ENV[key].required);
        expect(first[key].env.optional).not.toBe(INTEGRATION_ENV[key].optional);
        first[key].env.required.push('MUTATED');
        first[key].env.optional.push('MUTATED');
      }
      expect(JSON.stringify(INTEGRATION_ENV)).toBe(before);
      const second = build({});
      expect(JSON.stringify(second)).not.toContain('MUTATED');
      expect(second.paperless.env).not.toBe(first.paperless.env);
    });
  });

  describe('backups', () => {
    it('uses the first next run and the last run from the scheduler', () => {
      const lastRun = { timestamp: '2026-10-01T02:00:00.000Z', success: true };
      const s = build(
        { BACKUP_CADENCE: '0 2 * * *', BACKUP_RETENTION: '7' },
        {
          enabled: true,
          lastRun,
          nextRuns: ['2026-10-02T02:00:00.000Z', '2026-10-03T02:00:00.000Z'],
        },
      );
      expect(s.backups).toMatchObject({
        enabled: true,
        cadence: '0 2 * * *',
        retention: 7,
        lastRun,
        nextRun: '2026-10-02T02:00:00.000Z',
      });
    });

    it('reports a disabled scheduler with an invalid cadence as the configured text', () => {
      const s = build({ BACKUP_CADENCE: 'not a cron' }, OFF);
      expect(s.backups).toMatchObject({
        enabled: false,
        cadence: 'not a cron',
        lastRun: null,
        nextRun: null,
      });
    });

    it('reports null cadence, retention and next run when nothing is configured', () => {
      expect(build({}).backups).toMatchObject({
        enabled: false,
        cadence: null,
        retention: null,
        lastRun: null,
        nextRun: null,
      });
    });

    it('treats an enabled scheduler without next runs as no next run', () => {
      const s = build({ BACKUP_CADENCE: '0 2 * * *' }, { ...OFF, enabled: true });
      expect(s.backups.nextRun).toBeNull();
    });
  });

  describe('simple cards', () => {
    it('reports diary events as always on, money, and public address flags', () => {
      const s = build({
        DIARY_AUTO_EVENTS: 'false',
        CURRENCY: 'CHF',
        VAT_RATE: '0.077',
        TRUST_PROXY: 'true',
        SECURE_COOKIES: 'false',
      });
      expect(s.diaryEvents).toEqual({ enabled: true, env: { required: [], optional: [] } });
      expect(s.money).toMatchObject({ currency: 'CHF', vatRate: 0.077 });
      expect(s.publicAddress).toMatchObject({ trustProxy: true, secureCookies: false });
    });
  });

  describe('photos', () => {
    const MIB = 1024 * 1024;

    it('reports the setting in bytes below the cap', () => {
      expect(build({ PHOTO_MAX_FILE_SIZE_MB: '20' }).photos.maxFileSizeBytes).toBe(20 * MIB);
    });

    it('caps the effective limit at 50 MiB', () => {
      expect(build({ PHOTO_MAX_FILE_SIZE_MB: '60' }).photos.maxFileSizeBytes).toBe(50 * MIB);
    });

    it('resolves a relative storage path to an absolute one', () => {
      const p = build({ PHOTO_STORAGE_PATH: 'relative/photos' }).photos.storagePath;
      expect(p.startsWith('/')).toBe(true);
      expect(p.endsWith('relative/photos')).toBe(true);
    });

    it('keeps an absolute storage path', () => {
      expect(build({ PHOTO_STORAGE_PATH: '/data/photos' }).photos.storagePath).toBe('/data/photos');
    });
  });
});

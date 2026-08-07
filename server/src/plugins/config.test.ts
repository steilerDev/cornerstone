import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import { loadConfig } from './config.js';
import type { FastifyInstance } from 'fastify';

describe('Configuration Module - loadConfig() Pure Function', () => {
  describe('Scenario 1: Default Configuration Values Applied', () => {
    it('returns correct defaults when no env vars set', () => {
      const config = loadConfig({});

      expect(config).toEqual({
        port: 3000,
        host: '0.0.0.0',
        databaseUrl: '/app/data/cornerstone.db',
        logLevel: 'info',
        nodeEnv: 'production',
        sessionDuration: 604800,
        secureCookies: true,
        trustProxy: false,
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,

        oidcEnabled: false,
        paperlessUrl: undefined,
        paperlessExternalUrl: undefined,
        paperlessApiToken: undefined,
        paperlessFilterTag: undefined,
        paperlessEnabled: false,
        photoStoragePath: '/app/data/photos',
        photoMaxFileSizeMb: 20,
        diaryAutoEvents: true,
        diaryDraftRetentionDays: 30,
        currency: 'EUR',
        vatRate: 0.19,
        backupDir: '/backups',
        backupCadence: undefined,
        backupRetention: undefined,
        backupEnabled: true,
        // LLM auto-itemization fields (Story #1546)
        llmBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
        llmRequestTimeoutMs: 30000,
        llmMaxTokens: 16384,
        llmProvider: 'generic',
        autoItemizeEnabled: false,
        llmEnabled: false,
        authRateLimitMax: 20,
        authRateLimitWindow: '15 minutes',
      });
    });

    it('treats empty string env vars as missing (defaults applied)', () => {
      const config = loadConfig({
        PORT: '',
        HOST: '',
        DATABASE_URL: '',
        LOG_LEVEL: '',
        NODE_ENV: '',
      });

      expect(config).toEqual({
        port: 3000,
        host: '0.0.0.0',
        databaseUrl: '/app/data/cornerstone.db',
        logLevel: 'info',
        nodeEnv: 'production',
        sessionDuration: 604800,
        secureCookies: true,
        trustProxy: false,
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,

        oidcEnabled: false,
        paperlessUrl: undefined,
        paperlessExternalUrl: undefined,
        paperlessApiToken: undefined,
        paperlessFilterTag: undefined,
        paperlessEnabled: false,
        photoStoragePath: '/app/data/photos',
        photoMaxFileSizeMb: 20,
        diaryAutoEvents: true,
        diaryDraftRetentionDays: 30,
        currency: 'EUR',
        vatRate: 0.19,
        backupDir: '/backups',
        backupCadence: undefined,
        backupRetention: undefined,
        backupEnabled: true,
        // LLM auto-itemization fields (Story #1546)
        llmBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
        llmRequestTimeoutMs: 30000,
        llmMaxTokens: 16384,
        llmProvider: 'generic',
        autoItemizeEnabled: false,
        llmEnabled: false,
        authRateLimitMax: 20,
        authRateLimitWindow: '15 minutes',
      });
    });
  });

  describe('Scenario 2: Custom Environment Values Override Defaults', () => {
    it('custom values override defaults', () => {
      const config = loadConfig({
        PORT: '4000',
        HOST: '127.0.0.1',
        DATABASE_URL: '/custom/path/db.sqlite',
        LOG_LEVEL: 'debug',
        NODE_ENV: 'development',
      });

      expect(config).toEqual({
        port: 4000,
        host: '127.0.0.1',
        databaseUrl: '/custom/path/db.sqlite',
        logLevel: 'debug',
        nodeEnv: 'development',
        sessionDuration: 604800,
        secureCookies: true,
        trustProxy: false,
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,

        oidcEnabled: false,
        paperlessUrl: undefined,
        paperlessExternalUrl: undefined,
        paperlessApiToken: undefined,
        paperlessFilterTag: undefined,
        paperlessEnabled: false,
        photoStoragePath: '/custom/path/photos',
        photoMaxFileSizeMb: 20,
        diaryAutoEvents: true,
        diaryDraftRetentionDays: 30,
        currency: 'EUR',
        vatRate: 0.19,
        backupDir: '/backups',
        backupCadence: undefined,
        backupRetention: undefined,
        backupEnabled: true,
        // LLM auto-itemization fields (Story #1546)
        llmBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
        llmRequestTimeoutMs: 30000,
        llmMaxTokens: 16384,
        llmProvider: 'generic',
        autoItemizeEnabled: false,
        llmEnabled: false,
        authRateLimitMax: 20,
        authRateLimitWindow: '15 minutes',
      });
    });

    it('partial overrides work (mix defaults and custom)', () => {
      const config = loadConfig({
        PORT: '8080',
        LOG_LEVEL: 'warn',
      });

      expect(config).toEqual({
        port: 8080,
        host: '0.0.0.0',
        databaseUrl: '/app/data/cornerstone.db',
        logLevel: 'warn',
        nodeEnv: 'production',
        sessionDuration: 604800,
        secureCookies: true,
        trustProxy: false,
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,

        oidcEnabled: false,
        paperlessUrl: undefined,
        paperlessExternalUrl: undefined,
        paperlessApiToken: undefined,
        paperlessFilterTag: undefined,
        paperlessEnabled: false,
        photoStoragePath: '/app/data/photos',
        photoMaxFileSizeMb: 20,
        diaryAutoEvents: true,
        diaryDraftRetentionDays: 30,
        currency: 'EUR',
        vatRate: 0.19,
        backupDir: '/backups',
        backupCadence: undefined,
        backupRetention: undefined,
        backupEnabled: true,
        // LLM auto-itemization fields (Story #1546)
        llmBaseUrl: undefined,
        llmApiKey: undefined,
        llmModel: undefined,
        llmRequestTimeoutMs: 30000,
        llmMaxTokens: 16384,
        llmProvider: 'generic',
        autoItemizeEnabled: false,
        llmEnabled: false,
        authRateLimitMax: 20,
        authRateLimitWindow: '15 minutes',
      });
    });
  });

  describe('OIDC Configuration', () => {
    it('config with all OIDC env vars → oidcEnabled is true', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        OIDC_CLIENT_SECRET: 'secret-456',
      });

      expect(config.oidcEnabled).toBe(true);
      expect(config.oidcIssuer).toBe('https://oidc.example.com');
      expect(config.oidcClientId).toBe('client-123');
      expect(config.oidcClientSecret).toBe('secret-456');
    });

    it('config with partial OIDC env vars → oidcEnabled is false', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        // Missing OIDC_CLIENT_SECRET
      });

      expect(config.oidcEnabled).toBe(false);
      expect(config.oidcIssuer).toBe('https://oidc.example.com');
      expect(config.oidcClientId).toBe('client-123');
      expect(config.oidcClientSecret).toBeUndefined();
    });

    it('config with empty string OIDC env vars → oidcEnabled is false', () => {
      const config = loadConfig({
        OIDC_ISSUER: '',
        OIDC_CLIENT_ID: '',
        OIDC_CLIENT_SECRET: '',
      });

      expect(config.oidcEnabled).toBe(false);
      expect(config.oidcIssuer).toBeUndefined();
      expect(config.oidcClientId).toBeUndefined();
      expect(config.oidcClientSecret).toBeUndefined();
    });

    it('verify OIDC values are correctly read from environment', () => {
      const issuer = 'https://auth.example.com';
      const clientId = 'my-client-id';
      const clientSecret = 'my-client-secret';

      const config = loadConfig({
        OIDC_ISSUER: issuer,
        OIDC_CLIENT_ID: clientId,
        OIDC_CLIENT_SECRET: clientSecret,
      });

      expect(config.oidcIssuer).toBe(issuer);
      expect(config.oidcClientId).toBe(clientId);
      expect(config.oidcClientSecret).toBe(clientSecret);
      expect(config.oidcEnabled).toBe(true);
    });

    it('missing one OIDC var disables OIDC (missing CLIENT_SECRET)', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        // Missing OIDC_CLIENT_SECRET
      });

      expect(config.oidcEnabled).toBe(false);
    });
  });

  describe('TRUST_PROXY Configuration', () => {
    it('defaults to false when not set', () => {
      const config = loadConfig({});
      expect(config.trustProxy).toBe(false);
    });

    it('parses TRUST_PROXY=true', () => {
      const config = loadConfig({ TRUST_PROXY: 'true' });
      expect(config.trustProxy).toBe(true);
    });

    it('parses TRUST_PROXY=false', () => {
      const config = loadConfig({ TRUST_PROXY: 'false' });
      expect(config.trustProxy).toBe(false);
    });

    it('is case-insensitive', () => {
      const config = loadConfig({ TRUST_PROXY: 'TRUE' });
      expect(config.trustProxy).toBe(true);
    });

    it('rejects invalid value', () => {
      expect(() => loadConfig({ TRUST_PROXY: 'yes' })).toThrow(
        "TRUST_PROXY must be 'true' or 'false', got: yes",
      );
    });
  });

  describe('Scenario 4: PORT Validation', () => {
    it('rejects non-numeric PORT', () => {
      expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow(
        'Configuration validation failed:\n  - PORT must be a valid number, got: not-a-number',
      );
    });

    it('rejects negative PORT', () => {
      expect(() => loadConfig({ PORT: '-1' })).toThrow(
        'Configuration validation failed:\n  - PORT must be in range 0-65535, got: -1',
      );
    });

    it('rejects PORT > 65535', () => {
      expect(() => loadConfig({ PORT: '65536' })).toThrow(
        'Configuration validation failed:\n  - PORT must be in range 0-65535, got: 65536',
      );
    });

    it('accepts PORT = 0 (OS-assigned port)', () => {
      const config = loadConfig({ PORT: '0' });
      expect(config.port).toBe(0);
    });

    it('accepts PORT = 65535 (upper boundary)', () => {
      const config = loadConfig({ PORT: '65535' });
      expect(config.port).toBe(65535);
    });

    it('accepts valid PORT in range', () => {
      const config = loadConfig({ PORT: '8080' });
      expect(config.port).toBe(8080);
    });
  });

  describe('Scenario 5: LOG_LEVEL Validation', () => {
    it('rejects invalid LOG_LEVEL', () => {
      expect(() => loadConfig({ LOG_LEVEL: 'invalid' })).toThrow(
        'Configuration validation failed:\n  - LOG_LEVEL must be one of trace, debug, info, warn, error, fatal, got: invalid',
      );
    });

    it('accepts all valid log levels (lowercase)', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

      levels.forEach((level) => {
        const config = loadConfig({ LOG_LEVEL: level });
        expect(config.logLevel).toBe(level);
      });
    });

    it('accepts log levels case-insensitively (uppercase)', () => {
      const config = loadConfig({ LOG_LEVEL: 'DEBUG' });
      expect(config.logLevel).toBe('debug');
    });

    it('accepts log levels case-insensitively (mixed case)', () => {
      const config = loadConfig({ LOG_LEVEL: 'WaRn' });
      expect(config.logLevel).toBe('warn');
    });
  });

  describe('Paperless-ngx Configuration', () => {
    it('accepts valid http PAPERLESS_URL', () => {
      const config = loadConfig({
        PAPERLESS_URL: 'http://paperless:8000',
        PAPERLESS_API_TOKEN: 'test-token',
      });

      expect(config.paperlessUrl).toBe('http://paperless:8000');
      expect(config.paperlessApiToken).toBe('test-token');
      expect(config.paperlessEnabled).toBe(true);
    });

    it('accepts valid https PAPERLESS_URL', () => {
      const config = loadConfig({
        PAPERLESS_URL: 'https://paperless.example.com',
        PAPERLESS_API_TOKEN: 'test-token',
      });

      expect(config.paperlessUrl).toBe('https://paperless.example.com');
      expect(config.paperlessEnabled).toBe(true);
    });

    it('rejects file:// scheme in PAPERLESS_URL (SSRF prevention)', () => {
      expect(() =>
        loadConfig({
          PAPERLESS_URL: 'file:///etc/passwd',
          PAPERLESS_API_TOKEN: 'test-token',
        }),
      ).toThrow('PAPERLESS_URL must use http or https scheme, got: file');
    });

    it('rejects ftp:// scheme in PAPERLESS_URL (SSRF prevention)', () => {
      expect(() =>
        loadConfig({
          PAPERLESS_URL: 'ftp://internal.host/resource',
          PAPERLESS_API_TOKEN: 'test-token',
        }),
      ).toThrow('PAPERLESS_URL must use http or https scheme, got: ftp');
    });

    it('rejects invalid URL in PAPERLESS_URL', () => {
      expect(() =>
        loadConfig({
          PAPERLESS_URL: 'not-a-url',
          PAPERLESS_API_TOKEN: 'test-token',
        }),
      ).toThrow('PAPERLESS_URL must be a valid URL, got: not-a-url');
    });

    it('paperlessEnabled is false when PAPERLESS_URL is not set', () => {
      const config = loadConfig({ PAPERLESS_API_TOKEN: 'test-token' });
      expect(config.paperlessEnabled).toBe(false);
      expect(config.paperlessUrl).toBeUndefined();
    });

    it('paperlessEnabled is false when PAPERLESS_API_TOKEN is not set', () => {
      const config = loadConfig({ PAPERLESS_URL: 'http://paperless:8000' });
      expect(config.paperlessEnabled).toBe(false);
    });

    it('paperlessEnabled is false when neither Paperless env var is set', () => {
      const config = loadConfig({});
      expect(config.paperlessEnabled).toBe(false);
      expect(config.paperlessUrl).toBeUndefined();
      expect(config.paperlessApiToken).toBeUndefined();
    });
  });

  describe('PAPERLESS_EXTERNAL_URL Configuration', () => {
    it('PAPERLESS_EXTERNAL_URL not set → paperlessExternalUrl is undefined', () => {
      const config = loadConfig({});
      expect(config.paperlessExternalUrl).toBeUndefined();
    });

    it('valid https:// URL → paperlessExternalUrl equals that URL', () => {
      const config = loadConfig({
        PAPERLESS_EXTERNAL_URL: 'https://paperless.example.com',
      });

      expect(config.paperlessExternalUrl).toBe('https://paperless.example.com');
    });

    it('valid http:// URL → accepted', () => {
      const config = loadConfig({
        PAPERLESS_EXTERNAL_URL: 'http://paperless.internal:8000',
      });

      expect(config.paperlessExternalUrl).toBe('http://paperless.internal:8000');
    });

    it('file:// scheme → throws error containing PAPERLESS_EXTERNAL_URL must use http or https scheme, got: file', () => {
      expect(() =>
        loadConfig({
          PAPERLESS_EXTERNAL_URL: 'file:///etc/passwd',
        }),
      ).toThrow('PAPERLESS_EXTERNAL_URL must use http or https scheme, got: file');
    });

    it('ftp:// scheme → throws error containing PAPERLESS_EXTERNAL_URL must use http or https scheme, got: ftp', () => {
      expect(() =>
        loadConfig({
          PAPERLESS_EXTERNAL_URL: 'ftp://host/resource',
        }),
      ).toThrow('PAPERLESS_EXTERNAL_URL must use http or https scheme, got: ftp');
    });

    it('invalid URL string → throws error containing PAPERLESS_EXTERNAL_URL must be a valid URL', () => {
      expect(() =>
        loadConfig({
          PAPERLESS_EXTERNAL_URL: 'not-a-url',
        }),
      ).toThrow('PAPERLESS_EXTERNAL_URL must be a valid URL, got: not-a-url');
    });

    it('empty string → treated as undefined, paperlessExternalUrl is undefined', () => {
      const config = loadConfig({
        PAPERLESS_EXTERNAL_URL: '',
      });

      expect(config.paperlessExternalUrl).toBeUndefined();
    });

    it('external URL set without PAPERLESS_URL/PAPERLESS_API_TOKEN → paperlessEnabled is false, but paperlessExternalUrl is set', () => {
      const config = loadConfig({
        PAPERLESS_EXTERNAL_URL: 'https://external.example.com',
      });

      expect(config.paperlessEnabled).toBe(false);
      expect(config.paperlessExternalUrl).toBe('https://external.example.com');
    });

    it('all three paperless vars set → paperlessEnabled is true, both URLs set', () => {
      const config = loadConfig({
        PAPERLESS_URL: 'http://paperless:8000',
        PAPERLESS_EXTERNAL_URL: 'https://external.example.com',
        PAPERLESS_API_TOKEN: 'test-token',
      });

      expect(config.paperlessEnabled).toBe(true);
      expect(config.paperlessUrl).toBe('http://paperless:8000');
      expect(config.paperlessExternalUrl).toBe('https://external.example.com');
      expect(config.paperlessApiToken).toBe('test-token');
    });
  });

  describe('PAPERLESS_FILTER_TAG Configuration', () => {
    it('PAPERLESS_FILTER_TAG not set → paperlessFilterTag is undefined', () => {
      const config = loadConfig({});
      expect(config.paperlessFilterTag).toBeUndefined();
    });

    it('PAPERLESS_FILTER_TAG set to "cornerstone" → paperlessFilterTag equals "cornerstone"', () => {
      const config = loadConfig({
        PAPERLESS_FILTER_TAG: 'cornerstone',
      });

      expect(config.paperlessFilterTag).toBe('cornerstone');
    });

    it('PAPERLESS_FILTER_TAG set to "invoice" → paperlessFilterTag equals "invoice"', () => {
      const config = loadConfig({
        PAPERLESS_FILTER_TAG: 'invoice',
      });

      expect(config.paperlessFilterTag).toBe('invoice');
    });

    it('PAPERLESS_FILTER_TAG empty string → paperlessFilterTag is undefined', () => {
      const config = loadConfig({
        PAPERLESS_FILTER_TAG: '',
      });

      expect(config.paperlessFilterTag).toBeUndefined();
    });

    it('PAPERLESS_FILTER_TAG set without Paperless enabled → paperlessFilterTag still set', () => {
      const config = loadConfig({
        PAPERLESS_FILTER_TAG: 'cornerstone',
        // No PAPERLESS_URL or PAPERLESS_API_TOKEN
      });

      expect(config.paperlessFilterTag).toBe('cornerstone');
      expect(config.paperlessEnabled).toBe(false);
    });

    it('PAPERLESS_FILTER_TAG set with Paperless enabled → both set', () => {
      const config = loadConfig({
        PAPERLESS_URL: 'http://paperless:8000',
        PAPERLESS_API_TOKEN: 'test-token',
        PAPERLESS_FILTER_TAG: 'cornerstone',
      });

      expect(config.paperlessEnabled).toBe(true);
      expect(config.paperlessFilterTag).toBe('cornerstone');
    });
  });

  describe('Scenario 6: Collect All Validation Errors', () => {
    it('reports multiple bad values in a single error', () => {
      expect(() =>
        loadConfig({
          PORT: 'bad-port',
          LOG_LEVEL: 'bad-level',
        }),
      ).toThrow(
        'Configuration validation failed:\n  - PORT must be a valid number, got: bad-port\n  - LOG_LEVEL must be one of trace, debug, info, warn, error, fatal, got: bad-level',
      );
    });

    it('reports all validation issues at once (PORT out of range + invalid LOG_LEVEL)', () => {
      expect(() =>
        loadConfig({
          PORT: '-100',
          LOG_LEVEL: 'verbose',
        }),
      ).toThrow('Configuration validation failed:');
      expect(() =>
        loadConfig({
          PORT: '-100',
          LOG_LEVEL: 'verbose',
        }),
      ).toThrow('PORT must be in range 0-65535, got: -100');
      expect(() =>
        loadConfig({
          PORT: '-100',
          LOG_LEVEL: 'verbose',
        }),
      ).toThrow('LOG_LEVEL must be one of trace, debug, info, warn, error, fatal, got: verbose');
    });
  });

  describe('CURRENCY Configuration', () => {
    it('defaults to EUR when CURRENCY env is not set', () => {
      const config = loadConfig({});
      expect(config.currency).toBe('EUR');
    });

    it('accepts CHF as a valid 3-letter ISO 4217 code', () => {
      const config = loadConfig({ CURRENCY: 'CHF' });
      expect(config.currency).toBe('CHF');
    });

    it('accepts USD as a valid 3-letter ISO 4217 code', () => {
      const config = loadConfig({ CURRENCY: 'USD' });
      expect(config.currency).toBe('USD');
    });

    it('uppercases lowercase input (eur → EUR)', () => {
      const config = loadConfig({ CURRENCY: 'eur' });
      expect(config.currency).toBe('EUR');
    });

    it('uppercases mixed-case input (Chf → CHF)', () => {
      const config = loadConfig({ CURRENCY: 'Chf' });
      expect(config.currency).toBe('CHF');
    });

    it('rejects a code longer than 3 letters (TOOLONG)', () => {
      expect(() => loadConfig({ CURRENCY: 'TOOLONG' })).toThrow(
        'CURRENCY must be a 3-letter ISO 4217 code',
      );
    });

    it('rejects a code shorter than 3 letters (EU)', () => {
      expect(() => loadConfig({ CURRENCY: 'EU' })).toThrow(
        'CURRENCY must be a 3-letter ISO 4217 code',
      );
    });

    it('rejects a numeric string (123)', () => {
      expect(() => loadConfig({ CURRENCY: '123' })).toThrow(
        'CURRENCY must be a 3-letter ISO 4217 code',
      );
    });

    it('rejects a code with digits mixed in (EU1)', () => {
      expect(() => loadConfig({ CURRENCY: 'EU1' })).toThrow(
        'CURRENCY must be a 3-letter ISO 4217 code',
      );
    });

    it('treats empty string CURRENCY as missing and defaults to EUR', () => {
      const config = loadConfig({ CURRENCY: '' });
      expect(config.currency).toBe('EUR');
    });

    it('error message includes the invalid value that was provided', () => {
      expect(() => loadConfig({ CURRENCY: 'TOOLONG' })).toThrow('got: TOOLONG');
    });
  });

  // ─── Story #1807: VAT_RATE ────────────────────────────────────────────────

  describe('VAT_RATE Configuration (Story #1807)', () => {
    it('Scenario 1: VAT_RATE unset → vatRate defaults to 0.19', () => {
      const config = loadConfig({});
      expect(config.vatRate).toBe(0.19);
    });

    it('Scenario 2: VAT_RATE=0.20 → vatRate equals 0.2', () => {
      const config = loadConfig({ VAT_RATE: '0.20' });
      expect(config.vatRate).toBe(0.2);
    });

    it('Scenario 3: VAT_RATE=abc (non-numeric) → throws containing "VAT_RATE must be a number between 0 and 1"', () => {
      expect(() => loadConfig({ VAT_RATE: 'abc' })).toThrow(
        'VAT_RATE must be a number between 0 and 1',
      );
    });

    it('Scenario 4: VAT_RATE=1.5 (out of range) → throws the same validation message', () => {
      expect(() => loadConfig({ VAT_RATE: '1.5' })).toThrow(
        'VAT_RATE must be a number between 0 and 1',
      );
    });

    it('Scenario 5: VAT_RATE=-0.1 (negative) → throws the same validation message', () => {
      expect(() => loadConfig({ VAT_RATE: '-0.1' })).toThrow(
        'VAT_RATE must be a number between 0 and 1',
      );
    });

    it('Scenario 6a: VAT_RATE=0 (lower boundary) → accepted, vatRate equals 0', () => {
      const config = loadConfig({ VAT_RATE: '0' });
      expect(config.vatRate).toBe(0);
    });

    it('Scenario 6b: VAT_RATE=1 (upper boundary) → accepted, vatRate equals 1', () => {
      const config = loadConfig({ VAT_RATE: '1' });
      expect(config.vatRate).toBe(1);
    });

    it('Scenario 7: empty string VAT_RATE is treated as missing and defaults to 0.19', () => {
      const config = loadConfig({ VAT_RATE: '' });
      expect(config.vatRate).toBe(0.19);
    });

    it('error message includes the invalid value that was provided', () => {
      expect(() => loadConfig({ VAT_RATE: 'abc' })).toThrow('got: abc');
    });
  });

  // ─── Story #1426: DIARY_DRAFT_RETENTION_DAYS ─────────────────────────────

  describe('DIARY_DRAFT_RETENTION_DAYS Configuration (Story #1426)', () => {
    it('Scenario 35: DIARY_DRAFT_RETENTION_DAYS=0 → valid, diaryDraftRetentionDays equals 0 (cleanup disabled)', () => {
      const config = loadConfig({ DIARY_DRAFT_RETENTION_DAYS: '0' });
      expect(config.diaryDraftRetentionDays).toBe(0);
    });

    it('Scenario 36: DIARY_DRAFT_RETENTION_DAYS=30 → valid, diaryDraftRetentionDays equals 30', () => {
      const config = loadConfig({ DIARY_DRAFT_RETENTION_DAYS: '30' });
      expect(config.diaryDraftRetentionDays).toBe(30);
    });

    it('Scenario 37: DIARY_DRAFT_RETENTION_DAYS=-1 → throws configuration validation error', () => {
      expect(() => loadConfig({ DIARY_DRAFT_RETENTION_DAYS: '-1' })).toThrow(
        'DIARY_DRAFT_RETENTION_DAYS must be a non-negative integer',
      );
    });

    it('Scenario 38: DIARY_DRAFT_RETENTION_DAYS=abc → throws configuration validation error', () => {
      expect(() => loadConfig({ DIARY_DRAFT_RETENTION_DAYS: 'abc' })).toThrow(
        'DIARY_DRAFT_RETENTION_DAYS must be a non-negative integer',
      );
    });

    it('Scenario 39: DIARY_DRAFT_RETENTION_DAYS unset → defaults to 30', () => {
      const config = loadConfig({});
      expect(config.diaryDraftRetentionDays).toBe(30);
    });
  });

  // ─── Story #1546: LLM Auto-Itemization Configuration ─────────────────────

  describe('LLM Auto-Itemization Configuration (Story #1546)', () => {
    it('all three LLM env vars set → autoItemizeEnabled is true', () => {
      const config = loadConfig({
        LLM_BASE_URL: 'https://api.openai.com/v1',
        LLM_API_KEY: 'sk-test-key',
        LLM_MODEL: 'gpt-4o',
      });

      expect(config.autoItemizeEnabled).toBe(true);
      expect(config.llmBaseUrl).toBe('https://api.openai.com/v1');
      expect(config.llmApiKey).toBe('sk-test-key');
      expect(config.llmModel).toBe('gpt-4o');
    });

    it('missing LLM_BASE_URL → autoItemizeEnabled is false', () => {
      const config = loadConfig({
        LLM_API_KEY: 'sk-test-key',
        LLM_MODEL: 'gpt-4o',
      });

      expect(config.autoItemizeEnabled).toBe(false);
      expect(config.llmBaseUrl).toBeUndefined();
    });

    it('missing LLM_API_KEY → autoItemizeEnabled is false', () => {
      const config = loadConfig({
        LLM_BASE_URL: 'https://api.openai.com/v1',
        LLM_MODEL: 'gpt-4o',
      });

      expect(config.autoItemizeEnabled).toBe(false);
      expect(config.llmApiKey).toBeUndefined();
    });

    it('missing LLM_MODEL → autoItemizeEnabled is false', () => {
      const config = loadConfig({
        LLM_BASE_URL: 'https://api.openai.com/v1',
        LLM_API_KEY: 'sk-test-key',
      });

      expect(config.autoItemizeEnabled).toBe(false);
      expect(config.llmModel).toBeUndefined();
    });

    it('none of the LLM env vars set → autoItemizeEnabled is false', () => {
      const config = loadConfig({});
      expect(config.autoItemizeEnabled).toBe(false);
      expect(config.llmBaseUrl).toBeUndefined();
      expect(config.llmApiKey).toBeUndefined();
      expect(config.llmModel).toBeUndefined();
    });

    it('empty string LLM_BASE_URL treated as unset → autoItemizeEnabled is false', () => {
      const config = loadConfig({
        LLM_BASE_URL: '',
        LLM_API_KEY: 'sk-test-key',
        LLM_MODEL: 'gpt-4o',
      });

      expect(config.autoItemizeEnabled).toBe(false);
      expect(config.llmBaseUrl).toBeUndefined();
    });

    it('LLM_REQUEST_TIMEOUT_MS defaults to 30000', () => {
      const config = loadConfig({});
      expect(config.llmRequestTimeoutMs).toBe(30000);
    });

    it('LLM_REQUEST_TIMEOUT_MS=60000 parses as integer 60000', () => {
      const config = loadConfig({ LLM_REQUEST_TIMEOUT_MS: '60000' });
      expect(config.llmRequestTimeoutMs).toBe(60000);
    });

    it('LLM_REQUEST_TIMEOUT_MS=abc → throws configuration validation error', () => {
      expect(() => loadConfig({ LLM_REQUEST_TIMEOUT_MS: 'abc' })).toThrow(
        'LLM_REQUEST_TIMEOUT_MS must be a positive integer',
      );
    });

    it('LLM_REQUEST_TIMEOUT_MS=0 → throws configuration validation error (must be positive)', () => {
      expect(() => loadConfig({ LLM_REQUEST_TIMEOUT_MS: '0' })).toThrow(
        'LLM_REQUEST_TIMEOUT_MS must be a positive integer',
      );
    });

    it('LLM_REQUEST_TIMEOUT_MS=-1 → throws configuration validation error', () => {
      expect(() => loadConfig({ LLM_REQUEST_TIMEOUT_MS: '-1' })).toThrow(
        'LLM_REQUEST_TIMEOUT_MS must be a positive integer',
      );
    });

    it('LLM_MAX_TOKENS defaults to 16384', () => {
      const config = loadConfig({});
      expect(config.llmMaxTokens).toBe(16384);
    });

    it('LLM_MAX_TOKENS=32000 parses as integer 32000', () => {
      const config = loadConfig({ LLM_MAX_TOKENS: '32000' });
      expect(config.llmMaxTokens).toBe(32000);
    });

    it('LLM_MAX_TOKENS=abc → throws configuration validation error', () => {
      expect(() => loadConfig({ LLM_MAX_TOKENS: 'abc' })).toThrow(
        'LLM_MAX_TOKENS must be a positive integer',
      );
    });

    it('LLM_MAX_TOKENS=0 → throws configuration validation error (must be positive)', () => {
      expect(() => loadConfig({ LLM_MAX_TOKENS: '0' })).toThrow(
        'LLM_MAX_TOKENS must be a positive integer',
      );
    });

    it('LLM_BASE_URL with file:// scheme → throws validation error (SSRF prevention)', () => {
      expect(() =>
        loadConfig({
          LLM_BASE_URL: 'file:///etc/passwd',
          LLM_API_KEY: 'key',
          LLM_MODEL: 'model',
        }),
      ).toThrow('LLM_BASE_URL must use http or https scheme, got: file');
    });

    it('LLM_BASE_URL with invalid URL → throws validation error', () => {
      expect(() =>
        loadConfig({
          LLM_BASE_URL: 'not-a-url',
          LLM_API_KEY: 'key',
          LLM_MODEL: 'model',
        }),
      ).toThrow('LLM_BASE_URL must be a valid URL, got: not-a-url');
    });

    it('LLM_BASE_URL with http:// scheme → accepted (valid for local Ollama etc.)', () => {
      const config = loadConfig({
        LLM_BASE_URL: 'http://localhost:11434/v1',
        LLM_API_KEY: 'ollama',
        LLM_MODEL: 'llama3',
      });

      expect(config.autoItemizeEnabled).toBe(true);
      expect(config.llmBaseUrl).toBe('http://localhost:11434/v1');
    });
  });

  describe('LLM Provider Resolution', () => {
    const baseEnv = {
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'test-model',
    };

    it.each([
      ['https://api.anthropic.com/v1', 'anthropic'],
      ['https://api.openai.com/v1', 'openai'],
      ['https://generativelanguage.googleapis.com/v1beta/openai', 'gemini'],
      ['http://localhost:11434/v1', 'ollama'],
      ['http://ollama:11434/v1', 'ollama'],
    ] as const)('auto-detects %s as %s when LLM_PROVIDER unset', (url, expected) => {
      const config = loadConfig({ ...baseEnv, LLM_BASE_URL: url });
      expect(config.llmProvider).toBe(expected);
    });

    it('falls back to generic for unknown hosts', () => {
      const config = loadConfig({
        ...baseEnv,
        LLM_BASE_URL: 'https://openrouter.ai/api/v1',
      });
      expect(config.llmProvider).toBe('generic');
    });

    it('explicit LLM_PROVIDER overrides auto-detection', () => {
      const config = loadConfig({
        ...baseEnv,
        LLM_BASE_URL: 'https://api.anthropic.com/v1',
        LLM_PROVIDER: 'openai',
      });
      expect(config.llmProvider).toBe('openai');
    });

    it('LLM_PROVIDER is case-insensitive and trims whitespace', () => {
      const config = loadConfig({
        ...baseEnv,
        LLM_BASE_URL: 'https://example.com',
        LLM_PROVIDER: '  ANTHROPIC  ',
      });
      expect(config.llmProvider).toBe('anthropic');
    });

    it('rejects unknown LLM_PROVIDER values', () => {
      expect(() =>
        loadConfig({
          ...baseEnv,
          LLM_BASE_URL: 'https://example.com',
          LLM_PROVIDER: 'bedrock',
        }),
      ).toThrow(/LLM_PROVIDER must be one of/);
    });

    it('defaults to generic when LLM is not configured at all', () => {
      const config = loadConfig({});
      expect(config.llmProvider).toBe('generic');
      expect(config.autoItemizeEnabled).toBe(false);
    });

    it('llmProvider is in the /api/config-loaded log (no secrets)', () => {
      // The config object exposes llmProvider — covered by the route-level test
      // that asserts secrets are NOT in the response. We only verify the shape here.
      const config = loadConfig({
        ...baseEnv,
        LLM_BASE_URL: 'https://api.anthropic.com/v1',
      });
      expect(config).toHaveProperty('llmProvider', 'anthropic');
    });
  });

  // ─── Story #1901: llmEnabled (alias of autoItemizeEnabled) ─────────────────

  describe('llmEnabled Configuration (Story #1901)', () => {
    it('llmEnabled is false when no LLM env vars are set (matches autoItemizeEnabled)', () => {
      const config = loadConfig({});
      expect(config.llmEnabled).toBe(false);
      expect(config.llmEnabled).toBe(config.autoItemizeEnabled);
    });

    it('llmEnabled is true when all three LLM env vars are set (matches autoItemizeEnabled)', () => {
      const config = loadConfig({
        LLM_BASE_URL: 'https://api.openai.com/v1',
        LLM_API_KEY: 'sk-test-key',
        LLM_MODEL: 'gpt-4o',
      });
      expect(config.llmEnabled).toBe(true);
      expect(config.llmEnabled).toBe(config.autoItemizeEnabled);
    });

    it('llmEnabled is false when only some LLM env vars are set (matches autoItemizeEnabled)', () => {
      const config = loadConfig({
        LLM_BASE_URL: 'https://api.openai.com/v1',
        LLM_API_KEY: 'sk-test-key',
        // LLM_MODEL missing
      });
      expect(config.llmEnabled).toBe(false);
      expect(config.llmEnabled).toBe(config.autoItemizeEnabled);
    });

    it('llmEnabled always mirrors autoItemizeEnabled across a range of partial configurations', () => {
      const scenarios: Array<Record<string, string>> = [
        {},
        { LLM_BASE_URL: 'https://api.openai.com/v1' },
        { LLM_API_KEY: 'key-only' },
        { LLM_BASE_URL: 'https://api.openai.com/v1', LLM_API_KEY: 'sk-key', LLM_MODEL: 'gpt-4o' },
      ];
      for (const env of scenarios) {
        const config = loadConfig(env);
        expect(config.llmEnabled).toBe(config.autoItemizeEnabled);
      }
    });
  });

  // ─── Issue #1970: AUTH_RATE_LIMIT_MAX and AUTH_RATE_LIMIT_WINDOW ──────────

  describe('AUTH_RATE_LIMIT_MAX and AUTH_RATE_LIMIT_WINDOW Configuration (Issue #1970)', () => {
    it('AUTH_RATE_LIMIT_MAX unset → authRateLimitMax defaults to 20', () => {
      const config = loadConfig({});
      expect(config.authRateLimitMax).toBe(20);
    });

    it('AUTH_RATE_LIMIT_WINDOW unset → authRateLimitWindow defaults to "15 minutes"', () => {
      const config = loadConfig({});
      expect(config.authRateLimitWindow).toBe('15 minutes');
    });

    it('AUTH_RATE_LIMIT_MAX=50 → authRateLimitMax equals 50', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_MAX: '50' });
      expect(config.authRateLimitMax).toBe(50);
    });

    it('AUTH_RATE_LIMIT_WINDOW="1h" → authRateLimitWindow equals "1h"', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_WINDOW: '1h' });
      expect(config.authRateLimitWindow).toBe('1h');
    });

    it('AUTH_RATE_LIMIT_WINDOW="30 minutes" → authRateLimitWindow equals "30 minutes"', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_WINDOW: '30 minutes' });
      expect(config.authRateLimitWindow).toBe('30 minutes');
    });

    it('AUTH_RATE_LIMIT_WINDOW="30s" → authRateLimitWindow equals "30s"', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_WINDOW: '30s' });
      expect(config.authRateLimitWindow).toBe('30s');
    });

    it('AUTH_RATE_LIMIT_MAX=abc → throws containing "AUTH_RATE_LIMIT_MAX must be a positive integer, got: abc"', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: 'abc' })).toThrow(
        'AUTH_RATE_LIMIT_MAX must be a positive integer, got: abc',
      );
    });

    it('AUTH_RATE_LIMIT_MAX=0 → throws containing "AUTH_RATE_LIMIT_MAX must be a positive integer, got: 0"', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: '0' })).toThrow(
        'AUTH_RATE_LIMIT_MAX must be a positive integer, got: 0',
      );
    });

    it('AUTH_RATE_LIMIT_MAX=-1 → throws containing "AUTH_RATE_LIMIT_MAX must be a positive integer, got: -1"', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: '-1' })).toThrow(
        'AUTH_RATE_LIMIT_MAX must be a positive integer, got: -1',
      );
    });

    it('AUTH_RATE_LIMIT_WINDOW=not-a-duration → throws containing "AUTH_RATE_LIMIT_WINDOW must be a valid duration string"', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_WINDOW: 'not-a-duration' })).toThrow(
        'AUTH_RATE_LIMIT_WINDOW must be a valid duration string',
      );
    });

    it('AUTH_RATE_LIMIT_WINDOW="5 minutes foo" → throws containing "AUTH_RATE_LIMIT_WINDOW must be a valid duration string"', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_WINDOW: '5 minutes foo' })).toThrow(
        'AUTH_RATE_LIMIT_WINDOW must be a valid duration string',
      );
    });

    it('empty string AUTH_RATE_LIMIT_MAX treated as missing → authRateLimitMax defaults to 20', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_MAX: '' });
      expect(config.authRateLimitMax).toBe(20);
    });

    it('empty string AUTH_RATE_LIMIT_WINDOW treated as missing → authRateLimitWindow defaults to "15 minutes"', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_WINDOW: '' });
      expect(config.authRateLimitWindow).toBe('15 minutes');
    });

    it('both invalid vars in one call → single throw listing both errors', () => {
      expect(() =>
        loadConfig({
          AUTH_RATE_LIMIT_MAX: 'abc',
          AUTH_RATE_LIMIT_WINDOW: 'not-a-duration',
        }),
      ).toThrow(
        "Configuration validation failed:\n  - AUTH_RATE_LIMIT_MAX must be a positive integer, got: abc\n  - AUTH_RATE_LIMIT_WINDOW must be a valid duration string (e.g. '15 minutes', '1h'), got: not-a-duration",
      );
    });

    it('AUTH_RATE_LIMIT_MAX=1 (minimum valid) → authRateLimitMax equals 1', () => {
      const config = loadConfig({ AUTH_RATE_LIMIT_MAX: '1' });
      expect(config.authRateLimitMax).toBe(1);
    });

    it('AUTH_RATE_LIMIT_WINDOW="0s" → throws containing zero magnitude error', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_WINDOW: '0s' })).toThrow(
        'AUTH_RATE_LIMIT_WINDOW must have a positive duration (zero magnitude is not allowed), got: 0s',
      );
    });

    it('AUTH_RATE_LIMIT_WINDOW="0 minutes" → throws containing zero magnitude error', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_WINDOW: '0 minutes' })).toThrow(
        'AUTH_RATE_LIMIT_WINDOW must have a positive duration (zero magnitude is not allowed), got: 0 minutes',
      );
    });

    it('AUTH_RATE_LIMIT_WINDOW="0.0h" → throws containing zero magnitude error (parseFloat gives 0)', () => {
      expect(() => loadConfig({ AUTH_RATE_LIMIT_WINDOW: '0.0h' })).toThrow(
        'AUTH_RATE_LIMIT_WINDOW must have a positive duration (zero magnitude is not allowed), got: 0.0h',
      );
    });
  });

  // ─── Issue #1991: Strict integer parsing for numeric environment variables ─

  describe('Issue #1991: Strict Integer Parsing', () => {
    describe('AC5: rejected input classes (AUTH_RATE_LIMIT_MAX)', () => {
      it('rejects trailing garbage ("20abc") — names the variable and arrives via the aggregated throw', () => {
        expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: '20abc' })).toThrow(
          'Configuration validation failed:\n  - AUTH_RATE_LIMIT_MAX must be a positive integer, got: 20abc',
        );
      });

      it('rejects a decimal ("20.9") — names the variable and arrives via the aggregated throw', () => {
        expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: '20.9' })).toThrow(
          'Configuration validation failed:\n  - AUTH_RATE_LIMIT_MAX must be a positive integer, got: 20.9',
        );
      });

      it('rejects exponent notation ("1e3") — names the variable and arrives via the aggregated throw', () => {
        expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: '1e3' })).toThrow(
          'Configuration validation failed:\n  - AUTH_RATE_LIMIT_MAX must be a positive integer, got: 1e3',
        );
      });

      it('rejects leading whitespace (" 20") — names the variable and arrives via the aggregated throw', () => {
        const raw = ' 20';
        expect(() => loadConfig({ AUTH_RATE_LIMIT_MAX: raw })).toThrow(
          `Configuration validation failed:\n  - AUTH_RATE_LIMIT_MAX must be a positive integer, got: ${raw}`,
        );
      });
    });

    describe('AC2 spot-check: strict parsing applies at every one of the eight call sites', () => {
      it.each([
        ['PORT', 'PORT must be a valid number, got: 20abc'],
        ['SESSION_DURATION', 'SESSION_DURATION must be a valid number, got: 20abc'],
        ['PHOTO_MAX_FILE_SIZE_MB', 'PHOTO_MAX_FILE_SIZE_MB must be a valid number, got: 20abc'],
        [
          'DIARY_DRAFT_RETENTION_DAYS',
          'DIARY_DRAFT_RETENTION_DAYS must be a non-negative integer, got: 20abc',
        ],
        ['BACKUP_RETENTION', 'BACKUP_RETENTION must be a positive integer, got: 20abc'],
        ['LLM_REQUEST_TIMEOUT_MS', 'LLM_REQUEST_TIMEOUT_MS must be a positive integer, got: 20abc'],
        ['LLM_MAX_TOKENS', 'LLM_MAX_TOKENS must be a positive integer, got: 20abc'],
        ['AUTH_RATE_LIMIT_MAX', 'AUTH_RATE_LIMIT_MAX must be a positive integer, got: 20abc'],
      ] as const)(
        '%s="20abc" (trailing garbage) is rejected naming the offending variable',
        (envVar, expectedMessage) => {
          expect(() => loadConfig({ [envVar]: '20abc' })).toThrow(expectedMessage);
        },
      );
    });

    describe('AC3 spot-check: pre-existing range checks are preserved (two of the eight call sites had no direct test before this issue)', () => {
      it('SESSION_DURATION="0" → throws containing "SESSION_DURATION must be greater than 0, got: 0"', () => {
        expect(() => loadConfig({ SESSION_DURATION: '0' })).toThrow(
          'SESSION_DURATION must be greater than 0, got: 0',
        );
      });

      it('PHOTO_MAX_FILE_SIZE_MB="0" → throws containing "PHOTO_MAX_FILE_SIZE_MB must be greater than 0, got: 0"', () => {
        expect(() => loadConfig({ PHOTO_MAX_FILE_SIZE_MB: '0' })).toThrow(
          'PHOTO_MAX_FILE_SIZE_MB must be greater than 0, got: 0',
        );
      });

      it('BACKUP_RETENTION="0" → throws containing "BACKUP_RETENTION must be a positive integer, got: 0"', () => {
        expect(() => loadConfig({ BACKUP_RETENTION: '0' })).toThrow(
          'BACKUP_RETENTION must be a positive integer, got: 0',
        );
      });
    });

    describe('AC6: every previously-valid value for all eight variables still loads unchanged', () => {
      it('non-default valid values for all eight variables parse to the exact expected numbers', () => {
        const config = loadConfig({
          PORT: '8080',
          SESSION_DURATION: '3600',
          PHOTO_MAX_FILE_SIZE_MB: '50',
          DIARY_DRAFT_RETENTION_DAYS: '15',
          BACKUP_RETENTION: '7',
          LLM_REQUEST_TIMEOUT_MS: '45000',
          LLM_MAX_TOKENS: '8192',
          AUTH_RATE_LIMIT_MAX: '100',
        });

        expect(config.port).toBe(8080);
        expect(config.sessionDuration).toBe(3600);
        expect(config.photoMaxFileSizeMb).toBe(50);
        expect(config.diaryDraftRetentionDays).toBe(15);
        expect(config.backupRetention).toBe(7);
        expect(config.llmRequestTimeoutMs).toBe(45000);
        expect(config.llmMaxTokens).toBe(8192);
        expect(config.authRateLimitMax).toBe(100);
      });

      it('default values for all eight variables (unset) still load unchanged', () => {
        const config = loadConfig({});

        expect(config.port).toBe(3000);
        expect(config.sessionDuration).toBe(604800);
        expect(config.photoMaxFileSizeMb).toBe(20);
        expect(config.diaryDraftRetentionDays).toBe(30);
        expect(config.backupRetention).toBeUndefined();
        expect(config.llmRequestTimeoutMs).toBe(30000);
        expect(config.llmMaxTokens).toBe(16384);
        expect(config.authRateLimitMax).toBe(20);
      });
    });

    describe('DIARY_DRAFT_RETENTION_DAYS="0" remains valid (zero disables cleanup — not swept up by the stricter parser)', () => {
      it('parses to exactly 0 on its own', () => {
        const config = loadConfig({ DIARY_DRAFT_RETENTION_DAYS: '0' });
        expect(config.diaryDraftRetentionDays).toBe(0);
      });

      it('parses to exactly 0 even when another numeric variable fails validation in the same call', () => {
        let caught: Error | undefined;
        try {
          loadConfig({ DIARY_DRAFT_RETENTION_DAYS: '0', AUTH_RATE_LIMIT_MAX: 'bad' });
        } catch (err) {
          caught = err as Error;
        }

        expect(caught).toBeDefined();
        expect(caught!.message).toContain(
          'AUTH_RATE_LIMIT_MAX must be a positive integer, got: bad',
        );
        expect(caught!.message).not.toContain('DIARY_DRAFT_RETENTION_DAYS');

        // Confirm it is genuinely accepted, not just silently absent from the
        // error list — call it again in isolation and inspect the parsed value.
        const config = loadConfig({ DIARY_DRAFT_RETENTION_DAYS: '0' });
        expect(config.diaryDraftRetentionDays).toBe(0);
      });
    });

    describe('AC4: error accumulation — multiple bad numeric variables are all reported in one throw', () => {
      it('three simultaneously invalid numeric variables (from three different rejected classes) all appear in a single aggregated error, in declaration order', () => {
        expect(() =>
          loadConfig({
            PORT: '20abc', // trailing garbage
            SESSION_DURATION: '20.9', // decimal
            AUTH_RATE_LIMIT_MAX: '1e3', // exponent notation
          }),
        ).toThrow(
          'Configuration validation failed:\n' +
            '  - PORT must be a valid number, got: 20abc\n' +
            '  - SESSION_DURATION must be a valid number, got: 20.9\n' +
            '  - AUTH_RATE_LIMIT_MAX must be a positive integer, got: 1e3',
        );
      });

      it('all eight numeric variables invalid at once → every one of the eight is named in the single throw', () => {
        let caught: Error | undefined;
        try {
          loadConfig({
            PORT: '20abc',
            SESSION_DURATION: '20abc',
            PHOTO_MAX_FILE_SIZE_MB: '20abc',
            DIARY_DRAFT_RETENTION_DAYS: '20abc',
            BACKUP_RETENTION: '20abc',
            LLM_REQUEST_TIMEOUT_MS: '20abc',
            LLM_MAX_TOKENS: '20abc',
            AUTH_RATE_LIMIT_MAX: '20abc',
          });
        } catch (err) {
          caught = err as Error;
        }

        expect(caught).toBeDefined();
        const message = caught!.message;
        expect(message).toContain('PORT must be a valid number, got: 20abc');
        expect(message).toContain('SESSION_DURATION must be a valid number, got: 20abc');
        expect(message).toContain('PHOTO_MAX_FILE_SIZE_MB must be a valid number, got: 20abc');
        expect(message).toContain(
          'DIARY_DRAFT_RETENTION_DAYS must be a non-negative integer, got: 20abc',
        );
        expect(message).toContain('BACKUP_RETENTION must be a positive integer, got: 20abc');
        expect(message).toContain('LLM_REQUEST_TIMEOUT_MS must be a positive integer, got: 20abc');
        expect(message).toContain('LLM_MAX_TOKENS must be a positive integer, got: 20abc');
        expect(message).toContain('AUTH_RATE_LIMIT_MAX must be a positive integer, got: 20abc');

        // Sanity: exactly 8 bullet lines, proving none were dropped, merged, or
        // duplicated by the switch away from bare parseInt.
        const bulletCount = (message.match(/\n {2}- /g) ?? []).length;
        expect(bulletCount).toBe(8);
      });
    });
  });
});

describe('Configuration Module - Fastify Plugin Integration', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-config-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
  });

  afterEach(async () => {
    // Close the app if it was created
    if (app) {
      await app.close();
    }

    // Restore original environment
    process.env = originalEnv;

    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Scenario 3: Configuration Available as Fastify Decoration', () => {
    it('fastify.config is defined and contains all configuration values', async () => {
      // Given: Server has started
      app = await buildApp();

      // Then: fastify.config is accessible
      expect(app.config).toBeDefined();
      expect(app.config.port).toBe(3000);
      expect(app.config.host).toBe('0.0.0.0');
      expect(app.config.logLevel).toBe('info');
      // Jest sets NODE_ENV=test by default
      expect(app.config.nodeEnv).toBe(process.env.NODE_ENV || 'production');
    });

    it('route handlers can access fastify.config', async () => {
      // Given: Server has started
      app = await buildApp();

      // When: A route handler accesses fastify.config
      app.get('/test-config', async (request) => {
        return {
          port: request.server.config.port,
          host: request.server.config.host,
          logLevel: request.server.config.logLevel,
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test-config',
      });

      // Then: The handler can read config values
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({
        port: 3000,
        host: '0.0.0.0',
        logLevel: 'info',
      });
    });

    it('config reflects custom environment values', async () => {
      // Given: Custom environment values
      process.env.PORT = '8080';
      process.env.HOST = 'localhost';
      process.env.LOG_LEVEL = 'debug';
      process.env.NODE_ENV = 'development';

      // When: Server starts
      app = await buildApp();

      // Then: Config reflects the custom values
      expect(app.config.port).toBe(8080);
      expect(app.config.host).toBe('localhost');
      expect(app.config.logLevel).toBe('debug');
      expect(app.config.nodeEnv).toBe('development');
    });
  });

  describe('Database Plugin Integration', () => {
    it('db plugin receives databaseUrl from config decoration', async () => {
      // Given: Custom DATABASE_URL
      const customDbPath = join(tempDir, 'custom.db');
      process.env.DATABASE_URL = customDbPath;

      // When: Server starts
      app = await buildApp();

      // Then: Config has the custom path
      expect(app.config.databaseUrl).toBe(customDbPath);

      // And: Database plugin created the file at the custom path
      const { existsSync } = await import('node:fs');
      expect(existsSync(customDbPath)).toBe(true);
    });

    it('db plugin uses config.databaseUrl (not process.env directly)', async () => {
      // Given: Server has started with default DATABASE_URL
      app = await buildApp();

      // Then: Config provides the database path
      expect(app.config.databaseUrl).toBe(process.env.DATABASE_URL);

      // And: Database connection is working
      const result = app.db.$client.prepare('SELECT 1 as value').get() as { value: number };
      expect(result).toEqual({ value: 1 });
    });
  });

  describe('Startup Failure on Invalid Configuration', () => {
    it('server fails to start with invalid PORT', async () => {
      // Given: Invalid PORT
      process.env.PORT = 'invalid-port';

      // When/Then: Server startup fails
      await expect(buildApp()).rejects.toThrow('Configuration validation failed');
      await expect(buildApp()).rejects.toThrow('PORT must be a valid number');
    });

    it('server fails to start with invalid LOG_LEVEL', async () => {
      // Given: Invalid LOG_LEVEL
      process.env.LOG_LEVEL = 'invalid';

      // When/Then: Server startup fails
      // Note: Fastify's logger validates LOG_LEVEL before config plugin loads,
      // so it throws "default level:invalid must be included in custom levels"
      // rather than our config validation error. This is acceptable since
      // the server fails fast either way.
      await expect(buildApp()).rejects.toThrow();
    });

    it('server fails to start with multiple invalid values', async () => {
      // Given: Multiple invalid values
      process.env.PORT = '70000';
      process.env.LOG_LEVEL = 'info'; // Use valid LOG_LEVEL so config plugin runs

      // When/Then: Server startup fails with all errors listed
      await expect(buildApp()).rejects.toThrow('Configuration validation failed');
      await expect(buildApp()).rejects.toThrow('PORT must be in range 0-65535');
    });
  });
});

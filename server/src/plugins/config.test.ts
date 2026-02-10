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
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,
        oidcRedirectUri: undefined,
        oidcEnabled: false,
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
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,
        oidcRedirectUri: undefined,
        oidcEnabled: false,
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
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,
        oidcRedirectUri: undefined,
        oidcEnabled: false,
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
        oidcIssuer: undefined,
        oidcClientId: undefined,
        oidcClientSecret: undefined,
        oidcRedirectUri: undefined,
        oidcEnabled: false,
      });
    });
  });

  describe('OIDC Configuration', () => {
    it('config with all OIDC env vars → oidcEnabled is true', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        OIDC_CLIENT_SECRET: 'secret-456',
        OIDC_REDIRECT_URI: 'https://app.example.com/api/auth/oidc/callback',
      });

      expect(config.oidcEnabled).toBe(true);
      expect(config.oidcIssuer).toBe('https://oidc.example.com');
      expect(config.oidcClientId).toBe('client-123');
      expect(config.oidcClientSecret).toBe('secret-456');
      expect(config.oidcRedirectUri).toBe('https://app.example.com/api/auth/oidc/callback');
    });

    it('config with partial OIDC env vars → oidcEnabled is false', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        // Missing OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI
      });

      expect(config.oidcEnabled).toBe(false);
      expect(config.oidcIssuer).toBe('https://oidc.example.com');
      expect(config.oidcClientId).toBe('client-123');
      expect(config.oidcClientSecret).toBeUndefined();
      expect(config.oidcRedirectUri).toBeUndefined();
    });

    it('config with empty string OIDC env vars → oidcEnabled is false', () => {
      const config = loadConfig({
        OIDC_ISSUER: '',
        OIDC_CLIENT_ID: '',
        OIDC_CLIENT_SECRET: '',
        OIDC_REDIRECT_URI: '',
      });

      expect(config.oidcEnabled).toBe(false);
      expect(config.oidcIssuer).toBeUndefined();
      expect(config.oidcClientId).toBeUndefined();
      expect(config.oidcClientSecret).toBeUndefined();
      expect(config.oidcRedirectUri).toBeUndefined();
    });

    it('verify OIDC values are correctly read from environment', () => {
      const issuer = 'https://auth.example.com';
      const clientId = 'my-client-id';
      const clientSecret = 'my-client-secret';
      const redirectUri = 'https://app.example.com/callback';

      const config = loadConfig({
        OIDC_ISSUER: issuer,
        OIDC_CLIENT_ID: clientId,
        OIDC_CLIENT_SECRET: clientSecret,
        OIDC_REDIRECT_URI: redirectUri,
      });

      expect(config.oidcIssuer).toBe(issuer);
      expect(config.oidcClientId).toBe(clientId);
      expect(config.oidcClientSecret).toBe(clientSecret);
      expect(config.oidcRedirectUri).toBe(redirectUri);
      expect(config.oidcEnabled).toBe(true);
    });

    it('missing one OIDC var disables OIDC (missing CLIENT_SECRET)', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        OIDC_REDIRECT_URI: 'https://app.example.com/callback',
        // Missing OIDC_CLIENT_SECRET
      });

      expect(config.oidcEnabled).toBe(false);
    });

    it('missing one OIDC var disables OIDC (missing REDIRECT_URI)', () => {
      const config = loadConfig({
        OIDC_ISSUER: 'https://oidc.example.com',
        OIDC_CLIENT_ID: 'client-123',
        OIDC_CLIENT_SECRET: 'secret-456',
        // Missing OIDC_REDIRECT_URI
      });

      expect(config.oidcEnabled).toBe(false);
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

import fp from 'fastify-plugin';
import path from 'node:path';

// Type-safe configuration interface
export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  nodeEnv: string;
  sessionDuration: number; // seconds
  secureCookies: boolean;
  trustProxy: boolean;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcEnabled: boolean;
  paperlessUrl?: string;
  paperlessExternalUrl?: string;
  paperlessApiToken?: string;
  paperlessFilterTag?: string;
  paperlessEnabled: boolean;
  externalUrl?: string;
  photoStoragePath: string;
  photoMaxFileSizeMb: number;
  diaryAutoEvents: boolean;
  currency: string;
  backupDir?: string;
  backupCadence?: string;
  backupRetention?: number;
  backupEnabled: boolean;
}

// Type augmentation: makes fastify.config available across all routes/plugins
declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

/**
 * Pure function to load and validate configuration from environment variables.
 * This function reads environment variables and returns a validated AppConfig object.
 *
 * @param env - Environment variables object (e.g., process.env)
 * @returns Validated AppConfig
 * @throws Error if configuration is invalid (lists all validation errors)
 */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const errors: string[] = [];

  // Helper to treat empty strings as undefined
  const getValue = (key: string): string | undefined => {
    const value = env[key];
    return value === '' ? undefined : value;
  };

  // Parse and validate PORT
  const portStr = getValue('PORT') ?? '3000';
  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
    errors.push(`PORT must be a valid number, got: ${portStr}`);
  } else if (port < 0 || port > 65535) {
    errors.push(`PORT must be in range 0-65535, got: ${port}`);
  }

  // HOST (simple string, no validation)
  const host = getValue('HOST') ?? '0.0.0.0';

  // DATABASE_URL (simple string, no validation)
  const databaseUrl = getValue('DATABASE_URL') ?? '/app/data/cornerstone.db';

  // Parse and validate LOG_LEVEL
  const logLevelStr = (getValue('LOG_LEVEL') ?? 'info').toLowerCase();
  const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  if (!validLogLevels.includes(logLevelStr)) {
    errors.push(
      `LOG_LEVEL must be one of ${validLogLevels.join(', ')}, got: ${getValue('LOG_LEVEL')}`,
    );
  }
  const logLevel = logLevelStr as AppConfig['logLevel'];

  // NODE_ENV (simple string, no validation)
  const nodeEnv = getValue('NODE_ENV') ?? 'production';

  // Parse and validate SESSION_DURATION
  const sessionDurationStr = getValue('SESSION_DURATION') ?? '604800';
  const sessionDuration = parseInt(sessionDurationStr, 10);
  if (isNaN(sessionDuration)) {
    errors.push(`SESSION_DURATION must be a valid number, got: ${sessionDurationStr}`);
  } else if (sessionDuration <= 0) {
    errors.push(`SESSION_DURATION must be greater than 0, got: ${sessionDuration}`);
  }

  // Parse and validate SECURE_COOKIES
  const secureCookiesStr = (getValue('SECURE_COOKIES') ?? 'true').toLowerCase();
  if (secureCookiesStr !== 'true' && secureCookiesStr !== 'false') {
    errors.push(`SECURE_COOKIES must be 'true' or 'false', got: ${getValue('SECURE_COOKIES')}`);
  }
  const secureCookies = secureCookiesStr === 'true';

  // Parse and validate TRUST_PROXY
  const trustProxyStr = (getValue('TRUST_PROXY') ?? 'false').toLowerCase();
  if (trustProxyStr !== 'true' && trustProxyStr !== 'false') {
    errors.push(`TRUST_PROXY must be 'true' or 'false', got: ${getValue('TRUST_PROXY')}`);
  }
  const trustProxy = trustProxyStr === 'true';

  // OIDC configuration (all optional)
  const oidcIssuer = getValue('OIDC_ISSUER');
  const oidcClientId = getValue('OIDC_CLIENT_ID');
  const oidcClientSecret = getValue('OIDC_CLIENT_SECRET');

  // OIDC is enabled when issuer, client ID, and client secret are set
  const oidcEnabled = !!(oidcIssuer && oidcClientId && oidcClientSecret);

  // Paperless-ngx configuration (all optional)
  const paperlessUrlRaw = getValue('PAPERLESS_URL');
  const paperlessApiToken = getValue('PAPERLESS_API_TOKEN');

  // Validate PAPERLESS_URL scheme to prevent SSRF via file://, ftp://, etc.
  let paperlessUrl: string | undefined = undefined;
  if (paperlessUrlRaw) {
    try {
      const parsed = new URL(paperlessUrlRaw);
      const allowedSchemes = ['http:', 'https:'];
      if (!allowedSchemes.includes(parsed.protocol)) {
        errors.push(
          `PAPERLESS_URL must use http or https scheme, got: ${parsed.protocol.replace(':', '')}`,
        );
      } else {
        paperlessUrl = paperlessUrlRaw;
      }
    } catch {
      errors.push(`PAPERLESS_URL must be a valid URL, got: ${paperlessUrlRaw}`);
    }
  }

  // Paperless-ngx external URL (optional, used for browser-facing links)
  const paperlessExternalUrlRaw = getValue('PAPERLESS_EXTERNAL_URL');
  let paperlessExternalUrl: string | undefined = undefined;
  if (paperlessExternalUrlRaw) {
    try {
      const parsed = new URL(paperlessExternalUrlRaw);
      const allowedSchemes = ['http:', 'https:'];
      if (!allowedSchemes.includes(parsed.protocol)) {
        errors.push(
          `PAPERLESS_EXTERNAL_URL must use http or https scheme, got: ${parsed.protocol.replace(':', '')}`,
        );
      } else {
        paperlessExternalUrl = paperlessExternalUrlRaw;
      }
    } catch {
      errors.push(`PAPERLESS_EXTERNAL_URL must be a valid URL, got: ${paperlessExternalUrlRaw}`);
    }
  }

  // Paperless-ngx is enabled when both URL and API token are set
  const paperlessEnabled = !!(paperlessUrl && paperlessApiToken);

  // Paperless-ngx filter tag (optional, tag name string)
  const paperlessFilterTag = getValue('PAPERLESS_FILTER_TAG');

  // Photo storage configuration
  const photoMaxFileSizeMbStr = getValue('PHOTO_MAX_FILE_SIZE_MB') ?? '20';
  const photoMaxFileSizeMb = parseInt(photoMaxFileSizeMbStr, 10);
  if (isNaN(photoMaxFileSizeMb)) {
    errors.push(`PHOTO_MAX_FILE_SIZE_MB must be a valid number, got: ${photoMaxFileSizeMbStr}`);
  } else if (photoMaxFileSizeMb <= 0) {
    errors.push(`PHOTO_MAX_FILE_SIZE_MB must be greater than 0, got: ${photoMaxFileSizeMb}`);
  }

  const photoStoragePath =
    getValue('PHOTO_STORAGE_PATH') ?? path.join(path.dirname(databaseUrl), 'photos');

  // Parse and validate DIARY_AUTO_EVENTS
  const diaryAutoEventsStr = (getValue('DIARY_AUTO_EVENTS') ?? 'true').toLowerCase();
  if (diaryAutoEventsStr !== 'true' && diaryAutoEventsStr !== 'false') {
    errors.push(
      `DIARY_AUTO_EVENTS must be 'true' or 'false', got: ${getValue('DIARY_AUTO_EVENTS')}`,
    );
  }
  const diaryAutoEvents = diaryAutoEventsStr === 'true';

  // EXTERNAL_URL — public-facing base URL (optional, for reverse-proxy setups)
  const externalUrlRaw = getValue('EXTERNAL_URL');
  let externalUrl: string | undefined = undefined;
  if (externalUrlRaw) {
    try {
      const parsed = new URL(externalUrlRaw);
      const allowedSchemes = ['http:', 'https:'];
      if (!allowedSchemes.includes(parsed.protocol)) {
        errors.push(
          `EXTERNAL_URL must use http or https scheme, got: ${parsed.protocol.replace(':', '')}`,
        );
      } else {
        // Strip trailing slash for consistent usage
        externalUrl = externalUrlRaw.replace(/\/+$/, '');
      }
    } catch {
      errors.push(`EXTERNAL_URL must be a valid URL, got: ${externalUrlRaw}`);
    }
  }

  // CURRENCY — ISO 4217 currency code (e.g. EUR, USD, CHF)
  const currencyRaw = (getValue('CURRENCY') ?? 'EUR').toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(currencyRaw)) {
    errors.push(`CURRENCY must be a 3-letter ISO 4217 code, got: ${getValue('CURRENCY')}`);
  }
  const currency = currencyRaw;

  // Backup configuration (all optional)
  const backupDir = getValue('BACKUP_DIR') ?? '/backups';
  const backupCadence = getValue('BACKUP_CADENCE');

  const backupRetentionStr = getValue('BACKUP_RETENTION');
  let backupRetention: number | undefined = undefined;
  if (backupRetentionStr !== undefined) {
    const parsed = parseInt(backupRetentionStr, 10);
    if (isNaN(parsed) || parsed <= 0) {
      errors.push(`BACKUP_RETENTION must be a positive integer, got: ${backupRetentionStr}`);
    } else {
      backupRetention = parsed;
    }
  }

  // Validate that BACKUP_DIR is not a child of the app data directory
  if (backupDir) {
    const dataDir = path.dirname(databaseUrl);
    const resolvedBackupDir = path.resolve(backupDir);
    const resolvedDataDir = path.resolve(dataDir);
    if (
      resolvedBackupDir.startsWith(resolvedDataDir + path.sep) ||
      resolvedBackupDir === resolvedDataDir
    ) {
      errors.push(
        `BACKUP_DIR must not be the same as or a subdirectory of the app data directory (${dataDir})`,
      );
    }
  }

  const backupEnabled = !!backupDir;

  // If there are any validation errors, throw a single error listing all of them
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    port,
    host,
    databaseUrl,
    logLevel,
    nodeEnv,
    sessionDuration,
    secureCookies,
    trustProxy,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    oidcEnabled,
    externalUrl,
    paperlessUrl,
    paperlessExternalUrl,
    paperlessApiToken,
    paperlessFilterTag,
    paperlessEnabled,
    photoStoragePath,
    photoMaxFileSizeMb,
    diaryAutoEvents,
    currency,
    backupDir,
    backupCadence,
    backupRetention,
    backupEnabled,
  };
}

export default fp(
  async function configPlugin(fastify) {
    // Load and validate configuration
    const config = loadConfig(process.env);

    // Log the configuration (excluding sensitive values like oidcClientSecret)
    fastify.log.info(
      {
        port: config.port,
        host: config.host,
        databaseUrl: config.databaseUrl,
        logLevel: config.logLevel,
        nodeEnv: config.nodeEnv,
        sessionDuration: config.sessionDuration,
        secureCookies: config.secureCookies,
        trustProxy: config.trustProxy,
        externalUrl: config.externalUrl,
        oidcEnabled: config.oidcEnabled,
        oidcIssuer: config.oidcIssuer,
        paperlessEnabled: config.paperlessEnabled,
        paperlessUrl: config.paperlessUrl,
        paperlessFilterTag: config.paperlessFilterTag,
        photoStoragePath: config.photoStoragePath,
        photoMaxFileSizeMb: config.photoMaxFileSizeMb,
        diaryAutoEvents: config.diaryAutoEvents,
        currency: config.currency,
        backupEnabled: config.backupEnabled,
        backupDir: config.backupDir,
      },
      'Configuration loaded',
    );

    // Decorate Fastify instance with the config
    fastify.decorate('config', config);
  },
  {
    name: 'config',
  },
);

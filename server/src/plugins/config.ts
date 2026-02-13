import fp from 'fastify-plugin';

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
  oidcRedirectUri?: string;
  oidcEnabled: boolean;
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
  let secureCookies: boolean;
  if (secureCookiesStr === 'true') {
    secureCookies = true;
  } else if (secureCookiesStr === 'false') {
    secureCookies = false;
  } else {
    errors.push(`SECURE_COOKIES must be 'true' or 'false', got: ${getValue('SECURE_COOKIES')}`);
    secureCookies = true; // Default fallback
  }

  // Parse TRUST_PROXY (boolean, default false)
  const trustProxyStr = (getValue('TRUST_PROXY') ?? 'false').toLowerCase();
  let trustProxy: boolean;
  if (trustProxyStr === 'true') {
    trustProxy = true;
  } else if (trustProxyStr === 'false') {
    trustProxy = false;
  } else {
    errors.push(`TRUST_PROXY must be 'true' or 'false', got: ${getValue('TRUST_PROXY')}`);
    trustProxy = false; // Default fallback
  }

  // OIDC configuration (all optional)
  const oidcIssuer = getValue('OIDC_ISSUER');
  const oidcClientId = getValue('OIDC_CLIENT_ID');
  const oidcClientSecret = getValue('OIDC_CLIENT_SECRET');
  const oidcRedirectUri = getValue('OIDC_REDIRECT_URI');

  // OIDC is enabled only when ALL four variables are set
  const oidcEnabled = !!(oidcIssuer && oidcClientId && oidcClientSecret && oidcRedirectUri);

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
    oidcRedirectUri,
    oidcEnabled,
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
        oidcEnabled: config.oidcEnabled,
        oidcIssuer: config.oidcIssuer,
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

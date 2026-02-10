import { randomBytes } from 'node:crypto';
import * as client from 'openid-client';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In-memory state storage with TTL
interface StateData {
  redirect: string;
  createdAt: number;
}

const stateStore = new Map<string, StateData>();

// Cached OIDC configuration
let cachedConfig: client.Configuration | null = null;

/**
 * Discover the OIDC provider configuration and cache it.
 * Uses openid-client's discovery to fetch .well-known/openid-configuration.
 *
 * @param issuerUrl - OIDC issuer URL
 * @param clientId - OAuth client ID
 * @param clientSecret - OAuth client secret
 * @returns openid-client Configuration
 */
export async function discoverOidcConfig(
  issuerUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<client.Configuration> {
  if (cachedConfig) {
    return cachedConfig;
  }

  cachedConfig = await client.discovery(new URL(issuerUrl), clientId, clientSecret);

  return cachedConfig;
}

/**
 * Generate an authorization URL with a random state parameter.
 * Stores the state→redirect mapping server-side (in-memory Map with TTL).
 *
 * @param config - openid-client Configuration
 * @param redirectUri - OAuth callback URL
 * @param appRedirect - The path to redirect to after login (default '/')
 * @returns Authorization URL and state
 */
export function buildAuthorizationUrl(
  config: client.Configuration,
  redirectUri: string,
  appRedirect: string = '/',
): { authorizationUrl: string; state: string } {
  const state = randomBytes(32).toString('hex');

  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
  });

  storeState(state, appRedirect);

  return {
    authorizationUrl: authUrl.href,
    state,
  };
}

/**
 * Validate state and exchange authorization code for tokens.
 * Returns the ID token claims (sub, email, name).
 *
 * @param config - openid-client Configuration
 * @param callbackUrl - The full callback URL (includes code and state)
 * @param expectedState - The expected state parameter
 * @returns ID token claims
 * @throws Error if validation fails or token exchange fails
 */
export async function handleCallback(
  config: client.Configuration,
  callbackUrl: URL,
  expectedState: string,
): Promise<{ sub: string; email: string; name: string }> {
  const tokenResponse = await client.authorizationCodeGrant(config, callbackUrl, { expectedState });

  const claims = tokenResponse.claims();

  if (!claims) {
    throw new Error('No claims found in ID token');
  }

  const sub = claims.sub;
  const email = typeof claims.email === 'string' ? claims.email : '';
  const name =
    typeof claims.name === 'string'
      ? claims.name
      : typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : '';

  return { sub, email, name };
}

/**
 * Store a state parameter with its redirect path.
 * States expire after 10 minutes.
 *
 * @param state - The state parameter
 * @param redirect - The app path to redirect to after login
 */
export function storeState(state: string, redirect: string): void {
  cleanupExpiredStates();
  stateStore.set(state, {
    redirect,
    createdAt: Date.now(),
  });
}

/**
 * Consume a state parameter and return its redirect path.
 * Returns null if the state is expired or missing.
 *
 * @param state - The state parameter
 * @returns Redirect path or null
 */
export function consumeState(state: string): string | null {
  cleanupExpiredStates();

  const data = stateStore.get(state);
  if (!data) {
    return null;
  }

  // Check if expired
  if (Date.now() - data.createdAt > STATE_TTL_MS) {
    stateStore.delete(state);
    return null;
  }

  // Remove the state after consuming it
  stateStore.delete(state);
  return data.redirect;
}

/**
 * Clean up expired states from the store.
 * Called automatically on access to prevent unbounded growth.
 */
function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of stateStore.entries()) {
    if (now - data.createdAt > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}

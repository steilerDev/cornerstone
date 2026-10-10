import type { FastifyInstance, FastifyRequest } from 'fastify';
import { routeUrl, safeAppPath, type OidcLoginErrorCode } from '@cornerstone/shared';
import {
  AppError,
  OidcEmailUnverifiedError,
  OidcMissingEmailError,
  OidcNoMatchingAccountError,
} from '../errors/AppError.js';
import * as oidcService from '../services/oidcService.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { COOKIE_NAME } from '../constants.js';

/**
 * Validates that a redirect path is safe to use.
 * Prevents open redirect vulnerabilities by ensuring the path is relative
 * and doesn't attempt protocol-based or host-based redirects. Backslashes and control
 * characters are rejected too: browsers read `/\evil.example` (or a tab inside `//`) as
 * `//evil.example`, an off-site redirect.
 *
 * @param redirect - The redirect path to validate
 * @returns true if the redirect is safe, false otherwise
 */
function isSafeRedirect(redirect: string): boolean {
  return safeAppPath(redirect) !== null;
}

/**
 * Builds the `/login?error=<code>[&next=<path>]` redirect target; the code set is a compile-time
 * contract with the client. `next` is kept only when it is a safe app path other than Home.
 */
function loginErrorPath(code: OidcLoginErrorCode, next?: string | null): string {
  const safeNext = safeAppPath(next);
  return routeUrl('login', undefined, {
    error: code,
    next: safeNext !== null && safeNext !== routeUrl('home') ? safeNext : undefined,
  });
}

export const OIDC_CALLBACK_PATH = '/api/auth/oidc/callback';

/**
 * Single source of the OIDC redirect_uri for BOTH legs (RFC 6749 §4.1.3):
 * the authorization request and the token exchange must send the identical value.
 *
 * @param externalUrl - Configured EXTERNAL_URL, if any
 * @param requestOrigin - Origin derived from the incoming request (protocol://host)
 * @returns The callback URL (without query string)
 */
export function buildOidcRedirectUri(externalUrl: string | undefined, requestOrigin: string): URL {
  return new URL(`${externalUrl || requestOrigin}${OIDC_CALLBACK_PATH}`);
}

export default async function oidcRoutes(fastify: FastifyInstance) {
  const redirectUriFor = (request: FastifyRequest): URL =>
    buildOidcRedirectUri(fastify.config.externalUrl, `${request.protocol}://${request.host}`);

  /**
   * GET /api/auth/oidc/login
   *
   * Initiates OIDC login flow by redirecting to the authorization endpoint.
   * Accepts an optional redirect query parameter for post-login redirect.
   */
  fastify.get('/login', async (request, reply) => {
    // Check if OIDC is enabled
    if (!fastify.config.oidcEnabled) {
      throw new AppError('OIDC_NOT_CONFIGURED', 404, 'OIDC is not configured');
    }

    // Read optional redirect query parameter and validate it
    const { redirect = routeUrl('home') } = request.query as { redirect?: string };
    const safeRedirect = isSafeRedirect(redirect) ? redirect : routeUrl('home');

    // Discover OIDC configuration
    const config = await oidcService.discoverOidcConfig(
      fastify.config.oidcIssuer!,
      fastify.config.oidcClientId!,
      fastify.config.oidcClientSecret!,
    );

    // Derive redirect URI from EXTERNAL_URL or from the incoming request
    const redirectUri = redirectUriFor(request).href;

    // Build authorization URL
    const { authorizationUrl } = oidcService.buildAuthorizationUrl(
      config,
      redirectUri,
      safeRedirect,
    );

    // Redirect to OIDC provider
    return reply.redirect(authorizationUrl);
  });

  /**
   * GET /api/auth/oidc/callback
   *
   * Handles the OIDC callback after successful authentication.
   * Exchanges the authorization code for tokens and creates a session.
   */
  fastify.get('/callback', async (request, reply) => {
    // Check if OIDC is enabled
    if (!fastify.config.oidcEnabled) {
      return reply.redirect(loginErrorPath('oidc_not_configured'));
    }

    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    // Handle OIDC provider error
    if (query.error) {
      fastify.log.warn({ error: query.error }, 'OIDC provider returned an error');
      const providerErrorRedirect = query.state ? oidcService.consumeState(query.state) : null;
      return reply.redirect(loginErrorPath('oidc_error', providerErrorRedirect));
    }

    // Validate state parameter
    const state = query.state;
    if (!state) {
      fastify.log.warn('Missing state parameter in OIDC callback');
      return reply.redirect(loginErrorPath('invalid_state'));
    }

    const appRedirect = oidcService.consumeState(state);
    if (!appRedirect) {
      fastify.log.warn({ state }, 'Invalid or expired state parameter');
      return reply.redirect(loginErrorPath('invalid_state'));
    }

    let sub: string | undefined;
    try {
      // Discover OIDC configuration
      const config = await oidcService.discoverOidcConfig(
        fastify.config.oidcIssuer!,
        fastify.config.oidcClientId!,
        fastify.config.oidcClientSecret!,
      );

      // The token-exchange URL must use the same redirect_uri as the authorization
      // request (derived via redirectUriFor, honoring EXTERNAL_URL); only the query
      // string (code, state) is taken from the incoming request.
      const callbackUrl = redirectUriFor(request);
      callbackUrl.search = new URL(request.url, 'http://placeholder.invalid').search;

      // Exchange code for tokens and extract claims
      const {
        sub: subFromService,
        email,
        emailVerified,
        name,
        preferredUsername,
      } = await oidcService.handleCallback(config, callbackUrl, state);
      sub = subFromService;

      // Find or link user
      const { user, outcome, previousSubject } = userService.findOrLinkOidcUser(
        fastify.db,
        { sub, email, emailVerified, name, preferredUsername },
        { jitProvisioning: fastify.config.oidcJitProvisioning },
      );

      if (outcome === 'linked') {
        fastify.log.info({ userId: user.id, sub }, 'OIDC subject linked to existing account');
      } else if (outcome === 'provisioned') {
        fastify.log.info({ userId: user.id }, 'OIDC user provisioned');
      } else if (outcome === 'relinked') {
        fastify.log.warn(
          { userId: user.id, previousSub: previousSubject, sub },
          'OIDC subject re-bound for existing account',
        );
      }

      // Check if user is deactivated
      if (user.deactivatedAt) {
        fastify.log.warn({ userId: user.id }, 'Deactivated user attempted OIDC login');
        return reply.redirect(loginErrorPath('account_deactivated', appRedirect));
      }

      // Create session
      const sessionId = sessionService.createSession(
        fastify.db,
        user.id,
        fastify.config.sessionDuration,
      );

      // Set session cookie
      reply.setCookie(COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: fastify.config.secureCookies,
        sameSite: 'lax',
        path: '/',
        maxAge: fastify.config.sessionDuration,
      });

      // Redirect to the original app path
      return reply.redirect(appRedirect);
    } catch (error) {
      if (error instanceof OidcNoMatchingAccountError) {
        fastify.log.warn({ error, sub }, 'OIDC login rejected: no matching account for email');
        return reply.redirect(loginErrorPath('oidc_no_matching_account', appRedirect));
      }
      if (error instanceof OidcMissingEmailError) {
        fastify.log.warn({ sub }, 'OIDC user missing email claim');
        return reply.redirect(loginErrorPath('missing_email', appRedirect));
      }
      if (error instanceof OidcEmailUnverifiedError) {
        fastify.log.warn({ sub }, 'OIDC login rejected: email not verified by IdP');
        return reply.redirect(loginErrorPath('oidc_email_unverified', appRedirect));
      }
      fastify.log.error({ error }, 'OIDC callback error');
      return reply.redirect(loginErrorPath('oidc_error', appRedirect));
    }
  });
}

import type { FastifyInstance } from 'fastify';
import { AppError, ConflictError } from '../errors/AppError.js';
import * as oidcService from '../services/oidcService.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { COOKIE_NAME } from '../constants.js';

/**
 * Validates that a redirect path is safe to use.
 * Prevents open redirect vulnerabilities by ensuring the path is relative
 * and doesn't attempt protocol-based or host-based redirects.
 *
 * @param redirect - The redirect path to validate
 * @returns true if the redirect is safe, false otherwise
 */
function isSafeRedirect(redirect: string): boolean {
  return redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('://');
}

export default async function oidcRoutes(fastify: FastifyInstance) {
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
    const { redirect = '/' } = request.query as { redirect?: string };
    const safeRedirect = isSafeRedirect(redirect) ? redirect : '/';

    // Discover OIDC configuration
    const config = await oidcService.discoverOidcConfig(
      fastify.config.oidcIssuer!,
      fastify.config.oidcClientId!,
      fastify.config.oidcClientSecret!,
    );

    // Derive redirect URI from config or from the incoming request
    const redirectUri =
      fastify.config.oidcRedirectUri ||
      `${request.protocol}://${request.host}/api/auth/oidc/callback`;

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
      return reply.redirect('/login?error=oidc_not_configured');
    }

    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    // Handle OIDC provider error
    if (query.error) {
      fastify.log.warn({ error: query.error }, 'OIDC provider returned an error');
      return reply.redirect('/login?error=oidc_error');
    }

    // Validate state parameter
    const state = query.state;
    if (!state) {
      fastify.log.warn('Missing state parameter in OIDC callback');
      return reply.redirect('/login?error=invalid_state');
    }

    const appRedirect = oidcService.consumeState(state);
    if (!appRedirect) {
      fastify.log.warn({ state }, 'Invalid or expired state parameter');
      return reply.redirect('/login?error=invalid_state');
    }

    try {
      // Discover OIDC configuration
      const config = await oidcService.discoverOidcConfig(
        fastify.config.oidcIssuer!,
        fastify.config.oidcClientId!,
        fastify.config.oidcClientSecret!,
      );

      // Build the callback URL from the request
      // The openid-client library expects the full callback URL including query params
      // Fastify's request.protocol respects trustProxy + x-forwarded-proto
      const callbackUrl = new URL(request.url, `${request.protocol}://${request.host}`);

      // Exchange code for tokens and extract claims
      const { sub, email, name } = await oidcService.handleCallback(config, callbackUrl, state);

      // Ensure email is present
      if (!email) {
        fastify.log.warn({ sub }, 'OIDC user missing email claim');
        return reply.redirect('/login?error=missing_email');
      }

      // Find or create user
      const user = userService.findOrCreateOidcUser(
        fastify.db,
        sub,
        email,
        name || email.split('@')[0],
      );

      // Check if user is deactivated
      if (user.deactivatedAt) {
        fastify.log.warn({ userId: user.id }, 'Deactivated user attempted OIDC login');
        return reply.redirect('/login?error=account_deactivated');
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
        sameSite: 'strict',
        path: '/',
        maxAge: fastify.config.sessionDuration,
      });

      // Redirect to the original app path
      return reply.redirect(appRedirect);
    } catch (error) {
      // Email conflict: OIDC user's email matches a different auth provider's user
      if (error instanceof ConflictError) {
        fastify.log.warn({ error }, 'OIDC email conflict');
        return reply.redirect('/login?error=email_conflict');
      }
      fastify.log.error({ error }, 'OIDC callback error');
      return reply.redirect('/login?error=oidc_error');
    }
  });
}

import fp from 'fastify-plugin';
import type { preHandlerHookHandler } from 'fastify';
import type { UserRole } from '@cornerstone/shared';
import type { users } from '../db/schema.js';
import * as sessionService from '../services/sessionService.js';
import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';
import { COOKIE_NAME } from '../constants.js';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Public routes that don't require authentication
const PUBLIC_ROUTES = new Set([
  '/api/auth/setup',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/oidc/login',
  '/api/auth/oidc/callback',
  '/api/health',
  '/api/health/ready',
]);

// Type augmentation: makes request.user available throughout the app
declare module 'fastify' {
  interface FastifyRequest {
    user: typeof users.$inferSelect | null;
  }
}

/**
 * Role-based access control decorator for Fastify routes.
 * Returns a preHandler that checks if the authenticated user has one of the required roles.
 *
 * @param roles - One or more role names to allow (e.g., 'admin', 'member')
 * @returns Fastify preHandler that enforces role requirements
 * @throws UnauthorizedError if user is not authenticated
 * @throws ForbiddenError if user doesn't have any of the required roles
 *
 * @example
 * fastify.get('/api/admin/users', { preHandler: requireRole('admin') }, async (request, reply) => {
 *   // Only admin users can access this route
 * });
 */
export function requireRole(...roles: UserRole[]): preHandlerHookHandler {
  return async function roleCheck(request, _reply) {
    // At this point, the preValidation hook has already run.
    // If the user is on a protected route, request.user is set.
    // If request.user is null, the user isn't authenticated.
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}

export default fp(
  async function authPlugin(fastify) {
    // Decorate request with user property
    fastify.decorateRequest('user', null);

    // Start periodic cleanup of expired sessions
    const cleanupTimer = setInterval(() => {
      try {
        const deletedCount = sessionService.cleanupExpiredSessions(fastify.db);
        if (deletedCount > 0) {
          fastify.log.info({ deletedCount }, 'Cleaned up expired sessions');
        }
      } catch (err) {
        fastify.log.error({ err }, 'Failed to clean up expired sessions');
      }
    }, CLEANUP_INTERVAL_MS);

    // Clean up timer on shutdown
    fastify.addHook('onClose', async () => {
      clearInterval(cleanupTimer);
    });

    // Authentication preValidation hook
    // Note: This runs after route matching. For routes that don't exist, Fastify routes
    // to the notFoundHandler which we should let through (to return 404, not 401).
    fastify.addHook('preValidation', async (request, _reply) => {
      // Only protect /api/* routes (allow static file serving without auth)
      if (!request.url.startsWith('/api/')) {
        return;
      }

      // If we're in the not-found handler or the static file handler, let it through.
      // The not-found handler and static handlers don't have a specific route URL.
      // We check if routeOptions.url is missing or if it's a wildcard (like '/*').
      const routeUrl = request.routeOptions?.url;
      if (!routeUrl || routeUrl === '/*') {
        return;
      }

      // Try to resolve user from session cookie for ALL /api/* routes
      const sessionId = request.cookies[COOKIE_NAME];
      if (sessionId) {
        const user = sessionService.validateSession(fastify.db, sessionId);
        if (user) {
          request.user = user;
        }
      }

      // For protected routes, enforce authentication.
      // Use routeUrl (the route pattern) instead of request.url to avoid
      // query string mismatches (e.g., /api/auth/oidc/callback?code=abc).
      const isPublicRoute = PUBLIC_ROUTES.has(routeUrl);
      if (!isPublicRoute && !request.user) {
        throw new UnauthorizedError('Authentication required');
      }
    });
  },
  {
    name: 'auth',
    dependencies: ['config', 'db'],
  },
);

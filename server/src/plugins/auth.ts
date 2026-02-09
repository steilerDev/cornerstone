import fp from 'fastify-plugin';
import type { users } from '../db/schema.js';
import * as sessionService from '../services/sessionService.js';
import { UnauthorizedError } from '../errors/AppError.js';

const COOKIE_NAME = 'cornerstone_session';
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Public routes that don't require authentication
const PUBLIC_ROUTES = new Set([
  '/api/auth/setup',
  '/api/auth/login',
  '/api/auth/me',
  '/api/health',
]);

// Type augmentation: makes request.user available throughout the app
declare module 'fastify' {
  interface FastifyRequest {
    user: typeof users.$inferSelect | null;
  }
}

export default fp(
  async function authPlugin(fastify) {
    // Decorate request with user property
    fastify.decorateRequest('user', null);

    // Start periodic cleanup of expired sessions
    const cleanupTimer = setInterval(() => {
      const deletedCount = sessionService.cleanupExpiredSessions(fastify.db);
      if (deletedCount > 0) {
        fastify.log.info({ deletedCount }, 'Cleaned up expired sessions');
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
      // Skip authentication for public routes
      if (PUBLIC_ROUTES.has(request.url)) {
        return;
      }

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

      // Extract session token from cookies
      const sessionId = request.cookies[COOKIE_NAME];

      if (!sessionId) {
        throw new UnauthorizedError('Authentication required');
      }

      // Validate session
      const user = sessionService.validateSession(fastify.db, sessionId);

      if (!user) {
        throw new UnauthorizedError('Invalid or expired session');
      }

      // Attach user to request
      request.user = user;
    });
  },
  {
    name: 'auth',
    dependencies: ['config', 'db'],
  },
);

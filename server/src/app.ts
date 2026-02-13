import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from './plugins/config.js';
import dbPlugin from './plugins/db.js';
import errorHandlerPlugin from './plugins/errorHandler.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import oidcRoutes from './routes/oidc.js';
import userRoutes from './routes/users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
  });

  // Configuration (must be first)
  await app.register(configPlugin);

  // Error handler (after config, before routes)
  await app.register(errorHandlerPlugin);

  // Compression (gzip/deflate/brotli)
  await app.register(fastifyCompress);

  // Cookie parsing (required for session management)
  await app.register(fastifyCookie);

  // Database connection & migrations
  await app.register(dbPlugin);

  // Authentication & session management (after db, before routes)
  await app.register(authPlugin);

  // Auth routes
  await app.register(authRoutes, { prefix: '/api/auth' });

  // OIDC routes
  await app.register(oidcRoutes, { prefix: '/api/auth/oidc' });

  // User profile routes
  await app.register(userRoutes, { prefix: '/api/users' });

  // Health check endpoint
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Serve the client build in production
  const clientDistPath = join(__dirname, '../../client/dist');
  if (existsSync(join(clientDistPath, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
      maxAge: 31536000 * 1000, // 1 year in milliseconds (for hashed assets)
      immutable: true,
      setHeaders: (res, filePath) => {
        // Override cache headers for HTML files (always revalidate)
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });

    // SPA fallback: serve index.html for any non-API route
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        const response: ApiErrorResponse = {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${request.method} ${request.url} not found`,
          },
        };
        return reply.status(404).send(response);
      }
      return reply.sendFile('index.html');
    });
  } else {
    // Development: no static files, just API
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        const response: ApiErrorResponse = {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${request.method} ${request.url} not found`,
          },
        };
        return reply.status(404).send(response);
      }
      const response: ApiErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'Client assets not found. Run "npm run build -w client" first.',
        },
      };
      return reply.status(404).send(response);
    });
  }

  return app;
}

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import configPlugin from './plugins/config.js';
import dbPlugin from './plugins/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Configuration (must be first)
  await app.register(configPlugin);

  // Database connection & migrations
  await app.register(dbPlugin);

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
    });

    // SPA fallback: serve index.html for any non-API route
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${request.method} ${request.url} not found`,
          },
        });
      }
      return reply.sendFile('index.html');
    });
  } else {
    // Development: no static files, just API
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${request.method} ${request.url} not found`,
          },
        });
      }
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Client assets not found. Run "npm run build -w client" first.',
        },
      });
    });
  }

  return app;
}

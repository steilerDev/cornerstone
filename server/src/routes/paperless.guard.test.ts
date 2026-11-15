/**
 * Defence-in-depth tests for the `!request.user` guards in the Paperless-ngx proxy routes.
 *
 * In the app the global auth plugin rejects anonymous requests before the handlers run, so the
 * guards cannot be reached through buildApp(). The routes are registered here on a bare Fastify
 * instance without the auth hook, so each handler sees `request.user === undefined`.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import paperlessRoutes from './paperless.js';

const GET_URLS = [
  '/api/paperless/status',
  '/api/paperless/documents',
  '/api/paperless/documents?excludeLinked=true',
  '/api/paperless/documents/1',
  '/api/paperless/documents/1/thumb',
  '/api/paperless/documents/1/preview',
  '/api/paperless/tags',
  '/api/paperless/correspondents',
  '/api/paperless/document-types',
];

describe('paperless routes without an authenticated user', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(paperlessRoutes, { prefix: '/api/paperless' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  for (const url of GET_URLS) {
    it(`GET ${url} answers 401`, async () => {
      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(401);
    });
  }

  it('POST /documents answers 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/paperless/documents' });

    expect(res.statusCode).toBe(401);
  });
});

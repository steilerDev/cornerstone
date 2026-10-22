/**
 * Defence-in-depth tests for the `!request.user` guards in the document-link routes.
 *
 * In the app the global auth plugin rejects anonymous requests before the handlers run, so the
 * guards cannot be reached through buildApp(). The routes are registered here on a bare Fastify
 * instance without the auth hook, so each handler sees `request.user === undefined`.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import documentLinksRoutes from './documentLinks.js';

interface GuardCase {
  name: string;
  method: 'POST' | 'GET' | 'PATCH' | 'DELETE';
  url: string;
  payload?: object;
}

const CASES: GuardCase[] = [
  {
    name: 'POST /',
    method: 'POST',
    url: '/api/document-links',
    payload: { entityType: 'work_item', entityId: 'wi-1', paperlessDocumentId: 1 },
  },
  {
    name: 'GET /',
    method: 'GET',
    url: '/api/document-links?entityType=work_item&entityId=wi-1',
  },
  { name: 'GET /linked-ids', method: 'GET', url: '/api/document-links/linked-ids' },
  {
    name: 'PATCH /:id',
    method: 'PATCH',
    url: '/api/document-links/link-1',
    payload: { attachmentType: null },
  },
  { name: 'DELETE /:id', method: 'DELETE', url: '/api/document-links/link-1' },
];

describe('document link routes without an authenticated user', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(documentLinksRoutes, { prefix: '/api/document-links' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  for (const c of CASES) {
    it(`${c.name} answers 401`, async () => {
      const res = await app.inject({ method: c.method, url: c.url, payload: c.payload });

      expect(res.statusCode).toBe(401);
    });
  }
});

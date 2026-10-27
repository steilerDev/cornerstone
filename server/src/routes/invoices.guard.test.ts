/**
 * Defence-in-depth guards of `routes/invoices.ts`: without the auth plugin a request that carries
 * no user is answered 401 by each handler's own `request.user` guard. The handlers throw before
 * touching the database, so no db plugin is registered.
 *
 * Mutation caught: deleting any `if (!request.user)` guard (the handler would then read
 * `fastify.db`, which is not decorated here, and answer 500).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from '../plugins/config.js';
import errorHandlerPlugin from '../plugins/errorHandler.js';
import invoiceRoutes from './invoices.js';

describe('invoices.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    // The auth plugin normally decorates `user`; without it the guard sees no user.
    app.decorateRequest('user', null);
    await app.register(invoiceRoutes, { prefix: '/api/vendors/:vendorId/invoices' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET /', 'GET', '/api/vendors/v-1/invoices', undefined],
    ['POST /', 'POST', '/api/vendors/v-1/invoices', { amount: 10, date: '2026-01-01' }],
    ['PATCH /:invoiceId', 'PATCH', '/api/vendors/v-1/invoices/i-1', { amount: 20 }],
    ['DELETE /:invoiceId', 'DELETE', '/api/vendors/v-1/invoices/i-1', undefined],
  ] as const)(
    '%s answers 401 UNAUTHORIZED from the handler guard',
    async (_name, method, url, payload) => {
      const res = await app.inject({ method, url, payload });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

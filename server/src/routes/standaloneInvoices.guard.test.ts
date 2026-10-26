/**
 * Defence-in-depth guards of `routes/standaloneInvoices.ts`: without the auth plugin a request
 * that carries no user is answered 401 by each handler's own `request.user` guard. The handlers
 * throw before touching the database, so no db plugin is registered.
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
import standaloneInvoiceRoutes from './standaloneInvoices.js';

describe('standaloneInvoices.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(standaloneInvoiceRoutes, { prefix: '/api/invoices' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/invoices'],
    ['GET', '/api/invoices/inv-1'],
    ['POST', '/api/invoices/inv-1/convert-quotation'],
  ] as const)('%s %s answers 401 UNAUTHORIZED from the handler guard', async (method, url) => {
    const res = await app.inject({
      method,
      url,
      ...(method === 'POST'
        ? {
            payload: {
              amount: 1,
              date: '2026-01-01',
              status: 'pending',
              conversionNote: 'Converted',
            },
          }
        : {}),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
  });
});

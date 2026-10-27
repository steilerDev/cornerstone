/**
 * Defence-in-depth guards of `routes/sourceReports.ts` (#2243): without the auth plugin a request
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
import sourceReportRoutes from './sourceReports.js';

describe('sourceReports.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    // The auth plugin normally decorates `user`; without it the guard sees no user.
    app.decorateRequest('user', null);
    await app.register(sourceReportRoutes, { prefix: '/api/source-reports' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/source-reports?type=claim&sourceId=src-1', undefined],
    [
      'POST',
      '/api/source-reports/mark-claimed',
      { sourceId: 'src-1', invoiceIds: ['inv-1'], depositIds: [] },
    ],
    ['POST', '/api/source-reports/batches/batch-1/revert', undefined],
    [
      'POST',
      '/api/source-reports/generate-content',
      { type: 'claim', sourceId: 'src-1', language: 'en', includedInvoiceIds: ['inv-1'] },
    ],
  ] as const)(
    '%s %s answers 401 UNAUTHORIZED from the handler guard',
    async (method, url, payload) => {
      const res = await app.inject({ method, url, payload });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

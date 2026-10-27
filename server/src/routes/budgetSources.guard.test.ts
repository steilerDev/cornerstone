/**
 * Defence-in-depth guards of `routes/budgetSources.ts` (#2242): without the auth plugin a
 * request that carries no user is answered 401 by each handler's own `request.user` guard. The
 * handlers throw before touching the database, so no db plugin is registered.
 *
 * Mutation caught: deleting any one `if (!request.user)` guard (the handler would then read the
 * undecorated `fastify.db` and answer 500).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from '../plugins/config.js';
import errorHandlerPlugin from '../plugins/errorHandler.js';
import budgetSourceRoutes from './budgetSources.js';

describe('budgetSources.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(budgetSourceRoutes, { prefix: '/api/budget-sources' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/budget-sources', undefined],
    ['POST', '/api/budget-sources', { name: 'Loan', sourceType: 'bank_loan', totalAmount: 1000 }],
    ['GET', '/api/budget-sources/bs-1', undefined],
    ['PATCH', '/api/budget-sources/bs-1', { name: 'Renamed' }],
    ['DELETE', '/api/budget-sources/bs-1', undefined],
    ['GET', '/api/budget-sources/bs-1/budget-lines', undefined],
    [
      'PATCH',
      '/api/budget-sources/bs-1/budget-lines/move',
      { workItemBudgetIds: [], householdItemBudgetIds: [], targetSourceId: 'bs-2' },
    ],
  ] as const)(
    '%s %s answers 401 UNAUTHORIZED from the handler guard',
    async (method, url, body) => {
      const res = await app.inject({ method, url, payload: body });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

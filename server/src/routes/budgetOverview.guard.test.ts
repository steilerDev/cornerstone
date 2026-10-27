/**
 * Defence-in-depth guards of `routes/budgetOverview.ts` (#2237, #2242 financing): without the auth plugin a
 * request that carries no user is answered 401 by each handler's own `request.user` guard.
 * The handlers throw before touching the database, so no db plugin is registered.
 *
 * Mutation caught: deleting either `if (!request.user)` guard (the handler would then read
 * `fastify.db`, which is not decorated here, and answer 500).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from '../plugins/config.js';
import errorHandlerPlugin from '../plugins/errorHandler.js';
import budgetOverviewRoutes from './budgetOverview.js';

describe('budgetOverview.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    // The auth plugin normally decorates `user`; without it the guard sees no user.
    app.decorateRequest('user', null);
    await app.register(budgetOverviewRoutes, { prefix: '/api/budget' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    '/api/budget/overview',
    '/api/budget/financing',
    '/api/budget/breakdown',
    '/api/budget/breakdown?deselectedSources=bs-a',
  ])('GET %s answers 401 UNAUTHORIZED from the handler guard', async (url) => {
    const res = await app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(401);
    expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
  });
});

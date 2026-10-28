/**
 * Defence-in-depth guard of `routes/schedule.ts`: without the auth plugin a request that carries
 * no user is answered 401 by the handler's own `request.user` guard. The handler throws before
 * touching the database, so no db plugin is registered.
 *
 * Mutation caught: deleting the `if (!request.user)` guard (the handler would then read the
 * undecorated `fastify.db` and answer 500).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import configPlugin from '../plugins/config.js';
import errorHandlerPlugin from '../plugins/errorHandler.js';
import scheduleRoutes from './schedule.js';

describe('schedule.ts handler without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(scheduleRoutes, { prefix: '/api/schedule' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    [{ mode: 'full' }],
    [{ mode: 'cascade', anchorWorkItemId: 'wi-1' }],
    [{ mode: 'full', overrides: [{ workItemId: 'wi-1', durationDays: 2 }] }],
  ])('POST /api/schedule %j answers 401 UNAUTHORIZED from the handler guard', async (body) => {
    const res = await app.inject({ method: 'POST', url: '/api/schedule', payload: body });

    expect(res.statusCode).toBe(401);
    expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
  });
});

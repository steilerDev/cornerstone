/**
 * Defence-in-depth guards of `routes/workItems.ts`: without the auth plugin a request that
 * carries no user is answered 401 by each handler's own `request.user` guard. The handlers throw
 * before touching the database, so no db plugin is registered.
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
import workItemRoutes from './workItems.js';

describe('workItems.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(workItemRoutes, { prefix: '/api/work-items' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['POST', '/api/work-items', { title: 'Pour the slab' }],
    ['GET', '/api/work-items', undefined],
    ['GET', '/api/work-items/wi-1', undefined],
    ['PATCH', '/api/work-items/wi-1', { title: 'Renamed' }],
    ['DELETE', '/api/work-items/wi-1', undefined],
    ['GET', '/api/work-items/wi-1/dependent-household-items', undefined],
  ] as const)(
    '%s %s answers 401 UNAUTHORIZED from the handler guard',
    async (method, url, body) => {
      const res = await app.inject({ method, url, payload: body });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

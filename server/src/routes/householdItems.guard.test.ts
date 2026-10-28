/**
 * Defence-in-depth guards of `routes/householdItems.ts`: without the auth plugin a request that carries
 * no user is answered 401 by each handler's own `request.user` guard. The handlers throw before
 * touching the database, so no db plugin is registered.
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
import householdItemRoutes from './householdItems.js';

describe('householdItems.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(householdItemRoutes, { prefix: '/api/household-items' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['POST', '/api/household-items', { name: 'Sample sofa' }],
    ['GET', '/api/household-items', undefined],
    ['GET', '/api/household-items/hi-1', undefined],
    ['PATCH', '/api/household-items/hi-1', { name: 'Renamed' }],
    ['DELETE', '/api/household-items/hi-1', undefined],
    ['GET', '/api/household-items/hi-1/dependencies', undefined],
    [
      'POST',
      '/api/household-items/hi-1/dependencies',
      { predecessorType: 'work_item', predecessorId: 'wi-1' },
    ],
    ['DELETE', '/api/household-items/hi-1/dependencies/work_item/wi-1', undefined],
  ] as const)(
    '%s %s answers 401 UNAUTHORIZED from the handler guard',
    async (method, url, body) => {
      const res = await app.inject({ method, url, payload: body });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

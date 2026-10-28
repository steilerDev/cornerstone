/**
 * Defence-in-depth guards of `routes/milestones.ts`: without the auth plugin a request that carries
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
import milestoneRoutes from './milestones.js';

describe('milestones.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(milestoneRoutes, { prefix: '/api/milestones' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/milestones', undefined],
    ['POST', '/api/milestones', { title: 'Roof closed', targetDate: '2026-06-01' }],
    ['GET', '/api/milestones/1', undefined],
    ['PATCH', '/api/milestones/1', { title: 'Renamed' }],
    ['DELETE', '/api/milestones/1', undefined],
    ['POST', '/api/milestones/1/work-items', { workItemId: 'wi-1' }],
    ['DELETE', '/api/milestones/1/work-items/wi-1', undefined],
    ['POST', '/api/milestones/1/dependents/wi-1', undefined],
    ['DELETE', '/api/milestones/1/dependents/wi-1', undefined],
    ['GET', '/api/milestones/1/dependent-household-items', undefined],
  ] as const)(
    '%s %s answers 401 UNAUTHORIZED from the handler guard',
    async (method, url, body) => {
      const res = await app.inject({ method, url, payload: body });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

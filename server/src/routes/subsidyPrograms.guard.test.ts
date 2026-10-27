/**
 * Defence-in-depth guards of `routes/subsidyPrograms.ts` (#2242): without the auth plugin a
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
import subsidyProgramRoutes from './subsidyPrograms.js';

describe('subsidyPrograms.ts handlers without an authenticated user', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    app.decorateRequest('user', null);
    await app.register(subsidyProgramRoutes, { prefix: '/api/subsidy-programs' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/subsidy-programs', undefined],
    [
      'POST',
      '/api/subsidy-programs',
      { name: 'Grant', reductionType: 'percentage', reductionValue: 10 },
    ],
    ['GET', '/api/subsidy-programs/sp-1', undefined],
    ['GET', '/api/subsidy-programs/sp-1/items', undefined],
    ['POST', '/api/subsidy-programs/sp-1/items', { items: [{ type: 'work_item', id: 'wi-1' }] }],
    ['PATCH', '/api/subsidy-programs/sp-1', { name: 'Renamed' }],
    ['DELETE', '/api/subsidy-programs/sp-1', undefined],
  ] as const)(
    '%s %s answers 401 UNAUTHORIZED from the handler guard',
    async (method, url, body) => {
      const res = await app.inject({ method, url, payload: body });

      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
    },
  );
});

/**
 * Defence-in-depth guard of POST /api/budget-lines/batch (Story #2235): without the auth plugin
 * a request that carries no user is answered 401 by the handler itself.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import configPlugin from '../plugins/config.js';
import errorHandlerPlugin from '../plugins/errorHandler.js';
import budgetLineBatchRoutes from './budgetLineBatch.js';
import type { ApiErrorResponse } from '@cornerstone/shared';

describe('POST /api/budget-lines/batch without an authenticated user', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(configPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(budgetLineBatchRoutes, { prefix: '/api/budget-lines' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 UNAUTHORIZED from the handler guard', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/budget-lines/batch',
      payload: {
        lines: [
          {
            kind: 'create',
            targetType: 'work_item',
            targetId: 'wi-synthetic',
            plannedAmount: 10,
            budgetSourceId: 'bs-synthetic',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
  });
});

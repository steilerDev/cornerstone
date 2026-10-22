/**
 * Home routes (#2230, EPIC-21 contract 24). Read-only aggregates for the Home page.
 *
 * GET /api/home/week   dated items from today to today + 20
 * GET /api/home/pulse  left to spend, still to pay, progress
 * GET /api/home/setup  set-up steps (admin-only steps omitted for members)
 *
 * Auth required: Yes (member or admin).
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getHomePulse, getHomeSetup, getHomeWeek } from '../services/homeService.js';
import { ensureDailyReschedule } from '../services/schedulingEngine.js';

export default async function homeRoutes(fastify: FastifyInstance) {
  fastify.get('/week', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    // The daily reschedule gives tasks and purchases that day's dates
    ensureDailyReschedule(fastify.db);
    return reply.status(200).send(getHomeWeek(fastify.db));
  });

  fastify.get('/pulse', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    return reply.status(200).send(getHomePulse(fastify.db, fastify.config.vatRate));
  });

  fastify.get('/setup', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    const result = await getHomeSetup(fastify.db, {
      isAdmin: request.user.role === 'admin',
      config: fastify.config,
      logger: request.log,
    });
    return reply.status(200).send(result);
  });
}

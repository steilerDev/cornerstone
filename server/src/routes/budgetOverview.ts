import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getBudgetOverview } from '../services/budgetOverviewService.js';

export default async function budgetOverviewRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/budget/overview
   * Returns aggregated budget data for the project dashboard.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/overview', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const overview = getBudgetOverview(fastify.db);
    return reply.status(200).send({ overview });
  });
}

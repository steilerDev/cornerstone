import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getBudgetOverview } from '../services/budgetOverviewService.js';
import { getBudgetBreakdown } from '../services/budgetBreakdownService.js';

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

  /**
   * GET /api/budget/breakdown
   * Returns item-level and budget-line-level cost detail for expandable breakdown table.
   * Includes both work items and household items with per-entity subsidy payback.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/breakdown', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const breakdown = getBudgetBreakdown(fastify.db);
    return reply.status(200).send({ breakdown });
  });
}

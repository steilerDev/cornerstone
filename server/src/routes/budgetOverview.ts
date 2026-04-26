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
   * Supports server-side source filtering via ?deselectedSources=id1,id2,unassigned
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/breakdown', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    // Parse ?deselectedSources=<id1>,<id2>,unassigned
    // Empty/missing param → empty set (unchanged behavior)
    const rawParam = (request.query as Record<string, string>)['deselectedSources'] ?? '';
    const deselectedSources = new Set(
      rawParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const breakdown = getBudgetBreakdown(fastify.db, deselectedSources);
    return reply.status(200).send({ breakdown });
  });
}

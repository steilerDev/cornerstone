import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getBudgetOverview } from '../services/budgetOverviewService.js';
import { computeProjectMoney, getBudgetBreakdown, getFinancing } from '../services/moneyService.js';

export default async function budgetOverviewRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/budget/overview
   * Returns the grant summary (`overview`, { subsidySummary }) plus the money service's
   * figures (`money`, ADR-039).
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/overview', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    // One money computation per request: the grant summary and `money` share it.
    const project = computeProjectMoney(fastify.db, fastify.config.vatRate);
    const overview = getBudgetOverview(fastify.db, fastify.config.vatRate, project);
    return reply.status(200).send({ overview, money: project.summary });
  });

  /**
   * GET /api/budget/financing
   * Returns every funding source (money service figures plus interest rate) and every grant
   * (all statuses; rejected grants pay nothing). Money › Financing page (#2242).
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/financing', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    return reply.status(200).send(getFinancing(fastify.db, fastify.config.vatRate));
  });

  /**
   * GET /api/budget/breakdown
   * Returns the Money › Overview breakdown (contract 25): lines, items and the area, type,
   * category and source views, each with Paid / Still to pay attributed per line.
   * Supports server-side source filtering via ?deselectedSources=id1,id2,unassigned
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Querystring: { deselectedSources?: string } }>(
    '/breakdown',
    {
      schema: {
        querystring: { type: 'object', properties: { deselectedSources: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      // Parse ?deselectedSources=<id1>,<id2>,unassigned
      // Empty/missing param → empty set (unchanged behavior)
      const rawParam = request.query.deselectedSources ?? '';
      const deselectedSources = new Set(
        rawParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );

      const breakdown = getBudgetBreakdown(fastify.db, fastify.config.vatRate, deselectedSources);
      return reply.status(200).send({ breakdown });
    },
  );
}

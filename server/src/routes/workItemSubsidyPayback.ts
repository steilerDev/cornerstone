import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as subsidyPaybackService from '../services/subsidyPaybackService.js';

const workItemParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

export default async function workItemSubsidyPaybackRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/work-items/:workItemId/subsidy-payback
   * Calculate expected subsidy payback for a work item.
   * Returns the total payback amount and a per-subsidy breakdown.
   * Only non-rejected subsidies linked to this work item are included.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: workItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = subsidyPaybackService.getWorkItemSubsidyPayback(
        fastify.db,
        request.params.workItemId,
      );
      return reply.status(200).send(result);
    },
  );
}

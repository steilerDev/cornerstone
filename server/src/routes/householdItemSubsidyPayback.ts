import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemSubsidyPaybackService from '../services/householdItemSubsidyPaybackService.js';

const householdItemParamsSchema = {
  params: {
    type: 'object',
    required: ['householdItemId'],
    properties: {
      householdItemId: { type: 'string' },
    },
  },
};

export default async function householdItemSubsidyPaybackRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/household-items/:householdItemId/subsidy-payback
   * Calculate expected subsidy payback for a household item.
   * Returns the total payback amount and a per-subsidy breakdown.
   * Only non-rejected subsidies linked to this household item are included.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { householdItemId: string } }>(
    '/',
    { schema: householdItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = householdItemSubsidyPaybackService.getHouseholdItemSubsidyPayback(
        fastify.db,
        request.params.householdItemId,
      );
      return reply.status(200).send(result);
    },
  );
}

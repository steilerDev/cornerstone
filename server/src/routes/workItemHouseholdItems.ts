import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemWorkItemService from '../services/householdItemWorkItemService.js';

// JSON schema for path params with workItemId only
const workItemParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

export default async function workItemHouseholdItemRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/work-items/:workItemId/household-items
   * List all household items linked to a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: workItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const householdItems = householdItemWorkItemService.listLinkedHouseholdItemsForWorkItem(
        fastify.db,
        request.params.workItemId,
      );
      return reply.status(200).send({ householdItems });
    },
  );
}

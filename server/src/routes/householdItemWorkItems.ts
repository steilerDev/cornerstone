import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemWorkItemService from '../services/householdItemWorkItemService.js';

// JSON schema for path params with householdItemId only
const householdItemParamsSchema = {
  params: {
    type: 'object',
    required: ['householdItemId'],
    properties: {
      householdItemId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/household-items/:householdItemId/work-items
const linkWorkItemSchema = {
  body: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['householdItemId'],
    properties: {
      householdItemId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/household-items/:householdItemId/work-items/:workItemId
const workItemLinkParamsSchema = {
  params: {
    type: 'object',
    required: ['householdItemId', 'workItemId'],
    properties: {
      householdItemId: { type: 'string' },
      workItemId: { type: 'string' },
    },
  },
};

export default async function householdItemWorkItemRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/household-items/:householdItemId/work-items
   * List all work items linked to a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { householdItemId: string } }>(
    '/',
    { schema: householdItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const workItems = householdItemWorkItemService.listLinkedWorkItems(
        fastify.db,
        request.params.householdItemId,
      );
      return reply.status(200).send({ workItems });
    },
  );

  /**
   * POST /api/household-items/:householdItemId/work-items
   * Link a work item to a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { householdItemId: string }; Body: { workItemId: string } }>(
    '/',
    { schema: linkWorkItemSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const workItem = householdItemWorkItemService.linkWorkItemToHouseholdItem(
        fastify.db,
        request.params.householdItemId,
        request.body.workItemId,
      );
      return reply.status(201).send({ workItem });
    },
  );

  /**
   * DELETE /api/household-items/:householdItemId/work-items/:workItemId
   * Unlink a work item from a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { householdItemId: string; workItemId: string } }>(
    '/:workItemId',
    { schema: workItemLinkParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      householdItemWorkItemService.unlinkWorkItemFromHouseholdItem(
        fastify.db,
        request.params.householdItemId,
        request.params.workItemId,
      );
      return reply.status(204).send();
    },
  );
}

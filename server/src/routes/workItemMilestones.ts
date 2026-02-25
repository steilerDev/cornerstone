/**
 * Work item milestone routes — manage bidirectional milestone relationships for work items.
 *
 * Routes registered under /api/work-items/:workItemId/milestones
 *
 * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as workItemMilestoneService from '../services/workItemMilestoneService.js';

// JSON schema for path params: workItemId (string) + milestoneId (integer)
const workItemMilestoneParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'milestoneId'],
    properties: {
      workItemId: { type: 'string' },
      milestoneId: { type: 'integer' },
    },
  },
};

// JSON schema for path param: workItemId only (GET milestones)
const workItemIdParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

export default async function workItemMilestoneRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/work-items/:workItemId/milestones
   * Returns required and linked milestones for a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: workItemIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const result = workItemMilestoneService.getWorkItemMilestones(
        fastify.db,
        request.params.workItemId,
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/work-items/:workItemId/milestones/required/:milestoneId
   * Adds a required milestone dependency (milestone must complete before work item starts).
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string; milestoneId: number } }>(
    '/required/:milestoneId',
    { schema: workItemMilestoneParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const result = workItemMilestoneService.addRequiredMilestone(
        fastify.db,
        request.params.workItemId,
        request.params.milestoneId,
      );
      return reply.status(201).send(result);
    },
  );

  /**
   * DELETE /api/work-items/:workItemId/milestones/required/:milestoneId
   * Removes a required milestone dependency.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; milestoneId: number } }>(
    '/required/:milestoneId',
    { schema: workItemMilestoneParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      workItemMilestoneService.removeRequiredMilestone(
        fastify.db,
        request.params.workItemId,
        request.params.milestoneId,
      );
      return reply.status(204).send();
    },
  );

  /**
   * POST /api/work-items/:workItemId/milestones/linked/:milestoneId
   * Links a work item to a milestone (work item contributes to milestone completion).
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string; milestoneId: number } }>(
    '/linked/:milestoneId',
    { schema: workItemMilestoneParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      const result = workItemMilestoneService.addLinkedMilestone(
        fastify.db,
        request.params.workItemId,
        request.params.milestoneId,
      );
      return reply.status(201).send(result);
    },
  );

  /**
   * DELETE /api/work-items/:workItemId/milestones/linked/:milestoneId
   * Unlinks a work item from a milestone.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; milestoneId: number } }>(
    '/linked/:milestoneId',
    { schema: workItemMilestoneParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError('Authentication required');
      }
      workItemMilestoneService.removeLinkedMilestone(
        fastify.db,
        request.params.workItemId,
        request.params.milestoneId,
      );
      return reply.status(204).send();
    },
  );
}

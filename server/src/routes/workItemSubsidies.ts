import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as workItemSubsidyService from '../services/workItemSubsidyService.js';

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

// JSON schema for POST /api/work-items/:workItemId/subsidies
const linkSubsidySchema = {
  body: {
    type: 'object',
    required: ['subsidyProgramId'],
    properties: {
      subsidyProgramId: { type: 'string' },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/work-items/:workItemId/subsidies/:subsidyProgramId
const subsidyLinkParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'subsidyProgramId'],
    properties: {
      workItemId: { type: 'string' },
      subsidyProgramId: { type: 'string' },
    },
  },
};

export default async function workItemSubsidyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/work-items/:workItemId/subsidies
   * List all subsidy programs linked to a work item, with reduction details.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: workItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidies = workItemSubsidyService.listWorkItemSubsidies(
        fastify.db,
        request.params.workItemId,
      );
      return reply.status(200).send({ subsidies });
    },
  );

  /**
   * POST /api/work-items/:workItemId/subsidies
   * Link a subsidy program to a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string }; Body: { subsidyProgramId: string } }>(
    '/',
    { schema: linkSubsidySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidy = workItemSubsidyService.linkSubsidyToWorkItem(
        fastify.db,
        request.params.workItemId,
        request.body.subsidyProgramId,
      );
      return reply.status(201).send({ subsidy });
    },
  );

  /**
   * DELETE /api/work-items/:workItemId/subsidies/:subsidyProgramId
   * Unlink a subsidy program from a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; subsidyProgramId: string } }>(
    '/:subsidyProgramId',
    { schema: subsidyLinkParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      workItemSubsidyService.unlinkSubsidyFromWorkItem(
        fastify.db,
        request.params.workItemId,
        request.params.subsidyProgramId,
      );
      return reply.status(204).send();
    },
  );
}

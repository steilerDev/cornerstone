import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as householdItemSubsidyService from '../services/householdItemSubsidyService.js';

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

// JSON schema for POST /api/household-items/:householdItemId/subsidies
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
    required: ['householdItemId'],
    properties: {
      householdItemId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/household-items/:householdItemId/subsidies/:subsidyProgramId
const subsidyLinkParamsSchema = {
  params: {
    type: 'object',
    required: ['householdItemId', 'subsidyProgramId'],
    properties: {
      householdItemId: { type: 'string' },
      subsidyProgramId: { type: 'string' },
    },
  },
};

export default async function householdItemSubsidyRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/household-items/:householdItemId/subsidies
   * List all subsidy programs linked to a household item, with reduction details.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { householdItemId: string } }>(
    '/',
    { schema: householdItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidies = householdItemSubsidyService.listHouseholdItemSubsidies(
        fastify.db,
        request.params.householdItemId,
      );
      return reply.status(200).send({ subsidies });
    },
  );

  /**
   * POST /api/household-items/:householdItemId/subsidies
   * Link a subsidy program to a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { householdItemId: string }; Body: { subsidyProgramId: string } }>(
    '/',
    { schema: linkSubsidySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidy = householdItemSubsidyService.linkSubsidyToHouseholdItem(
        fastify.db,
        request.params.householdItemId,
        request.body.subsidyProgramId,
      );
      return reply.status(201).send({ subsidy });
    },
  );

  /**
   * DELETE /api/household-items/:householdItemId/subsidies/:subsidyProgramId
   * Unlink a subsidy program from a household item.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { householdItemId: string; subsidyProgramId: string } }>(
    '/:subsidyProgramId',
    { schema: subsidyLinkParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(
        fastify.db,
        request.params.householdItemId,
        request.params.subsidyProgramId,
      );
      return reply.status(204).send();
    },
  );
}

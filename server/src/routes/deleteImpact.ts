import type { FastifyInstance } from 'fastify';
import { DELETE_IMPACT_ENTITY_TYPES } from '@cornerstone/shared';
import type { DeleteImpactEntityType } from '@cornerstone/shared';
import { UnauthorizedError } from '../errors/AppError.js';
import { getDeleteImpact } from '../services/deleteImpactService.js';

// JSON schema for GET /api/delete-impact/:entityType/:id
const deleteImpactSchema = {
  params: {
    type: 'object',
    required: ['entityType', 'id'],
    properties: {
      entityType: { type: 'string', enum: [...DELETE_IMPACT_ENTITY_TYPES] },
      id: { type: 'string', minLength: 1, maxLength: 64 },
    },
  },
};

export default async function deleteImpactRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/delete-impact/:entityType/:id
   * Count what a successful DELETE of the entity would also change (read-only).
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { entityType: DeleteImpactEntityType; id: string } }>(
    '/:entityType/:id',
    { schema: deleteImpactSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const impact = getDeleteImpact(fastify.db, request.params.entityType, request.params.id);
      return reply.status(200).send(impact);
    },
  );
}

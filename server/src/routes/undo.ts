import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { applyUndo, undoStore } from '../services/undoService.js';

// JSON schema for POST /api/undo/:token
const undoSchema = {
  params: {
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string', pattern: '^u_[0-9a-f]{32}$' },
    },
  },
};

export default async function undoRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/undo/:token
   * Restore the snapshot behind a single-use undo token. The token is bound to the user who
   * received it; unknown, expired, used or foreign tokens return 404. A changed record
   * returns 409 (and still consumes the token).
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { token: string } }>(
    '/:token',
    { schema: undoSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = applyUndo(fastify.db, undoStore, request.params.token, request.user.id);
      return reply.status(200).send(result);
    },
  );
}

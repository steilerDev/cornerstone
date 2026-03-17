import type { FastifyInstance } from 'fastify';
import type { AppConfigResponse } from '@cornerstone/shared';

export default async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (_request, reply) => {
    const response: AppConfigResponse = {
      currency: fastify.config.currency,
    };
    return reply.status(200).send(response);
  });
}

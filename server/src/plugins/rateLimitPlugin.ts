import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export default fp(
  async function rateLimitPlugin(fastify) {
    await fastify.register(rateLimit, {
      global: true,
      max: 200,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) => ({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again after ${context.after}.`,
        },
      }),
    });
  },
  {
    name: 'rate-limit',
    dependencies: ['config'],
  },
);

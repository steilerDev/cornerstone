import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { AppError } from '../errors/AppError.js';

export default fp(
  async function rateLimitPlugin(fastify) {
    await fastify.register(rateLimit, {
      global: false,
      max: 200,
      timeWindow: '1 minute',
      errorResponseBuilder: (_request, context) =>
        new AppError(
          'RATE_LIMIT_EXCEEDED',
          429,
          `Too many requests. Please try again after ${context.after}.`,
        ),
    });
  },
  {
    name: 'rate-limit',
    dependencies: ['config'],
  },
);

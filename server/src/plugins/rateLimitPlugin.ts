import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { AppError } from '../errors/AppError.js';

export default fp(
  async function rateLimitPlugin(fastify) {
    await fastify.register(rateLimit, {
      global: false,
      max: 200,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        const ip = request.ip;
        if (ip) return ip;
        const fwdFor = request.headers['x-forwarded-for'];
        if (fwdFor) {
          // X-Forwarded-For may be comma-separated; use the first (client) IP
          const first = Array.isArray(fwdFor) ? fwdFor[0] : fwdFor.split(',')[0]?.trim();
          if (first) return first;
        }
        const realIp = request.headers['x-real-ip'];
        if (typeof realIp === 'string' && realIp.length > 0) return realIp;
        return 'unknown';
      },
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

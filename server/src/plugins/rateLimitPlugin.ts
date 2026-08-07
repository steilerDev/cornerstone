import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import rateLimit, { normalizeIP } from '@fastify/rate-limit';
import { AppError } from '../errors/AppError.js';

const IPV6_SUBNET = 64;

export function rateLimitKeyGenerator(request: Pick<FastifyRequest, 'ip'>): string {
  return normalizeIP(request.ip ?? 'unknown', IPV6_SUBNET);
}

export default fp(
  async function rateLimitPlugin(fastify) {
    await fastify.register(rateLimit, {
      global: false,
      max: 200,
      timeWindow: '1 minute',
      ipv6Subnet: IPV6_SUBNET,
      // Two hazards justify this override of the default key generator:
      // 1. request.ip is typed `string` but is genuinely null when the socket has no
      //    address metadata; normalizeIP dereferences its argument (ip.toLowerCase()),
      //    so a bare normalizeIP(request.ip) would 500 every rate-limited endpoint.
      // 2. @fastify/rate-limit's identity-check gate (index.js:249) only enables /64
      //    subnet normalization for the exact defaultKeyGenerator reference — any custom
      //    function bypasses it, so we must call normalizeIP explicitly (CVE-2026-15144).
      keyGenerator: rateLimitKeyGenerator,
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

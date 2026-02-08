import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import { AppError } from '../errors/AppError.js';

export default fp(
  async function errorHandlerPlugin(fastify) {
    fastify.setErrorHandler<FastifyError>((error, request, reply) => {
      // Known application errors
      if (error instanceof AppError) {
        const level = error.statusCode >= 500 ? 'error' : 'warn';
        request.log[level]({ err: error }, error.message);

        const response: ApiErrorResponse = {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details && { details: error.details }),
          },
        };
        return reply.status(error.statusCode).send(response);
      }

      // Fastify/AJV validation errors (schema validation)
      if (error.validation) {
        request.log.warn({ err: error }, 'Validation error');

        const details: Record<string, unknown> = {
          fields: error.validation.map((v) => ({
            path: v.instancePath || '/',
            message: v.message,
            ...(v.params && { params: v.params }),
          })),
        };

        const response: ApiErrorResponse = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          },
        };
        return reply.status(400).send(response);
      }

      // Unknown/unexpected errors
      request.log.error({ err: error }, 'Unhandled error');

      const isProduction = fastify.config.nodeEnv === 'production';
      const response: ApiErrorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: isProduction ? 'An internal error occurred' : error.message,
        },
      };
      return reply.status(500).send(response);
    });
  },
  {
    name: 'error-handler',
    dependencies: ['config'],
  },
);

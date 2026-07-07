import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import type { ApiErrorResponse, ErrorCode } from '@cornerstone/shared';
import { AppError } from '../errors/AppError.js';

/**
 * Maps known Fastify/plugin internal error codes (FST_*) to translatable
 * ErrorCode enum members. Codes not in this table fall back based on
 * status range — see fallbackErrorCode().
 */
const FASTIFY_ERROR_CODE_MAP: Record<string, ErrorCode> = {
  FST_ERR_CTP_BODY_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  FST_ERR_CTP_INVALID_JSON_BODY: 'VALIDATION_ERROR',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'VALIDATION_ERROR',
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: 'VALIDATION_ERROR',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'VALIDATION_ERROR',
  FST_ERR_BAD_URL: 'VALIDATION_ERROR',
  FST_REQ_FILE_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  FST_PARTS_LIMIT: 'PAYLOAD_TOO_LARGE',
  FST_FILES_LIMIT: 'PAYLOAD_TOO_LARGE',
  FST_FIELDS_LIMIT: 'PAYLOAD_TOO_LARGE',
  FST_PROTO_VIOLATION: 'VALIDATION_ERROR',
  FST_INVALID_MULTIPART_CONTENT_TYPE: 'VALIDATION_ERROR',
  FST_INVALID_JSON_FIELD_ERROR: 'VALIDATION_ERROR',
};

function mapFastifyErrorCode(rawCode: string | undefined, statusCode: number): ErrorCode {
  if (rawCode && rawCode in FASTIFY_ERROR_CODE_MAP) {
    return FASTIFY_ERROR_CODE_MAP[rawCode]!;
  }
  return statusCode >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
}

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
            ...(error.details && !error.suppressDetails && { details: error.details }),
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

      // Fastify internal errors with an explicit statusCode (e.g., FST_ERR_CTP_BODY_TOO_LARGE → 413)
      if ('statusCode' in error && typeof error.statusCode === 'number' && !error.validation) {
        request.log.warn({ err: error }, 'Fastify request error');
        const code = mapFastifyErrorCode((error as FastifyError).code, error.statusCode);
        return reply.status(error.statusCode).send({
          error: {
            code,
            message: error.message,
          },
        });
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

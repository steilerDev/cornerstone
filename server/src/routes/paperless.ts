/**
 * Paperless-ngx proxy route handlers.
 *
 * EPIC-08: Paperless-ngx Document Integration
 *
 * All endpoints under /api/paperless/* proxy requests to the configured
 * Paperless-ngx instance. The Paperless-ngx API token is kept server-side.
 *
 * All endpoints (except /status) return 503 PAPERLESS_NOT_CONFIGURED when
 * the integration is not set up (missing PAPERLESS_URL or PAPERLESS_API_TOKEN).
 *
 * Auth required: Yes (session cookie) on all endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { AppError, UnauthorizedError } from '../errors/AppError.js';
import * as paperlessService from '../services/paperlessService.js';
import type { PaperlessDocumentListQuery } from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

const listDocumentsSchema = {
  querystring: {
    type: 'object',
    properties: {
      query: { type: 'string', maxLength: 500 },
      tags: { type: 'string', maxLength: 200 },
      correspondent: { type: 'integer', minimum: 1 },
      documentType: { type: 'integer', minimum: 1 },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      sortBy: {
        type: 'string',
        enum: ['created', 'added', 'modified', 'title', 'archive_serial_number'],
      },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
    },
    additionalProperties: false,
  },
};

const documentIdParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Assert that Paperless-ngx is configured and return the connection credentials.
 * Throws 503 PAPERLESS_NOT_CONFIGURED if integration is not set up.
 */
function requirePaperless(fastify: FastifyInstance): { baseUrl: string; token: string } {
  if (!fastify.config.paperlessEnabled) {
    throw new AppError(
      'PAPERLESS_NOT_CONFIGURED',
      503,
      'Paperless-ngx integration is not configured',
    );
  }
  return {
    baseUrl: fastify.config.paperlessUrl!,
    token: fastify.config.paperlessApiToken!,
  };
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function paperlessRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/paperless/status
   *
   * Returns the Paperless-ngx connection status (configured, reachable).
   * Always returns 200 OK — the status is encoded in the response body.
   * Unlike other proxy endpoints, this does NOT return 503 when not configured.
   *
   * Auth required: Yes
   */
  fastify.get('/status', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    if (!fastify.config.paperlessEnabled) {
      return reply.status(200).send({ configured: false, reachable: false, error: null });
    }

    const status = await paperlessService.getStatus(
      fastify.config.paperlessUrl!,
      fastify.config.paperlessApiToken!,
    );
    return reply.status(200).send(status);
  });

  /**
   * GET /api/paperless/documents
   *
   * Search and browse documents in Paperless-ngx with filtering, sorting, and pagination.
   * Tag, correspondent, and document type names are resolved server-side.
   *
   * Auth required: Yes
   */
  fastify.get<{ Querystring: PaperlessDocumentListQuery }>(
    '/documents',
    { schema: listDocumentsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { baseUrl, token } = requirePaperless(fastify);
      const result = await paperlessService.listDocuments(baseUrl, token, request.query);
      return reply.status(200).send(result);
    },
  );

  /**
   * GET /api/paperless/documents/:id
   *
   * Fetch metadata for a single Paperless-ngx document (includes full text content).
   *
   * Auth required: Yes
   */
  fastify.get<{ Params: { id: number } }>(
    '/documents/:id',
    { schema: documentIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { baseUrl, token } = requirePaperless(fastify);
      const document = await paperlessService.getDocument(baseUrl, token, request.params.id);
      return reply.status(200).send({ document });
    },
  );

  /**
   * GET /api/paperless/documents/:id/thumb
   *
   * Fetch the thumbnail image for a Paperless-ngx document.
   * Returns a binary image response (passthrough from Paperless-ngx).
   * Content-Type is forwarded from the upstream response.
   *
   * Auth required: Yes
   */
  fastify.get<{ Params: { id: number } }>(
    '/documents/:id/thumb',
    { schema: documentIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { baseUrl, token } = requirePaperless(fastify);
      const upstream = await paperlessService.fetchBinary(
        baseUrl,
        token,
        `/api/documents/${request.params.id}/thumb/`,
      );

      const contentType = upstream.headers.get('content-type') ?? 'image/webp';
      const contentDisposition = upstream.headers.get('content-disposition');

      reply.header('content-type', contentType);
      if (contentDisposition) {
        reply.header('content-disposition', contentDisposition);
      }

      const buffer = await upstream.arrayBuffer();
      return reply.status(200).send(Buffer.from(buffer));
    },
  );

  /**
   * GET /api/paperless/documents/:id/preview
   *
   * Fetch the preview PDF or original document for viewing.
   * Returns a binary response (passthrough from Paperless-ngx).
   * Content-Type is forwarded from the upstream response.
   *
   * Auth required: Yes
   */
  fastify.get<{ Params: { id: number } }>(
    '/documents/:id/preview',
    { schema: documentIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { baseUrl, token } = requirePaperless(fastify);
      const upstream = await paperlessService.fetchBinary(
        baseUrl,
        token,
        `/api/documents/${request.params.id}/preview/`,
      );

      const contentType = upstream.headers.get('content-type') ?? 'application/pdf';
      const contentDisposition = upstream.headers.get('content-disposition');

      reply.header('content-type', contentType);
      if (contentDisposition) {
        reply.header('content-disposition', contentDisposition);
      }

      const buffer = await upstream.arrayBuffer();
      return reply.status(200).send(Buffer.from(buffer));
    },
  );

  /**
   * GET /api/paperless/tags
   *
   * List all tags available in Paperless-ngx.
   * Tags are not paginated (instances typically have fewer than ~100 tags).
   *
   * Auth required: Yes
   */
  fastify.get('/tags', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const { baseUrl, token } = requirePaperless(fastify);
    const result = await paperlessService.listTags(baseUrl, token);
    return reply.status(200).send(result);
  });
}

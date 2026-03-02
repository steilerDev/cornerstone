/**
 * Document link route handlers.
 *
 * EPIC-08: Paperless-ngx Document Integration
 *
 * Manages links between Cornerstone entities (work items, invoices, household items)
 * and Paperless-ngx documents. Links are stored in the local `document_links` table.
 *
 * Auth required: Yes (session cookie) on all endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import * as documentLinkService from '../services/documentLinkService.js';
import type { CreateDocumentLinkRequest, DocumentLinkEntityType } from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

const createLinkSchema = {
  body: {
    type: 'object',
    required: ['entityType', 'entityId', 'paperlessDocumentId'],
    properties: {
      entityType: { type: 'string', enum: ['work_item', 'household_item', 'invoice'] },
      entityId: { type: 'string', minLength: 1, maxLength: 36 },
      paperlessDocumentId: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  },
};

const listLinksSchema = {
  querystring: {
    type: 'object',
    required: ['entityType', 'entityId'],
    properties: {
      entityType: { type: 'string', enum: ['work_item', 'household_item', 'invoice'] },
      entityId: { type: 'string', minLength: 1, maxLength: 36 },
    },
    additionalProperties: false,
  },
};

const deleteLinkSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
    additionalProperties: false,
  },
};

// ─── Route plugin ─────────────────────────────────────────────────────────────

export default async function documentLinksRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/document-links
   *
   * Create a link between a Cornerstone entity and a Paperless-ngx document.
   * Validates that the referenced entity exists at the application layer.
   *
   * Auth required: Yes
   */
  fastify.post<{ Body: CreateDocumentLinkRequest }>(
    '/',
    { schema: createLinkSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { entityType, entityId, paperlessDocumentId } = request.body;
      const link = documentLinkService.createLink(
        fastify.db,
        entityType,
        entityId,
        paperlessDocumentId,
        request.user.id,
      );
      return reply.status(201).send({ documentLink: link });
    },
  );

  /**
   * GET /api/document-links?entityType=...&entityId=...
   *
   * List all document links for a given entity, enriched with Paperless-ngx metadata.
   * If Paperless-ngx is not configured or a document has been deleted, `document` is null.
   * The `content` field is null in list responses (use GET /api/paperless/documents/:id for full content).
   *
   * Auth required: Yes
   */
  fastify.get<{ Querystring: { entityType: DocumentLinkEntityType; entityId: string } }>(
    '/',
    { schema: listLinksSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { entityType, entityId } = request.query;
      const links = await documentLinkService.getLinksForEntity(fastify.db, entityType, entityId, {
        paperlessEnabled: fastify.config.paperlessEnabled,
        paperlessUrl: fastify.config.paperlessUrl,
        paperlessApiToken: fastify.config.paperlessApiToken,
      });
      return reply.status(200).send({ documentLinks: links });
    },
  );

  /**
   * DELETE /api/document-links/:id
   *
   * Remove a link between a Cornerstone entity and a Paperless-ngx document.
   * Returns 204 on success, 404 if the link does not exist.
   *
   * Auth required: Yes
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: deleteLinkSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const found = documentLinkService.deleteLink(fastify.db, request.params.id);
      if (!found) {
        throw new NotFoundError('Document link not found');
      }
      return reply.status(204).send();
    },
  );
}

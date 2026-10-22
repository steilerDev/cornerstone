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
import { issueRestoreToken, undoStore } from '../services/undoService.js';
import { DOCUMENT_LINK_ENTITY_TYPES } from '@cornerstone/shared';
import type {
  CreateDocumentLinkRequest,
  UpdateDocumentLinkRequest,
  DocumentLinkEntityType,
  AllLinkedDocumentIdsResponse,
  DeleteDocumentLinkResponse,
} from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

const createLinkSchema = {
  body: {
    type: 'object',
    required: ['entityType', 'entityId', 'paperlessDocumentId'],
    properties: {
      entityType: {
        type: 'string',
        enum: [...DOCUMENT_LINK_ENTITY_TYPES],
      },
      entityId: { type: 'string', minLength: 1, maxLength: 36 },
      paperlessDocumentId: { type: 'integer', minimum: 1 },
      attachmentType: { type: ['string', 'null'], enum: ['quotation', 'deposit', 'invoice', null] },
    },
    additionalProperties: false,
  },
};

const updateLinkSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
    additionalProperties: false,
  },
  body: {
    type: 'object',
    required: ['attachmentType'],
    properties: {
      attachmentType: { type: ['string', 'null'], enum: ['quotation', 'deposit', 'invoice', null] },
    },
    additionalProperties: false,
  },
};

const listLinksSchema = {
  querystring: {
    type: 'object',
    required: ['entityType', 'entityId'],
    properties: {
      entityType: {
        type: 'string',
        enum: [...DOCUMENT_LINK_ENTITY_TYPES],
      },
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

      const { entityType, entityId, paperlessDocumentId, attachmentType } = request.body;
      const link = documentLinkService.createLink(
        fastify.db,
        entityType,
        entityId,
        paperlessDocumentId,
        request.user.id,
        attachmentType ?? null,
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
        paperlessFilterTag: fastify.config.paperlessFilterTag,
      });
      return reply.status(200).send({ documentLinks: links });
    },
  );

  /**
   * GET /api/document-links/linked-ids
   *
   * Return the distinct set of Paperless-ngx document IDs linked to any
   * entity in the system. Used by the picker's "hide already-linked" checkbox
   * to filter system-wide rather than per-entity.
   *
   * Auth required: Yes
   */
  fastify.get<{ Reply: AllLinkedDocumentIdsResponse }>('/linked-ids', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    const ids = documentLinkService.getAllLinkedDocumentIds(fastify.db);
    return reply.status(200).send({ paperlessDocumentIds: ids });
  });

  /**
   * PATCH /api/document-links/:id
   *
   * Tag, retag, or untag (null) a document link's attachment type.
   * Non-invoice links ignore the request value and store null.
   *
   * Auth required: Yes
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateDocumentLinkRequest }>(
    '/:id',
    { schema: updateLinkSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const link = documentLinkService.updateAttachmentType(
        fastify.db,
        request.params.id,
        request.body.attachmentType,
      );
      return reply.status(200).send({ documentLink: link });
    },
  );

  /**
   * DELETE /api/document-links/:id
   *
   * Remove a link between a Cornerstone entity and a Paperless-ngx document.
   * Returns 200 { undo } on success (the token restores the link, contract 11),
   * 404 if the link does not exist.
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

      const { id } = request.params;
      const snapshot = documentLinkService.deleteLinkWithSnapshot(fastify.db, id);
      if (!snapshot) {
        throw new NotFoundError('Document link not found');
      }
      const undo = issueRestoreToken(undoStore, {
        userId: request.user.id,
        subject: { type: 'document_link', id },
        restore: (tx) => documentLinkService.restoreDeletedLink(tx, snapshot),
      });
      return reply.status(200).send({ undo } satisfies DeleteDocumentLinkResponse);
    },
  );
}

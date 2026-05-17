/**
 * Photo route handlers.
 *
 * EPIC-13 & EPIC-16: Photo Upload Infrastructure
 *
 * Handles photo uploads, metadata management, file serving, and reordering.
 *
 * Auth required: Yes (session cookie) on all endpoints.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError, UnauthorizedError, ValidationError } from '../errors/AppError.js';
import * as photoService from '../services/photoService.js';
import * as photoAnnotationService from '../services/photoAnnotationService.js';
import type {
  UpdatePhotoRequest,
  ReorderPhotosRequest,
  PhotoEntityType,
} from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

// No JSON schema for upload — multipart body parsed via request.file()

const getPhotoFileSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      variant: { type: 'string', enum: ['original'] },
      v: { type: 'string' },
    },
    additionalProperties: false,
  },
};

const listPhotosSchema = {
  querystring: {
    type: 'object',
    required: ['entityType', 'entityId'],
    properties: {
      entityType: { type: 'string', minLength: 1, maxLength: 50 },
      entityId: { type: 'string', minLength: 1, maxLength: 36 },
    },
    additionalProperties: false,
  },
};

const updatePhotoSchema = {
  body: {
    type: 'object',
    minProperties: 1,
    properties: {
      caption: { type: ['string', 'null'] },
      sortOrder: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
};

const reorderPhotosSchema = {
  body: {
    type: 'object',
    required: ['entityType', 'entityId', 'photoIds'],
    properties: {
      entityType: { type: 'string', minLength: 1, maxLength: 50 },
      entityId: { type: 'string', minLength: 1, maxLength: 36 },
      photoIds: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 36 },
      },
    },
    additionalProperties: false,
  },
};

const getPhotoSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

const getPhotoThumbnailSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      v: { type: 'string' },
    },
    additionalProperties: false,
  },
};

// ─── Route handlers ───────────────────────────────────────────────────────────

export default async function photoRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /
   * Upload a new photo with multipart form data.
   *
   * Form fields:
   *   - file: the photo file
   *   - entityType: entity type string (e.g., 'diary_entry')
   *   - entityId: entity ID (UUID)
   *   - caption (optional): photo caption
   *
   * Returns: 201 with { photo }
   */
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) throw new UnauthorizedError();

    // Get the uploaded file
    const file = await request.file();
    if (!file) {
      throw new ValidationError('No file uploaded');
    }

    // Read file buffer
    const fileBuffer = await file.toBuffer();

    // Get form fields — fields is an object keyed by field name
    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const entityTypeField = fields['entityType'];
    const entityIdField = fields['entityId'];
    const captionField = fields['caption'];

    if (!entityTypeField?.value || !entityIdField?.value) {
      throw new ValidationError('Missing required fields: entityType, entityId');
    }

    const entityType = entityTypeField.value as PhotoEntityType;
    const entityId = entityIdField.value;
    const caption = captionField?.value ?? undefined;

    // Validate file size against config limit
    const maxFileSizeBytes = fastify.config.photoMaxFileSizeMb * 1024 * 1024;
    if (fileBuffer.length > maxFileSizeBytes) {
      throw new ValidationError(
        `File size exceeds maximum of ${fastify.config.photoMaxFileSizeMb}MB`,
      );
    }

    // Upload photo
    const photo = await photoService.uploadPhoto(
      fastify.db,
      fastify.config.photoStoragePath,
      fileBuffer,
      file.filename,
      file.mimetype,
      entityType,
      entityId,
      request.user.id,
      caption,
    );

    return reply.status(201).send({ photo });
  });

  /**
   * GET /
   * List photos for an entity.
   *
   * Query params:
   *   - entityType: entity type string
   *   - entityId: entity ID
   *
   * Returns: 200 with { photos }
   */
  fastify.get(
    '/',
    { schema: listPhotosSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { entityType, entityId } = request.query as { entityType: string; entityId: string };

      const photoList = photoService.getPhotosForEntity(fastify.db, entityType, entityId);

      return reply.status(200).send({ photos: photoList });
    },
  );

  /**
   * GET /:id
   * Get a single photo's metadata.
   *
   * Returns: 200 with { photo } or 404
   */
  fastify.get(
    '/:id',
    { schema: getPhotoSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { id } = request.params as { id: string };

      const photo = photoService.getPhoto(fastify.db, id);
      if (!photo) {
        throw new NotFoundError('Photo not found');
      }

      return reply.status(200).send({ photo });
    },
  );

  /**
   * GET /:id/file
   * Serve the photo file as a stream.
   *
   * Query params:
   *   - variant (optional): 'original' to force original, 'annotated' or omitted to prefer annotated if present
   *
   * Returns: 200 with file stream (Content-Type and Cache-Control headers set)
   */
  fastify.get(
    '/:id/file',
    { schema: getPhotoFileSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { id } = request.params as { id: string };
      const { variant } = request.query as { variant?: string };
      const preferAnnotated = variant !== 'original';

      const photo = photoService.getPhoto(fastify.db, id);
      if (!photo) {
        throw new NotFoundError('Photo not found');
      }

      const filePath = await photoService.getPhotoFilePath(
        fastify.config.photoStoragePath,
        id,
        'original',
        preferAnnotated,
      );
      if (!filePath) {
        throw new NotFoundError('Photo file not found');
      }

      // Determine MIME type: annotated.png is always image/png
      const mimeType = filePath.endsWith('.png') ? 'image/png' : photo.mimeType;

      // Set cache headers (immutable, 1 year)
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('Content-Type', mimeType);

      const stream = createReadStream(filePath);
      return reply.type(mimeType).send(stream);
    },
  );

  /**
   * GET /:id/thumbnail
   * Serve the photo thumbnail (WebP format).
   *
   * Query params:
   *   - v (optional): cache-buster timestamp
   *
   * Returns: 200 with thumbnail stream (WebP, Cache-Control headers set)
   */
  fastify.get(
    '/:id/thumbnail',
    { schema: getPhotoThumbnailSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { id } = request.params as { id: string };

      const photo = photoService.getPhoto(fastify.db, id);
      if (!photo) {
        throw new NotFoundError('Photo not found');
      }

      const filePath = await photoService.getPhotoFilePath(
        fastify.config.photoStoragePath,
        id,
        'thumbnail',
      );
      if (!filePath) {
        throw new NotFoundError('Photo thumbnail not found');
      }

      // Set cache headers (immutable, 1 year)
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      reply.header('Content-Type', 'image/webp');

      const stream = createReadStream(filePath);
      return reply.type('image/webp').send(stream);
    },
  );

  /**
   * PATCH /:id
   * Update a photo's metadata (caption, sort order).
   *
   * Request body: { caption?, sortOrder? }
   *
   * Returns: 200 with { photo } or 404
   */
  fastify.patch(
    '/:id',
    { schema: { params: getPhotoSchema.params, body: updatePhotoSchema.body } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { id } = request.params as { id: string };
      const updates = request.body as UpdatePhotoRequest;

      const photo = photoService.updatePhoto(fastify.db, id, updates);
      if (!photo) {
        throw new NotFoundError('Photo not found');
      }

      return reply.status(200).send({ photo });
    },
  );

  /**
   * PATCH /reorder
   * Reorder photos for an entity by setting sort_order.
   *
   * Request body: { entityType, entityId, photoIds }
   *
   * Returns: 204 No Content
   */
  fastify.patch(
    '/reorder',
    { schema: reorderPhotosSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { entityType, entityId, photoIds } = request.body as ReorderPhotosRequest;

      photoService.reorderPhotos(fastify.db, entityType, entityId, photoIds);

      return reply.status(204).send();
    },
  );

  /**
   * PUT /:id/annotation
   * Save an annotated (baked overlay) PNG for a photo.
   *
   * Form field:
   *   - file: the annotated PNG blob
   *
   * Returns: 200 with { photo } or 400/404
   */
  fastify.put(
    '/:id/annotation',
    { schema: { params: getPhotoSchema.params } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();
      const { id } = request.params as { id: string };

      const file = await request.file();
      if (!file) throw new ValidationError('No file uploaded');

      const pngBuffer = await file.toBuffer();

      const maxFileSizeBytes = fastify.config.photoMaxFileSizeMb * 1024 * 1024;
      if (pngBuffer.length > maxFileSizeBytes) {
        throw new ValidationError(
          `File size exceeds maximum of ${fastify.config.photoMaxFileSizeMb}MB`,
        );
      }

      const photo = await photoAnnotationService.saveAnnotatedImage(
        fastify.db,
        fastify.config.photoStoragePath,
        id,
        pngBuffer,
      );

      return reply.status(200).send({ photo });
    },
  );

  /**
   * DELETE /:id/annotation
   * Clear the annotated image for a photo.
   *
   * Returns: 204 No Content or 404
   */
  fastify.delete(
    '/:id/annotation',
    { schema: { params: getPhotoSchema.params } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();
      const { id } = request.params as { id: string };

      await photoAnnotationService.clearAnnotation(
        fastify.db,
        fastify.config.photoStoragePath,
        id,
      );

      return reply.status(204).send();
    },
  );

  /**
   * DELETE /:id
   * Delete a photo and its associated files.
   *
   * Returns: 204 No Content or 404
   */
  fastify.delete(
    '/:id',
    { schema: getPhotoSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) throw new UnauthorizedError();

      const { id } = request.params as { id: string };

      const photo = photoService.getPhoto(fastify.db, id);
      if (!photo) {
        throw new NotFoundError('Photo not found');
      }

      await photoService.deletePhoto(fastify.db, fastify.config.photoStoragePath, id);

      return reply.status(204).send();
    },
  );
}

/**
 * Diary entry route handlers.
 *
 * EPIC-13: Construction Diary
 *
 * Provides CRUD endpoints for construction diary entries (Bautagebuch).
 * Auth required: Yes (session cookie) on all endpoints.
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as diaryService from '../services/diaryService.js';
import * as diaryExportService from '../services/diaryExportService.js';
import type {
  CreateDiaryEntryRequest,
  UpdateDiaryEntryRequest,
  DiaryEntryListQuery,
} from '@cornerstone/shared';

// ─── JSON schemas ─────────────────────────────────────────────────────────────

/** JSON schema for GET /api/diary-entries (list with pagination/filtering) */
const listDiaryEntriesSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      type: { type: 'string' },
      dateFrom: { type: 'string' },
      dateTo: { type: 'string' },
      automatic: { type: 'boolean' },
      q: { type: 'string' },
    },
    additionalProperties: false,
  },
};

/** JSON schema for POST /api/diary-entries (create entry) */
const createDiaryEntrySchema = {
  body: {
    type: 'object',
    required: ['entryType', 'entryDate', 'body'],
    properties: {
      entryType: {
        type: 'string',
        enum: ['daily_log', 'site_visit', 'delivery', 'issue', 'general_note'],
      },
      entryDate: { type: 'string' },
      title: { type: ['string', 'null'] },
      body: { type: 'string', minLength: 1, maxLength: 10000 },
      metadata: { type: ['object', 'null'] },
    },
    additionalProperties: false,
  },
};

/** JSON schema for GET /api/diary-entries/:id (get single entry) */
const getDiaryEntrySchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

/** JSON schema for PATCH /api/diary-entries/:id (update entry) */
const updateDiaryEntrySchema = {
  body: {
    type: 'object',
    minProperties: 1,
    properties: {
      entryDate: { type: 'string' },
      title: { type: ['string', 'null'] },
      body: { type: 'string', minLength: 1, maxLength: 10000 },
      metadata: { type: ['object', 'null'] },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

/** JSON schema for DELETE /api/diary-entries/:id (delete entry) */
const deleteDiaryEntrySchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

/** JSON schema for GET /api/diary-entries/export (export as PDF) */
const exportDiaryEntriesSchema = {
  querystring: {
    type: 'object',
    properties: {
      dateFrom: { type: 'string' },
      dateTo: { type: 'string' },
      types: { type: 'string' },
      includeAutomatic: { type: 'boolean' },
      includePhotos: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

export default async function diaryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/diary-entries
   * List diary entries with pagination, filtering, and search.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Querystring: DiaryEntryListQuery }>(
    '/',
    { schema: listDiaryEntriesSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = diaryService.listDiaryEntries(fastify.db, request.query);
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/diary-entries
   * Create a new manual diary entry.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateDiaryEntryRequest }>(
    '/',
    { schema: createDiaryEntrySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const entry = diaryService.createDiaryEntry(fastify.db, request.user.id, request.body);
      return reply.status(201).send(entry);
    },
  );

  /**
   * GET /api/diary-entries/:id
   * Get a single diary entry by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: getDiaryEntrySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const entry = diaryService.getDiaryEntry(fastify.db, request.params.id);
      return reply.status(200).send(entry);
    },
  );

  /**
   * PATCH /api/diary-entries/:id
   * Update a diary entry.
   * Auth required: Yes (both admin and member)
   * Note: entryType and isAutomatic are immutable and cannot be changed.
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateDiaryEntryRequest }>(
    '/:id',
    { schema: updateDiaryEntrySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const entry = diaryService.updateDiaryEntry(fastify.db, request.params.id, request.body);
      return reply.status(200).send(entry);
    },
  );

  /**
   * DELETE /api/diary-entries/:id
   * Delete a diary entry and its associated photos.
   * Auth required: Yes (both admin and member)
   * Note: Automatic entries cannot be deleted.
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: deleteDiaryEntrySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      await diaryService.deleteDiaryEntry(
        fastify.db,
        request.params.id,
        fastify.config.photoStoragePath,
      );
      return reply.status(204).send();
    },
  );

  /**
   * GET /api/diary-entries/export
   * Export diary entries as a PDF document.
   * Supports filtering by date range, entry types, and automatic entries.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{
    Querystring: {
      dateFrom?: string;
      dateTo?: string;
      types?: string;
      includeAutomatic?: boolean;
      includePhotos?: boolean;
    };
  }>('/export', { schema: exportDiaryEntriesSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const pdfBuffer = await diaryExportService.generateDiaryPdf(
      fastify.db,
      fastify.config.photoStoragePath,
      {
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
        types: request.query.types,
        includeAutomatic: request.query.includeAutomatic,
        includePhotos: request.query.includePhotos,
      },
    );

    // Generate filename with date range
    const dateRangeStr =
      request.query.dateFrom && request.query.dateTo
        ? `${request.query.dateFrom}-to-${request.query.dateTo}`
        : new Date().toISOString().substring(0, 10);
    const filename = `construction-diary-${dateRangeStr}.pdf`;

    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(pdfBuffer);
  });
}

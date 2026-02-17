import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as noteService from '../services/noteService.js';
import type { CreateNoteRequest, UpdateNoteRequest } from '@cornerstone/shared';

// JSON schema for POST /api/work-items/:workItemId/notes (create note)
const createNoteSchema = {
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 10000 },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /api/work-items/:workItemId/notes/:noteId (update note)
const updateNoteSchema = {
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1, maxLength: 10000 },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['workItemId', 'noteId'],
    properties: {
      workItemId: { type: 'string' },
      noteId: { type: 'string' },
    },
  },
};

// JSON schema for path parameter validation (GET/DELETE)
const noteParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

const noteIdParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'noteId'],
    properties: {
      workItemId: { type: 'string' },
      noteId: { type: 'string' },
    },
  },
};

export default async function noteRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/work-items/:workItemId/notes
   * Create a new note on a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string }; Body: CreateNoteRequest }>(
    '/',
    { schema: createNoteSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const note = noteService.createNote(
        fastify.db,
        request.params.workItemId,
        request.user.id,
        request.body,
      );
      return reply.status(201).send(note);
    },
  );

  /**
   * GET /api/work-items/:workItemId/notes
   * List all notes for a work item, sorted by created_at DESC.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: noteParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const notes = noteService.listNotes(fastify.db, request.params.workItemId);
      return reply.status(200).send({ notes });
    },
  );

  /**
   * PATCH /api/work-items/:workItemId/notes/:noteId
   * Update a note's content.
   * Auth required: Yes (author or admin only)
   */
  fastify.patch<{ Params: { workItemId: string; noteId: string }; Body: UpdateNoteRequest }>(
    '/:noteId',
    { schema: updateNoteSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const note = noteService.updateNote(
        fastify.db,
        request.params.workItemId,
        request.params.noteId,
        request.user.id,
        request.user.role === 'admin',
        request.body,
      );
      return reply.status(200).send(note);
    },
  );

  /**
   * DELETE /api/work-items/:workItemId/notes/:noteId
   * Delete a note.
   * Auth required: Yes (author or admin only)
   */
  fastify.delete<{ Params: { workItemId: string; noteId: string } }>(
    '/:noteId',
    { schema: noteIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      noteService.deleteNote(
        fastify.db,
        request.params.workItemId,
        request.params.noteId,
        request.user.id,
        request.user.role === 'admin',
      );
      return reply.status(204).send();
    },
  );
}

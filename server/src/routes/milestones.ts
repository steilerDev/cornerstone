import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as milestoneService from '../services/milestoneService.js';
import type {
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  LinkWorkItemRequest,
} from '@cornerstone/shared';

// JSON schema for POST /api/milestones (create milestone)
const createMilestoneSchema = {
  body: {
    type: 'object',
    required: ['title', 'targetDate'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      targetDate: { type: 'string', format: 'date' },
      color: { type: ['string', 'null'] },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/milestones/:id (update milestone)
const updateMilestoneSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      description: { type: ['string', 'null'], maxLength: 2000 },
      targetDate: { type: 'string', format: 'date' },
      isCompleted: { type: 'boolean' },
      color: { type: ['string', 'null'] },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
};

// JSON schema for integer milestone ID in path params
const milestoneIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
};

// JSON schema for POST /api/milestones/:id/work-items (link work item)
const linkWorkItemSchema = {
  body: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
};

// JSON schema for DELETE /api/milestones/:id/work-items/:workItemId (unlink work item)
const unlinkWorkItemSchema = {
  params: {
    type: 'object',
    required: ['id', 'workItemId'],
    properties: {
      id: { type: 'integer' },
      workItemId: { type: 'string' },
    },
  },
};

export default async function milestoneRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/milestones
   * Returns all milestones sorted by target_date ascending, with linked work item count.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }
    const result = milestoneService.getAllMilestones(fastify.db);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/milestones
   * Creates a new milestone. createdBy is set to the authenticated user.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateMilestoneRequest }>(
    '/',
    { schema: createMilestoneSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      const milestone = milestoneService.createMilestone(fastify.db, request.body, request.user.id);
      return reply.status(201).send(milestone);
    },
  );

  /**
   * GET /api/milestones/:id
   * Returns a single milestone with its linked work items.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: number } }>(
    '/:id',
    { schema: milestoneIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      const milestone = milestoneService.getMilestoneById(fastify.db, request.params.id);
      return reply.status(200).send(milestone);
    },
  );

  /**
   * PATCH /api/milestones/:id
   * Updates a milestone. All fields are optional; at least one required.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: number }; Body: UpdateMilestoneRequest }>(
    '/:id',
    { schema: updateMilestoneSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      const milestone = milestoneService.updateMilestone(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send(milestone);
    },
  );

  /**
   * DELETE /api/milestones/:id
   * Deletes a milestone. Cascades to milestone-work-item associations.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: number } }>(
    '/:id',
    { schema: milestoneIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      milestoneService.deleteMilestone(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );

  /**
   * POST /api/milestones/:id/work-items
   * Links a work item to a milestone.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { id: number }; Body: LinkWorkItemRequest }>(
    '/:id/work-items',
    { schema: linkWorkItemSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      const link = milestoneService.linkWorkItem(
        fastify.db,
        request.params.id,
        request.body.workItemId,
      );
      return reply.status(201).send(link);
    },
  );

  /**
   * DELETE /api/milestones/:id/work-items/:workItemId
   * Unlinks a work item from a milestone.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: number; workItemId: string } }>(
    '/:id/work-items/:workItemId',
    { schema: unlinkWorkItemSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }
      milestoneService.unlinkWorkItem(fastify.db, request.params.id, request.params.workItemId);
      return reply.status(204).send();
    },
  );
}

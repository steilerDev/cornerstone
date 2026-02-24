import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as dependencyService from '../services/dependencyService.js';
import type { CreateDependencyRequest, UpdateDependencyRequest } from '@cornerstone/shared';

// JSON schema for POST /api/work-items/:workItemId/dependencies (create dependency)
const createDependencySchema = {
  body: {
    type: 'object',
    required: ['predecessorId'],
    properties: {
      predecessorId: { type: 'string' },
      dependencyType: {
        type: 'string',
        enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
      },
      leadLagDays: { type: 'integer' },
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

// JSON schema for GET /api/work-items/:workItemId/dependencies
const getDependenciesSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /api/work-items/:workItemId/dependencies/:predecessorId
const updateDependencySchema = {
  body: {
    type: 'object',
    properties: {
      dependencyType: {
        type: 'string',
        enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'],
      },
      leadLagDays: { type: 'integer' },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['workItemId', 'predecessorId'],
    properties: {
      workItemId: { type: 'string' },
      predecessorId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/work-items/:workItemId/dependencies/:predecessorId
const deleteDependencySchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'predecessorId'],
    properties: {
      workItemId: { type: 'string' },
      predecessorId: { type: 'string' },
    },
  },
};

export default async function dependencyRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/work-items/:workItemId/dependencies
   * Create a new dependency (workItemId depends on predecessorId).
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string }; Body: CreateDependencyRequest }>(
    '/',
    { schema: createDependencySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const dependency = dependencyService.createDependency(
        fastify.db,
        request.params.workItemId,
        request.body,
      );
      return reply.status(201).send(dependency);
    },
  );

  /**
   * GET /api/work-items/:workItemId/dependencies
   * List all dependencies (predecessors and successors) for a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: getDependenciesSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const dependencies = dependencyService.getDependencies(fastify.db, request.params.workItemId);
      return reply.status(200).send(dependencies);
    },
  );

  /**
   * PATCH /api/work-items/:workItemId/dependencies/:predecessorId
   * Update a dependency's type and/or lead/lag days. EPIC-06 addition.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{
    Params: { workItemId: string; predecessorId: string };
    Body: UpdateDependencyRequest;
  }>('/:predecessorId', { schema: updateDependencySchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const dependency = dependencyService.updateDependency(
      fastify.db,
      request.params.workItemId,
      request.params.predecessorId,
      request.body,
    );
    return reply.status(200).send(dependency);
  });

  /**
   * DELETE /api/work-items/:workItemId/dependencies/:predecessorId
   * Remove a specific dependency.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; predecessorId: string } }>(
    '/:predecessorId',
    { schema: deleteDependencySchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      dependencyService.deleteDependency(
        fastify.db,
        request.params.workItemId,
        request.params.predecessorId,
      );
      return reply.status(204).send();
    },
  );
}

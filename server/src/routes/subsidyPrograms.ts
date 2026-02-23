import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as subsidyProgramService from '../services/subsidyProgramService.js';
import type { CreateSubsidyProgramRequest, UpdateSubsidyProgramRequest } from '@cornerstone/shared';

// JSON schema for POST /api/subsidy-programs (create program)
const createSubsidyProgramSchema = {
  body: {
    type: 'object',
    required: ['name', 'reductionType', 'reductionValue'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      reductionType: { type: 'string', enum: ['percentage', 'fixed'] },
      reductionValue: { type: 'number', exclusiveMinimum: 0 },
      description: { type: ['string', 'null'] },
      eligibility: { type: ['string', 'null'] },
      applicationStatus: {
        type: 'string',
        enum: ['eligible', 'applied', 'approved', 'received', 'rejected'],
      },
      applicationDeadline: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      categoryIds: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/subsidy-programs/:id (update program)
const updateSubsidyProgramSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      reductionType: { type: 'string', enum: ['percentage', 'fixed'] },
      reductionValue: { type: 'number', exclusiveMinimum: 0 },
      description: { type: ['string', 'null'] },
      eligibility: { type: ['string', 'null'] },
      applicationStatus: {
        type: 'string',
        enum: ['eligible', 'applied', 'approved', 'received', 'rejected'],
      },
      applicationDeadline: { type: ['string', 'null'] },
      notes: { type: ['string', 'null'] },
      categoryIds: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for path parameter validation (GET by ID / DELETE)
const programIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

export default async function subsidyProgramRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/subsidy-programs
   * List all subsidy programs, sorted by name ascending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get('/', async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const subsidyPrograms = subsidyProgramService.listSubsidyPrograms(fastify.db);
    return reply.status(200).send({ subsidyPrograms });
  });

  /**
   * POST /api/subsidy-programs
   * Create a new subsidy program.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateSubsidyProgramRequest }>(
    '/',
    { schema: createSubsidyProgramSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidyProgram = subsidyProgramService.createSubsidyProgram(
        fastify.db,
        request.body,
        request.user.id,
      );
      return reply.status(201).send({ subsidyProgram });
    },
  );

  /**
   * GET /api/subsidy-programs/:id
   * Get a single subsidy program by ID.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: programIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidyProgram = subsidyProgramService.getSubsidyProgramById(
        fastify.db,
        request.params.id,
      );
      return reply.status(200).send({ subsidyProgram });
    },
  );

  /**
   * PATCH /api/subsidy-programs/:id
   * Update a subsidy program's fields.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateSubsidyProgramRequest }>(
    '/:id',
    { schema: updateSubsidyProgramSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const subsidyProgram = subsidyProgramService.updateSubsidyProgram(
        fastify.db,
        request.params.id,
        request.body,
      );
      return reply.status(200).send({ subsidyProgram });
    },
  );

  /**
   * DELETE /api/subsidy-programs/:id
   * Delete a subsidy program.
   * Fails with 409 SUBSIDY_PROGRAM_IN_USE if referenced by work items.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: programIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      subsidyProgramService.deleteSubsidyProgram(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

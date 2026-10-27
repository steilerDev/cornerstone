import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as subsidyProgramService from '../services/subsidyProgramService.js';
import { runUndoable, undoStore } from '../services/undoService.js';
import { getGrantCoveredItems, getGrantMoney } from '../services/moneyService.js';
import { GRANT_ITEM_TYPES } from '@cornerstone/shared';
import type {
  CreateSubsidyProgramRequest,
  LinkGrantItemsRequest,
  UpdateSubsidyProgramRequest,
} from '@cornerstone/shared';

// Shared by POST /api/subsidy-programs (optional `items`) and POST /:id/items (required).
// `additionalProperties: false` strips unknown keys; it does not reject them.
const grantItemsSchema = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    required: ['type', 'id'],
    properties: {
      type: { type: 'string', enum: [...GRANT_ITEM_TYPES] },
      id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
} as const;

// JSON schema for POST /api/subsidy-programs/:id/items
const linkGrantItemsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['items'],
    properties: { items: { ...grantItemsSchema, minItems: 1 } },
    additionalProperties: false,
  },
};

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
      maximumAmount: { type: ['number', 'null'], exclusiveMinimum: 0 },
      categoryIds: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string' },
      },
      includesNoCategoryItems: { type: 'boolean' },
      items: grantItemsSchema,
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
      maximumAmount: { type: ['number', 'null'], exclusiveMinimum: 0 },
      categoryIds: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string' },
      },
      includesNoCategoryItems: { type: 'boolean' },
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
      const money = getGrantMoney(fastify.db, fastify.config.vatRate, request.params.id);
      return reply.status(200).send({ subsidyProgram, money });
    },
  );

  /**
   * GET /api/subsidy-programs/:id/items
   * Tasks and purchases covered by the grant, each with its computed share.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/items',
    { schema: programIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const response = getGrantCoveredItems(fastify.db, fastify.config.vatRate, request.params.id);
      return reply.status(200).send(response);
    },
  );

  /**
   * POST /api/subsidy-programs/:id/items
   * Link tasks / purchases to the grant in one transaction. Idempotent for pairs already linked;
   * an unknown grant or item is a 404 and nothing is linked. Returns the full covered-item list.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { id: string }; Body: LinkGrantItemsRequest }>(
    '/:id/items',
    { schema: linkGrantItemsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      subsidyProgramService.linkGrantItems(fastify.db, request.params.id, request.body.items);
      const response = getGrantCoveredItems(fastify.db, fastify.config.vatRate, request.params.id);
      return reply.status(201).send(response);
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

      const userId = request.user.id;
      const { result: subsidyProgram, undo } = runUndoable(
        fastify.db,
        undoStore,
        { userId, subject: { type: 'subsidy_program', id: request.params.id }, reschedules: false },
        () =>
          subsidyProgramService.updateSubsidyProgram(fastify.db, request.params.id, request.body, {
            userId,
            undoable: true,
          }),
      );
      return reply.status(200).send(undo ? { subsidyProgram, undo } : { subsidyProgram });
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

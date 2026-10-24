import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { createBudgetLinesBatch } from '../services/budgetLineBatchService.js';
import type { BatchCreateBudgetLinesRequest } from '@cornerstone/shared';

const LINE_TYPES = ['work_item', 'household_item'];

// One flat item schema (no oneOf: AJV removeAdditional would strip fields across branches).
// Required fields per kind are selected with if/then/else; fields of the other kind are ignored.
const batchBudgetLinesSchema = {
  body: {
    type: 'object',
    required: ['lines'],
    properties: {
      invoiceId: { type: 'string', minLength: 1 },
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: 200,
        items: {
          type: 'object',
          required: ['kind'],
          properties: {
            kind: { type: 'string', enum: ['create', 'link'] },
            // create
            targetType: { type: 'string', enum: LINE_TYPES },
            targetId: { type: 'string', minLength: 1 },
            description: { type: ['string', 'null'], maxLength: 500 },
            plannedAmount: { type: 'number', minimum: 0 },
            confidence: {
              type: 'string',
              enum: ['own_estimate', 'professional_estimate', 'quote', 'invoice'],
            },
            budgetCategoryId: { type: ['string', 'null'] },
            budgetSourceId: { type: 'string', minLength: 1 },
            vendorId: { type: ['string', 'null'] },
            quantity: { type: ['number', 'null'], minimum: 0 },
            unit: { type: ['string', 'null'], maxLength: 100 },
            unitPrice: { type: ['number', 'null'], minimum: 0 },
            includesVat: { type: 'boolean' },
            // link
            budgetLineType: { type: 'string', enum: LINE_TYPES },
            budgetLineId: { type: 'string', minLength: 1 },
            itemizedAmount: { type: 'number', exclusiveMinimum: 0 },
          },
          additionalProperties: false,
          // The kind check comes first so an unknown kind reports /lines/<i>/kind.
          allOf: [
            { properties: { kind: { enum: ['create', 'link'] } } },
            {
              if: { properties: { kind: { const: 'create' } } },
              then: { required: ['targetType', 'targetId', 'plannedAmount', 'budgetSourceId'] },
              else: { required: ['budgetLineType', 'budgetLineId', 'itemizedAmount'] },
            },
          ],
        },
      },
    },
    additionalProperties: false,
  },
};

/**
 * POST /api/budget-lines/batch
 * Create and/or link cost lines atomically. Auth required (admin and member).
 */
export default async function budgetLineBatchRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: BatchCreateBudgetLinesRequest }>(
    '/batch',
    { schema: batchBudgetLinesSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = createBudgetLinesBatch(
        fastify.db,
        request.user.id,
        request.body,
        fastify.config.vatRate,
      );

      return reply.status(201).send(result);
    },
  );
}

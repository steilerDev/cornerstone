import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as invoiceBudgetLineService from '../services/invoiceBudgetLineService.js';
import type { CreateInvoiceBudgetLineRequest, UpdateInvoiceBudgetLineRequest } from '@cornerstone/shared';

// JSON schema for GET /api/invoices/:invoiceId/budget-lines
const listBudgetLinesSchema = {
  params: {
    type: 'object',
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/invoices/:invoiceId/budget-lines
const createBudgetLineSchema = {
  body: {
    type: 'object',
    required: ['itemizedAmount'],
    properties: {
      workItemBudgetId: { type: ['string', 'null'] },
      householdItemBudgetId: { type: ['string', 'null'] },
      itemizedAmount: { type: 'number', exclusiveMinimum: 0 },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string' },
    },
  },
};

// JSON schema for PUT /api/invoices/:invoiceId/budget-lines/:id
const updateBudgetLineSchema = {
  body: {
    type: 'object',
    properties: {
      workItemBudgetId: { type: ['string', 'null'] },
      householdItemBudgetId: { type: ['string', 'null'] },
      itemizedAmount: { type: 'number', exclusiveMinimum: 0 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['invoiceId', 'id'],
    properties: {
      invoiceId: { type: 'string' },
      id: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/invoices/:invoiceId/budget-lines/:id
const budgetLineIdParamsSchema = {
  params: {
    type: 'object',
    required: ['invoiceId', 'id'],
    properties: {
      invoiceId: { type: 'string' },
      id: { type: 'string' },
    },
  },
};

export default async function invoiceBudgetLineRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/invoices/:invoiceId/budget-lines
   * List all budget lines for an invoice.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { invoiceId: string } }>(
    '/',
    { schema: listBudgetLinesSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = invoiceBudgetLineService.listInvoiceBudgetLines(fastify.db, request.params.invoiceId);
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/invoices/:invoiceId/budget-lines
   * Create a new invoice budget line.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { invoiceId: string }; Body: CreateInvoiceBudgetLineRequest }>(
    '/',
    { schema: createBudgetLineSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = invoiceBudgetLineService.createInvoiceBudgetLine(
        fastify.db,
        request.params.invoiceId,
        request.body,
      );
      return reply.status(201).send(result);
    },
  );

  /**
   * PUT /api/invoices/:invoiceId/budget-lines/:id
   * Update an invoice budget line.
   * Auth required: Yes (both admin and member)
   */
  fastify.put<{ Params: { invoiceId: string; id: string }; Body: UpdateInvoiceBudgetLineRequest }>(
    '/:id',
    { schema: updateBudgetLineSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = invoiceBudgetLineService.updateInvoiceBudgetLine(
        fastify.db,
        request.params.invoiceId,
        request.params.id,
        request.body,
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * DELETE /api/invoices/:invoiceId/budget-lines/:id
   * Delete an invoice budget line.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { invoiceId: string; id: string } }>(
    '/:id',
    { schema: budgetLineIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      invoiceBudgetLineService.deleteInvoiceBudgetLine(fastify.db, request.params.invoiceId, request.params.id);
      return reply.status(204).send();
    },
  );
}

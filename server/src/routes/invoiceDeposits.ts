import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as invoiceDepositService from '../services/invoiceDepositService.js';
import type { CreateDepositRequest, UpdateDepositRequest } from '@cornerstone/shared';

// JSON schema for GET /api/invoices/:invoiceId/deposits
const listDepositsSchema = {
  params: {
    type: 'object',
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/invoices/:invoiceId/deposits
const createDepositSchema = {
  body: {
    type: 'object',
    required: ['amount', 'dueDate'],
    properties: {
      amount: { type: 'number', exclusiveMinimum: 0 },
      dueDate: { type: 'string' },
      description: { type: ['string', 'null'] },
      status: { type: 'string', enum: ['pending', 'paid', 'claimed'] },
      entryType: { type: 'string', enum: ['deposit', 'refund'] },
      paidDate: { type: ['string', 'null'] },
      claimedDate: { type: ['string', 'null'] },
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

// JSON schema for PATCH /api/invoices/:invoiceId/deposits/:id
const updateDepositSchema = {
  body: {
    type: 'object',
    properties: {
      amount: { type: 'number', exclusiveMinimum: 0 },
      dueDate: { type: 'string' },
      description: { type: ['string', 'null'] },
      status: { type: 'string', enum: ['pending', 'paid', 'claimed'] },
      paidDate: { type: ['string', 'null'] },
      claimedDate: { type: ['string', 'null'] },
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

// JSON schema for DELETE /api/invoices/:invoiceId/deposits/:id
const depositIdParamsSchema = {
  params: {
    type: 'object',
    required: ['invoiceId', 'id'],
    properties: {
      invoiceId: { type: 'string' },
      id: { type: 'string' },
    },
  },
};

export default async function invoiceDepositRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/invoices/:invoiceId/deposits
   * List all deposits for an invoice.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { invoiceId: string } }>(
    '/',
    { schema: listDepositsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = invoiceDepositService.listDepositsForInvoice(
        fastify.db,
        request.params.invoiceId,
      );
      return reply.status(200).send({ deposits: result });
    },
  );

  /**
   * POST /api/invoices/:invoiceId/deposits
   * Create a new invoice deposit.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { invoiceId: string }; Body: CreateDepositRequest }>(
    '/',
    { schema: createDepositSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = invoiceDepositService.createDeposit(
        fastify.db,
        request.params.invoiceId,
        request.body,
        request.user.id,
        fastify.config.diaryAutoEvents,
      );
      return reply.status(201).send({ deposit: result });
    },
  );

  /**
   * PATCH /api/invoices/:invoiceId/deposits/:id
   * Update an invoice deposit.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{
    Params: { invoiceId: string; id: string };
    Body: UpdateDepositRequest;
  }>('/:id', { schema: updateDepositSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const result = invoiceDepositService.updateDeposit(
      fastify.db,
      request.params.invoiceId,
      request.params.id,
      request.body,
      fastify.config.diaryAutoEvents,
    );
    return reply.status(200).send({ deposit: result });
  });

  /**
   * DELETE /api/invoices/:invoiceId/deposits/:id
   * Delete an invoice deposit.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { invoiceId: string; id: string } }>(
    '/:id',
    { schema: depositIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      invoiceDepositService.deleteDeposit(fastify.db, request.params.invoiceId, request.params.id);
      return reply.status(204).send();
    },
  );
}

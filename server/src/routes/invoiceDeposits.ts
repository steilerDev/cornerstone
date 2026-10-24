import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { NotFoundError, UnauthorizedError } from '../errors/AppError.js';
import { invoices } from '../db/schema.js';
import * as invoiceDepositService from '../services/invoiceDepositService.js';
import { issueRestoreToken, runUndoable, undoStore } from '../services/undoService.js';
import type {
  CreateDepositRequest,
  UpdateDepositRequest,
  UndoableDeleteResponse,
} from '@cornerstone/shared';
import { undoableDeleteResponse } from './undoResponseSchema.js';

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
      budgetSourceId: { type: ['string', 'null'] },
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
      budgetSourceId: { type: ['string', 'null'] },
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

// Same params, plus the `200 { undo }` response of the DELETE route
const deleteDepositSchema = { ...depositIdParamsSchema, response: undoableDeleteResponse };

export default async function invoiceDepositRoutes(fastify: FastifyInstance) {
  // The vendor-scoped twin (/api/vendors/:vendorId/invoices/:invoiceId/deposits) must refuse an
  // invoice that belongs to another vendor; the standalone prefix has no :vendorId param.
  fastify.addHook('preHandler', async (request) => {
    const { vendorId, invoiceId } = request.params as { vendorId?: string; invoiceId: string };
    if (vendorId === undefined) return;
    const invoice = fastify.db
      .select({ vendorId: invoices.vendorId })
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .get();
    if (invoice && invoice.vendorId !== vendorId) {
      throw new NotFoundError('Invoice not found');
    }
  });

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

    const userId = request.user.id;
    const { result: deposit, undo } = runUndoable(
      fastify.db,
      undoStore,
      { userId, subject: { type: 'invoice_deposit', id: request.params.id }, reschedules: false },
      () =>
        invoiceDepositService.updateDeposit(
          fastify.db,
          request.params.invoiceId,
          request.params.id,
          request.body,
          { userId, undoable: true },
        ),
    );
    return reply.status(200).send(undo ? { deposit, undo } : { deposit });
  });

  /**
   * DELETE /api/invoices/:invoiceId/deposits/:id
   * Delete an invoice deposit.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { invoiceId: string; id: string } }>(
    '/:id',
    { schema: deleteDepositSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const snapshot = invoiceDepositService.deleteDepositWithSnapshot(
        fastify.db,
        request.params.invoiceId,
        request.params.id,
      );
      const undo = issueRestoreToken(undoStore, {
        userId: request.user.id,
        subject: { type: 'invoice_deposit', id: request.params.id },
        restore: (tx) => invoiceDepositService.restoreDeletedDeposit(tx, snapshot),
      });
      return reply.status(200).send({ undo } satisfies UndoableDeleteResponse);
    },
  );
}

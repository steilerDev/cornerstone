import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as invoiceService from '../services/invoiceService.js';
import type { CreateInvoiceRequest, UpdateInvoiceRequest } from '@cornerstone/shared';

// JSON schema for GET /api/vendors/:vendorId/invoices (list invoices)
const listInvoicesSchema = {
  params: {
    type: 'object',
    required: ['vendorId'],
    properties: {
      vendorId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/vendors/:vendorId/invoices (create invoice)
const createInvoiceSchema = {
  body: {
    type: 'object',
    required: ['amount', 'date'],
    properties: {
      invoiceNumber: { type: ['string', 'null'], maxLength: 100 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      status: { type: 'string', enum: ['pending', 'paid', 'claimed'] },
      notes: { type: ['string', 'null'], maxLength: 10000 },
      workItemBudgetId: { type: ['string', 'null'] },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['vendorId'],
    properties: {
      vendorId: { type: 'string' },
    },
  },
};

// JSON schema for PATCH /api/vendors/:vendorId/invoices/:invoiceId (update invoice)
const updateInvoiceSchema = {
  body: {
    type: 'object',
    properties: {
      invoiceNumber: { type: ['string', 'null'], maxLength: 100 },
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      status: { type: 'string', enum: ['pending', 'paid', 'claimed'] },
      notes: { type: ['string', 'null'], maxLength: 10000 },
      workItemBudgetId: { type: ['string', 'null'] },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['vendorId', 'invoiceId'],
    properties: {
      vendorId: { type: 'string' },
      invoiceId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/vendors/:vendorId/invoices/:invoiceId
const invoiceIdParamsSchema = {
  params: {
    type: 'object',
    required: ['vendorId', 'invoiceId'],
    properties: {
      vendorId: { type: 'string' },
      invoiceId: { type: 'string' },
    },
  },
};

export default async function invoiceRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/vendors/:vendorId/invoices
   * List all invoices for a vendor, sorted by date descending.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { vendorId: string } }>(
    '/',
    { schema: listInvoicesSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const invoices = invoiceService.listInvoices(fastify.db, request.params.vendorId);
      return reply.status(200).send({ invoices });
    },
  );

  /**
   * POST /api/vendors/:vendorId/invoices
   * Create a new invoice for a vendor.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { vendorId: string }; Body: CreateInvoiceRequest }>(
    '/',
    { schema: createInvoiceSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const invoice = invoiceService.createInvoice(
        fastify.db,
        request.params.vendorId,
        request.body,
        request.user.id,
      );
      return reply.status(201).send({ invoice });
    },
  );

  /**
   * PATCH /api/vendors/:vendorId/invoices/:invoiceId
   * Partial update of an invoice.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { vendorId: string; invoiceId: string }; Body: UpdateInvoiceRequest }>(
    '/:invoiceId',
    { schema: updateInvoiceSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const invoice = invoiceService.updateInvoice(
        fastify.db,
        request.params.vendorId,
        request.params.invoiceId,
        request.body,
      );
      return reply.status(200).send({ invoice });
    },
  );

  /**
   * DELETE /api/vendors/:vendorId/invoices/:invoiceId
   * Delete an invoice.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { vendorId: string; invoiceId: string } }>(
    '/:invoiceId',
    { schema: invoiceIdParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      invoiceService.deleteInvoice(fastify.db, request.params.vendorId, request.params.invoiceId);
      return reply.status(204).send();
    },
  );
}

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as invoiceService from '../services/invoiceService.js';

const listAllInvoicesSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      q: { type: 'string', maxLength: 200 },
      status: { type: 'string', enum: ['pending', 'paid', 'claimed'] },
      vendorId: { type: 'string' },
      sortBy: { type: 'string', enum: ['date', 'amount', 'status', 'vendor_name', 'due_date'] },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
    },
    additionalProperties: false,
  },
};

const getInvoiceByIdSchema = {
  params: {
    type: 'object',
    required: ['invoiceId'],
    properties: {
      invoiceId: { type: 'string' },
    },
  },
};

interface ListAllInvoicesQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'pending' | 'paid' | 'claimed';
  vendorId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export default async function standaloneInvoiceRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/invoices
   * List all invoices across all vendors with pagination, filtering, and sorting.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Querystring: ListAllInvoicesQuery }>(
    '/',
    { schema: listAllInvoicesSchema },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      const result = invoiceService.listAllInvoices(fastify.db, request.query);
      return reply.status(200).send(result);
    },
  );

  /**
   * GET /api/invoices/:invoiceId
   * Get a single invoice by ID (cross-vendor).
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { invoiceId: string } }>(
    '/:invoiceId',
    { schema: getInvoiceByIdSchema },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      const invoice = invoiceService.getInvoiceById(fastify.db, request.params.invoiceId);
      return reply.status(200).send({ invoice });
    },
  );
}

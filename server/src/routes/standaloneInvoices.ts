import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import type { ConvertQuotationRequest } from '@cornerstone/shared';
import * as invoiceService from '../services/invoiceService.js';
import { convertQuotation } from '../services/quotationConversionService.js';

const listAllInvoicesSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      q: { type: 'string', maxLength: 200 },
      status: { type: 'string', enum: ['pending', 'paid', 'claimed', 'quotation'] },
      vendorId: { type: 'string' },
      amountMin: { type: 'number' },
      amountMax: { type: 'number' },
      dateFrom: { type: 'string' },
      dateTo: { type: 'string' },
      dueDateFrom: { type: 'string' },
      dueDateTo: { type: 'string' },
      sortBy: { type: 'string', enum: ['date', 'amount', 'status', 'vendor_name', 'due_date'] },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
      openOnly: { type: 'boolean' },
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

const convertQuotationSchema = {
  params: {
    type: 'object',
    required: ['invoiceId'],
    properties: { invoiceId: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['amount', 'date', 'status', 'conversionNote'],
    additionalProperties: false,
    properties: {
      amount: { type: 'number', exclusiveMinimum: 0 },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      invoiceNumber: { type: ['string', 'null'], maxLength: 100 },
      dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      notes: { type: ['string', 'null'], maxLength: 10000 },
      status: { type: 'string', enum: ['pending', 'paid'] },
      conversionNote: { type: 'string', minLength: 1, maxLength: 1000 },
      budgetLines: {
        type: 'array',
        maxItems: 200,
        items: {
          type: 'object',
          required: ['id', 'itemizedAmount'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1 },
            itemizedAmount: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      },
      paperlessDocumentId: { type: 'integer', minimum: 1 },
    },
  },
};

interface ListAllInvoicesQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: 'pending' | 'paid' | 'claimed' | 'quotation';
  vendorId?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  openOnly?: boolean;
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

  /**
   * POST /api/invoices/:invoiceId/convert-quotation
   * Atomically convert a quotation into the final invoice (Story #2107).
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { invoiceId: string }; Body: ConvertQuotationRequest }>(
    '/:invoiceId/convert-quotation',
    { schema: convertQuotationSchema },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      const invoice = convertQuotation(
        fastify.db,
        request.params.invoiceId,
        request.body,
        request.user.id,
        fastify.config.diaryAutoEvents,
      );
      return reply.status(200).send({ invoice });
    },
  );
}

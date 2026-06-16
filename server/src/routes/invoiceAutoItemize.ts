/**
 * Invoice auto-itemize routes.
 *
 * EPIC-16 Story #1547: Handles POST /api/invoices/:invoiceId/auto-itemize
 * for automatic line item extraction from Paperless-ngx OCR.
 *
 * EPIC-18 Story #1679: Added preview and create-on-confirm routes.
 */

import type { FastifyInstance } from 'fastify';
import { AppError, UnauthorizedError } from '../errors/AppError.js';
import * as svc from '../services/invoiceAutoItemizeService.js';
import type { AutoItemizeRequestBody } from '../services/invoiceAutoItemizeService.js';
import type { AutoItemizePreviewRequest, AutoItemizeCommitRequest } from '@cornerstone/shared';

// Per-line JSON schema for both existing and new endpoints
const lineItemSchema = {
  type: 'object',
  required: ['description', 'totalAmount', 'confidence'],
  properties: {
    description: { type: 'string', minLength: 1, maxLength: 1000 },
    quantity: { type: ['number', 'null'] },
    unit: { type: ['string', 'null'], maxLength: 100 },
    unitPrice: { type: ['number', 'null'] },
    totalAmount: { type: 'number', minimum: 0 },
    includesVat: { type: ['boolean', 'null'] },
    vatRate: { type: ['number', 'null'] },
    vendorName: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    assignedBudgetLineId: { type: ['string', 'null'] },
    assignedBudgetLineType: {
      type: ['string', 'null'],
      enum: ['work_item', 'household_item', null],
    },
    assignmentMode: {
      type: ['string', 'null'],
      enum: ['create-new', 'assign-existing', null],
    },
    budgetCategoryId: { type: ['string', 'null'], maxLength: 36 },
    budgetSourceId: { type: ['string', 'null'], maxLength: 36 },
  },
  additionalProperties: false,
};

export default async function invoiceAutoItemizeRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/invoices/auto-itemize/preview
   *
   * Preview auto-itemize: stateless LLM extraction with vendor matching.
   * No database writes. Fetches vendors and injects into LLM prompt.
   *
   * Auth required: Yes
   *
   * EPIC-18 Story #1679: Paperless-first invoice creation preview.
   */
  const previewSchema = {
    body: {
      type: 'object',
      required: ['paperlessDocumentId'],
      properties: {
        paperlessDocumentId: { type: 'integer', minimum: 1 },
        locale: { type: 'string', maxLength: 20 },
      },
      additionalProperties: false,
    },
  };

  fastify.post<{ Body: AutoItemizePreviewRequest }>(
    '/auto-itemize/preview',
    { schema: previewSchema },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      if (!fastify.config.paperlessEnabled) {
        throw new AppError(
          'PAPERLESS_NOT_CONFIGURED',
          503,
          'Paperless-ngx integration is not configured',
        );
      }

      const result = await svc.previewAutoItemize(fastify.db, fastify.config, request.body, {
        url: fastify.config.paperlessUrl!,
        apiToken: fastify.config.paperlessApiToken!,
      });

      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/invoices/auto-itemize/commit
   *
   * Create invoice and itemize in a single atomic transaction.
   * Validates vendor, inserts invoice and document_links, then itemizes reviewed lines.
   *
   * Auth required: Yes
   *
   * EPIC-18 Story #1679: Paperless-first invoice creation create-on-confirm.
   */
  const commitSchema = {
    body: {
      type: 'object',
      required: ['paperlessDocumentId', 'vendorId', 'invoice', 'lines'],
      properties: {
        paperlessDocumentId: { type: 'integer', minimum: 1 },
        vendorId: { type: 'string', minLength: 1, maxLength: 36 },
        invoice: {
          type: 'object',
          required: ['amount', 'date'],
          properties: {
            invoiceNumber: { type: ['string', 'null'], maxLength: 255 },
            amount: { type: 'number', exclusiveMinimum: 0 },
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            notes: { type: ['string', 'null'], maxLength: 10000 },
            status: { type: 'string', enum: ['pending', 'paid', 'claimed', 'quotation'] },
          },
          additionalProperties: false,
        },
        lines: {
          type: 'array',
          maxItems: 200,
          items: lineItemSchema,
        },
      },
      additionalProperties: false,
    },
  };

  fastify.post<{ Body: AutoItemizeCommitRequest }>(
    '/auto-itemize/commit',
    { schema: commitSchema },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();
      if (!fastify.config.paperlessEnabled) {
        throw new AppError(
          'PAPERLESS_NOT_CONFIGURED',
          503,
          'Paperless-ngx integration is not configured',
        );
      }

      const result = await svc.commitAutoItemizeCreate(
        fastify.db,
        fastify.config,
        request.user.id,
        request.body,
      );

      return reply.status(201).send(result);
    },
  );

  /**
   * POST /api/invoices/:invoiceId/auto-itemize
   * Auto-itemize an invoice by extracting line items from Paperless-ngx OCR.
   *
   * Auth required: Yes (member or admin)
   *
   * Request body:
   * - paperlessDocumentId (required): Paperless document ID linked to this invoice
   * - mode (required): 'append' or 'replace' (replace deletes existing auto-extracted lines)
   * - dryRun (required): true = extract only, false = persist
   * - lines (required if dryRun=false): Array of ExtractedLine objects (from dry-run response)
   *
   * Responses:
   * - dryRun=true: { lines: ExtractedLine[], warnings: AutoItemizeWarning[] }
   * - dryRun=false: { budgetLines: InvoiceBudgetLineDetailResponse[], remainingAmount: number }
   */
  const existingSchema = {
    body: {
      type: 'object',
      required: ['paperlessDocumentId', 'mode', 'dryRun'],
      properties: {
        paperlessDocumentId: { type: 'integer', minimum: 1 },
        mode: { type: 'string', enum: ['append', 'replace'] },
        dryRun: { type: 'boolean' },
        lines: {
          type: 'array',
          maxItems: 200,
          items: lineItemSchema,
        },
        invoicePatch: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            invoiceNumber: { type: ['string', 'null'], maxLength: 255 },
            amount: { type: 'number', exclusiveMinimum: 0 },
            date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            dueDate: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            notes: { type: ['string', 'null'], maxLength: 10000 },
            status: { type: 'string', enum: ['pending', 'paid', 'claimed', 'quotation'] },
          },
        },
      },
      additionalProperties: false,
    },
    params: {
      type: 'object',
      required: ['invoiceId'],
      properties: { invoiceId: { type: 'string' } },
    },
  };

  fastify.post<{ Params: { invoiceId: string }; Body: AutoItemizeRequestBody }>(
    '/:invoiceId/auto-itemize',
    { schema: existingSchema },
    async (request, reply) => {
      if (!request.user) throw new UnauthorizedError();

      const result = await svc.autoItemize(
        fastify.db,
        fastify.config,
        request.params.invoiceId,
        request.user.id,
        request.body,
        {
          url: fastify.config.paperlessUrl!,
          apiToken: fastify.config.paperlessApiToken!,
        },
      );

      return reply.status(200).send(result);
    },
  );
}

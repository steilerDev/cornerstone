/**
 * Invoice auto-itemize routes.
 *
 * EPIC-16 Story #1547: Handles POST /api/invoices/:invoiceId/auto-itemize
 * for automatic line item extraction from Paperless-ngx OCR.
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as svc from '../services/invoiceAutoItemizeService.js';
import type { AutoItemizeRequestBody } from '../services/invoiceAutoItemizeService.js';

const schema = {
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
        items: {
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
          },
          additionalProperties: false,
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

export default async function invoiceAutoItemizeRoutes(fastify: FastifyInstance) {
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
  fastify.post<{ Params: { invoiceId: string }; Body: AutoItemizeRequestBody }>(
    '/:invoiceId/auto-itemize',
    { schema },
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

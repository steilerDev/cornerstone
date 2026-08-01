import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getSourceReport, markInvoicesClaimed } from '../services/sourceReportService.js';
import { generateReportContent } from '../services/reportContentGenerationService.js';
import type {
  SourceReportType,
  MarkClaimedRequest,
  GenerateReportContentRequest,
} from '@cornerstone/shared';

export default async function sourceReportRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/source-reports
   * Returns a source report for a given budget source and report type.
   * Query params: type (budget-overview|claim|proof-of-funds), sourceId (required)
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{
    Querystring: {
      type?: string;
      sourceId?: string;
    };
  }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['budget-overview', 'claim', 'proof-of-funds'] },
            sourceId: { type: 'string' },
          },
          required: ['type', 'sourceId'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { type, sourceId } = request.query;

      const report = await getSourceReport(
        fastify.db,
        type as SourceReportType,
        sourceId as string,
        {
          paperlessEnabled: fastify.config.paperlessEnabled,
          paperlessUrl: fastify.config.paperlessUrl,
          paperlessApiToken: fastify.config.paperlessApiToken,
        },
      );

      return reply.status(200).send({ report });
    },
  );

  /**
   * POST /api/source-reports/mark-claimed
   * Mark a batch of invoices as claimed within a budget source scope, with source-scoped deposit sweep.
   * Body: { sourceId: string, invoiceIds: string[], depositIds: string[] }
   * Returns: { claimedInvoiceIds: string[], claimedDepositIds: string[] }
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{
    Body: MarkClaimedRequest;
  }>(
    '/mark-claimed',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            sourceId: {
              type: 'string',
              minLength: 1,
            },
            invoiceIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
            depositIds: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['sourceId', 'invoiceIds', 'depositIds'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { sourceId, invoiceIds, depositIds } = request.body;

      const response = markInvoicesClaimed(
        fastify.db,
        sourceId,
        invoiceIds,
        depositIds,
        fastify.config.diaryAutoEvents,
      );

      return reply.status(200).send(response);
    },
  );

  /**
   * POST /api/source-reports/generate-content
   * Generate AI-assisted report content (cover letter + invoice descriptions).
   * Body: { type, sourceId, language, includedInvoiceIds, excludedLineIds? }
   * Returns: { letterSubject, letterBody, descriptions }
   * Auth required: Yes (both admin and member)
   * Story #1901
   */
  fastify.post<{
    Body: GenerateReportContentRequest;
  }>(
    '/generate-content',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['budget-overview', 'claim', 'proof-of-funds'] },
            sourceId: { type: 'string', minLength: 1, maxLength: 100 },
            language: { type: 'string', enum: ['en', 'de'] },
            includedInvoiceIds: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 100 },
              minItems: 1,
              maxItems: 200,
            },
            excludedLineIds: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 500,
            },
          },
          required: ['type', 'sourceId', 'language', 'includedInvoiceIds'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = await generateReportContent(fastify.db, fastify.config, request.body);

      return reply.status(200).send(result);
    },
  );
}

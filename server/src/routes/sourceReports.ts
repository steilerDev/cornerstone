import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { getSourceReport, markInvoicesClaimed } from '../services/sourceReportService.js';
import type { SourceReportType, MarkClaimedRequest } from '@cornerstone/shared';

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
   * Mark a batch of invoices as claimed.
   * Body: { invoiceIds: string[] }
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
            invoiceIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
            },
          },
          required: ['invoiceIds'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const { invoiceIds } = request.body;

      const response = markInvoicesClaimed(fastify.db, invoiceIds, fastify.config.diaryAutoEvents);

      return reply.status(200).send(response);
    },
  );
}

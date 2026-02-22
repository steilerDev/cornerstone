import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as workItemVendorService from '../services/workItemVendorService.js';

// JSON schema for path params with workItemId only
const workItemParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/work-items/:workItemId/vendors
const linkVendorSchema = {
  body: {
    type: 'object',
    required: ['vendorId'],
    properties: {
      vendorId: { type: 'string' },
    },
    additionalProperties: false,
  },
  params: {
    type: 'object',
    required: ['workItemId'],
    properties: {
      workItemId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/work-items/:workItemId/vendors/:vendorId
const vendorLinkParamsSchema = {
  params: {
    type: 'object',
    required: ['workItemId', 'vendorId'],
    properties: {
      workItemId: { type: 'string' },
      vendorId: { type: 'string' },
    },
  },
};

export default async function workItemVendorRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/work-items/:workItemId/vendors
   * List all vendors linked to a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { workItemId: string } }>(
    '/',
    { schema: workItemParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const vendors = workItemVendorService.listWorkItemVendors(
        fastify.db,
        request.params.workItemId,
      );
      return reply.status(200).send({ vendors });
    },
  );

  /**
   * POST /api/work-items/:workItemId/vendors
   * Link a vendor to a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { workItemId: string }; Body: { vendorId: string } }>(
    '/',
    { schema: linkVendorSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const vendor = workItemVendorService.linkVendorToWorkItem(
        fastify.db,
        request.params.workItemId,
        request.body.vendorId,
      );
      return reply.status(201).send({ vendor });
    },
  );

  /**
   * DELETE /api/work-items/:workItemId/vendors/:vendorId
   * Unlink a vendor from a work item.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { workItemId: string; vendorId: string } }>(
    '/:vendorId',
    { schema: vendorLinkParamsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      workItemVendorService.unlinkVendorFromWorkItem(
        fastify.db,
        request.params.workItemId,
        request.params.vendorId,
      );
      return reply.status(204).send();
    },
  );
}

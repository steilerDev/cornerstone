import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as vendorService from '../services/vendorService.js';
import * as vendorRelationsService from '../services/vendorRelationsService.js';
import { parseTradeIds } from '../services/shared/tradeIdsParam.js';
import { SEARCH_QUERY_RAW_MAX_LENGTH, VENDOR_SORT_FIELDS } from '@cornerstone/shared';
import type {
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
} from '@cornerstone/shared';

// JSON schema for GET /api/vendors (list vendors with optional search and pagination)
const listVendorsSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      q: { type: 'string', maxLength: SEARCH_QUERY_RAW_MAX_LENGTH },
      // Count and id length limits are enforced by parseTradeIds; this only caps the raw string.
      tradeIds: { type: 'string', maxLength: 8000 },
      tradeId: { type: 'string' },
      sortBy: {
        type: 'string',
        enum: [...VENDOR_SORT_FIELDS],
      },
      sortOrder: { type: 'string', enum: ['asc', 'desc'] },
    },
    additionalProperties: false,
  },
};

// JSON schema for POST /api/vendors (create vendor)
const createVendorSchema = {
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      tradeId: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'], maxLength: 50 },
      email: { type: ['string', 'null'], maxLength: 255, format: 'email' },
      address: { type: ['string', 'null'], maxLength: 500 },
      notes: { type: ['string', 'null'], maxLength: 10000 },
    },
    additionalProperties: false,
  },
};

// JSON schema for PATCH /api/vendors/:id (update vendor)
const updateVendorSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      tradeId: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'], maxLength: 50 },
      email: { type: ['string', 'null'], maxLength: 255, format: 'email' },
      address: { type: ['string', 'null'], maxLength: 500 },
      notes: { type: ['string', 'null'], maxLength: 10000 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

// JSON schema for path parameter validation (GET by ID / DELETE)
const vendorIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
};

export default async function vendorRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/vendors
   * List vendors with optional search, sorting, and pagination.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Querystring: VendorListQuery }>(
    '/',
    { schema: listVendorsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const result = vendorService.listVendors(
        fastify.db,
        request.query,
        parseTradeIds(request.query.tradeIds),
      );
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/vendors
   * Create a new vendor.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Body: CreateVendorRequest }>(
    '/',
    { schema: createVendorSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const vendor = vendorService.createVendor(fastify.db, request.body, request.user.id);
      return reply.status(201).send({ vendor });
    },
  );

  /**
   * GET /api/vendors/:id
   * Get a single vendor by ID, including invoice statistics.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    { schema: vendorIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const vendor = vendorService.getVendorById(fastify.db, request.params.id);
      return reply.status(200).send({ vendor });
    },
  );

  /**
   * GET /api/vendors/:id/relations
   * Work items, household items and budget lines attached to the company (contract 13).
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/relations',
    { schema: vendorIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const relations = vendorRelationsService.getVendorRelations(fastify.db, request.params.id);
      return reply.status(200).send(relations);
    },
  );

  /**
   * PATCH /api/vendors/:id
   * Update a vendor's details (partial update).
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{ Params: { id: string }; Body: UpdateVendorRequest }>(
    '/:id',
    { schema: updateVendorSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const vendor = vendorService.updateVendor(fastify.db, request.params.id, request.body);
      return reply.status(200).send({ vendor });
    },
  );

  /**
   * DELETE /api/vendors/:id
   * Delete a vendor.
   * Returns 409 VENDOR_IN_USE with { invoiceCount, workItemCount } if the vendor is referenced.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: vendorIdSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      vendorService.deleteVendor(fastify.db, request.params.id);
      return reply.status(204).send();
    },
  );
}

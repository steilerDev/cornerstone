import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as vendorService from '../services/vendorService.js';
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
      q: { type: 'string' },
      sortBy: {
        type: 'string',
        enum: ['name', 'specialty', 'created_at', 'updated_at'],
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
      specialty: { type: ['string', 'null'], maxLength: 200 },
      phone: { type: ['string', 'null'], maxLength: 50 },
      email: { type: ['string', 'null'], maxLength: 255 },
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
      specialty: { type: ['string', 'null'], maxLength: 200 },
      phone: { type: ['string', 'null'], maxLength: 50 },
      email: { type: ['string', 'null'], maxLength: 255 },
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

      const result = vendorService.listVendors(fastify.db, request.query);
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

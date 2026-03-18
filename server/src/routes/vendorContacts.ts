import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import * as vendorContactService from '../services/vendorContactService.js';
import type { CreateVendorContactRequest, UpdateVendorContactRequest } from '@cornerstone/shared';

// JSON schema for GET /api/vendors/:vendorId/contacts (list contacts)
const listContactsSchema = {
  params: {
    type: 'object',
    required: ['vendorId'],
    properties: {
      vendorId: { type: 'string' },
    },
  },
};

// JSON schema for POST /api/vendors/:vendorId/contacts (create contact)
const createContactSchema = {
  body: {
    type: 'object',
    properties: {
      firstName: { type: ['string', 'null'], maxLength: 100 },
      lastName: { type: ['string', 'null'], maxLength: 100 },
      role: { type: ['string', 'null'], maxLength: 100 },
      phone: { type: ['string', 'null'], maxLength: 50 },
      email: { type: ['string', 'null'], maxLength: 255, format: 'email' },
      notes: { type: ['string', 'null'], maxLength: 2000 },
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

// JSON schema for PATCH /api/vendors/:vendorId/contacts/:contactId (update contact)
const updateContactSchema = {
  body: {
    type: 'object',
    properties: {
      firstName: { type: ['string', 'null'], maxLength: 100 },
      lastName: { type: ['string', 'null'], maxLength: 100 },
      role: { type: ['string', 'null'], maxLength: 100 },
      phone: { type: ['string', 'null'], maxLength: 50 },
      email: { type: ['string', 'null'], maxLength: 255, format: 'email' },
      notes: { type: ['string', 'null'], maxLength: 2000 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  params: {
    type: 'object',
    required: ['vendorId', 'contactId'],
    properties: {
      vendorId: { type: 'string' },
      contactId: { type: 'string' },
    },
  },
};

// JSON schema for DELETE /api/vendors/:vendorId/contacts/:contactId
const deleteContactSchema = {
  params: {
    type: 'object',
    required: ['vendorId', 'contactId'],
    properties: {
      vendorId: { type: 'string' },
      contactId: { type: 'string' },
    },
  },
};

export default async function vendorContactRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/vendors/:vendorId/contacts
   * List all contacts for a vendor.
   * Auth required: Yes (both admin and member)
   */
  fastify.get<{ Params: { vendorId: string } }>(
    '/',
    { schema: listContactsSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const contacts = vendorContactService.listContacts(fastify.db, request.params.vendorId);
      return reply.status(200).send({ contacts });
    },
  );

  /**
   * POST /api/vendors/:vendorId/contacts
   * Create a new contact for a vendor.
   * Auth required: Yes (both admin and member)
   */
  fastify.post<{ Params: { vendorId: string }; Body: CreateVendorContactRequest }>(
    '/',
    { schema: createContactSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const contact = vendorContactService.createContact(
        fastify.db,
        request.params.vendorId,
        request.body,
      );
      return reply.status(201).send({ contact });
    },
  );

  /**
   * PATCH /api/vendors/:vendorId/contacts/:contactId
   * Update an existing contact.
   * Auth required: Yes (both admin and member)
   */
  fastify.patch<{
    Params: { vendorId: string; contactId: string };
    Body: UpdateVendorContactRequest;
  }>('/:contactId', { schema: updateContactSchema }, async (request, reply) => {
    if (!request.user) {
      throw new UnauthorizedError();
    }

    const contact = vendorContactService.updateContact(
      fastify.db,
      request.params.vendorId,
      request.params.contactId,
      request.body,
    );
    return reply.status(200).send({ contact });
  });

  /**
   * DELETE /api/vendors/:vendorId/contacts/:contactId
   * Delete a contact.
   * Auth required: Yes (both admin and member)
   */
  fastify.delete<{ Params: { vendorId: string; contactId: string } }>(
    '/:contactId',
    { schema: deleteContactSchema },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      vendorContactService.deleteContact(
        fastify.db,
        request.params.vendorId,
        request.params.contactId,
      );
      return reply.status(204).send();
    },
  );
}

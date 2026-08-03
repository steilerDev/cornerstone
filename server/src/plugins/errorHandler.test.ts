import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import { buildApp } from '../app.js';
import { AppError, NotFoundError, ValidationError } from '../errors/AppError.js';

describe('Error Handler Plugin', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-error-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('AppError handling', () => {
    it('maps AppError to correct status and ApiErrorResponse shape', async () => {
      app = await buildApp();

      app.get('/test/not-found', async () => {
        throw new NotFoundError('User not found', { id: 42 });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/not-found',
      });

      expect(response.statusCode).toBe(404);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
          details: { id: 42 },
        },
      });
    });

    it('omits details when not provided', async () => {
      app = await buildApp();

      app.get('/test/validation', async () => {
        throw new ValidationError('Name is required');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/validation',
      });

      expect(response.statusCode).toBe(400);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name is required',
        },
      });
      expect(body.error.details).toBeUndefined();
    });

    it('handles custom AppError with arbitrary code and status', async () => {
      app = await buildApp();

      app.get('/test/conflict', async () => {
        throw new AppError('CONFLICT', 409, 'Duplicate entry', { field: 'email' });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/conflict',
      });

      expect(response.statusCode).toBe(409);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('Duplicate entry');
      expect(body.error.details).toEqual({ field: 'email' });
    });
  });

  describe('Fastify validation error handling', () => {
    it('returns 400 with field-level details for schema validation errors', async () => {
      app = await buildApp();

      app.post(
        '/test/validated',
        {
          schema: {
            body: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                age: { type: 'number' },
              },
            },
          },
        },
        async (request) => {
          return { ok: true, data: request.body };
        },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/test/validated',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ age: 'not-a-number' }),
      });

      expect(response.statusCode).toBe(400);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Validation failed');
      expect(body.error.details).toBeDefined();
      expect(body.error.details!.fields).toBeDefined();
      expect(Array.isArray(body.error.details!.fields)).toBe(true);
    });
  });

  describe('Unknown error handling', () => {
    it('returns 500 with original message in development mode', async () => {
      process.env.NODE_ENV = 'development';
      app = await buildApp();

      app.get('/test/crash', async () => {
        throw new Error('Something unexpected happened');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/crash',
      });

      expect(response.statusCode).toBe(500);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Something unexpected happened');
    });

    it('returns 500 with sanitized message in production mode', async () => {
      process.env.NODE_ENV = 'production';
      app = await buildApp();

      app.get('/test/crash', async () => {
        throw new Error('Database connection string: secret://password@host');
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/crash',
      });

      expect(response.statusCode).toBe(500);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An internal error occurred');
      expect(body.error.message).not.toContain('secret');
    });
  });

  describe('Fastify internal error code mapping', () => {
    it('maps FST_ERR_CTP_BODY_TOO_LARGE to PAYLOAD_TOO_LARGE with status 413', async () => {
      app = await buildApp();

      app.post('/test/echo-body', async (request) => {
        return { received: request.body };
      });

      const oversizedPayload = JSON.stringify({ data: 'x'.repeat(2 * 1024 * 1024) });

      const response = await app.inject({
        method: 'POST',
        url: '/test/echo-body',
        headers: { 'content-type': 'application/json' },
        payload: oversizedPayload,
      });

      expect(response.statusCode).toBe(413);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('maps FST_ERR_CTP_INVALID_JSON_BODY to VALIDATION_ERROR with status 400', async () => {
      app = await buildApp();

      app.post('/test/echo-body', async (request) => {
        return { received: request.body };
      });

      const response = await app.inject({
        method: 'POST',
        url: '/test/echo-body',
        headers: { 'content-type': 'application/json' },
        payload: '{not valid json',
      });

      expect(response.statusCode).toBe(400);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps FST_ERR_CTP_EMPTY_JSON_BODY to VALIDATION_ERROR with status 400', async () => {
      app = await buildApp();

      app.post('/test/echo-body', async (request) => {
        return { received: request.body };
      });

      const response = await app.inject({
        method: 'POST',
        url: '/test/echo-body',
        headers: { 'content-type': 'application/json' },
        payload: '',
      });

      expect(response.statusCode).toBe(400);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('maps FST_REQ_FILE_TOO_LARGE to PAYLOAD_TOO_LARGE with status 413', async () => {
      app = await buildApp();

      app.get('/test/multipart-file-too-large', async () => {
        const err = new Error('request file too large') as Error & {
          code: string;
          statusCode: number;
        };
        err.code = 'FST_REQ_FILE_TOO_LARGE';
        err.statusCode = 413;
        throw err;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/multipart-file-too-large',
      });

      expect(response.statusCode).toBe(413);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('falls back to VALIDATION_ERROR for an unmapped code with statusCode < 500', async () => {
      app = await buildApp();

      app.get('/test/unmapped-400', async () => {
        const err = new Error('some unmapped client error') as Error & {
          code: string;
          statusCode: number;
        };
        err.code = 'FST_ERR_SOME_UNMAPPED_CODE';
        err.statusCode = 400;
        throw err;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/unmapped-400',
      });

      expect(response.statusCode).toBe(400);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('falls back to INTERNAL_ERROR for an unmapped code with statusCode >= 500', async () => {
      app = await buildApp();

      app.get('/test/unmapped-500', async () => {
        const err = new Error('some unmapped server error') as Error & {
          code: string;
          statusCode: number;
        };
        err.code = 'FST_ERR_SOME_UNMAPPED_CODE';
        err.statusCode = 500;
        throw err;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/unmapped-500',
      });

      expect(response.statusCode).toBe(500);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('falls back to VALIDATION_ERROR when statusCode is present but code is missing', async () => {
      app = await buildApp();

      app.get('/test/no-code', async () => {
        const err = new Error('error with no code') as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/test/no-code',
      });

      expect(response.statusCode).toBe(400);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.code).not.toBe('undefined');
      expect(body.error.code).not.toBe('REQUEST_ERROR');
    });
  });

  describe('Not-found handler', () => {
    it('returns 404 ROUTE_NOT_FOUND for unknown API routes', async () => {
      app = await buildApp();

      const response = await app.inject({
        method: 'GET',
        url: '/api/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body).toEqual({
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: 'Route GET /api/nonexistent not found',
        },
      });
    });

    it('returns 404 ROUTE_NOT_FOUND for different HTTP methods', async () => {
      app = await buildApp();

      const response = await app.inject({
        method: 'POST',
        url: '/api/does-not-exist',
      });

      expect(response.statusCode).toBe(404);
      const body: ApiErrorResponse = JSON.parse(response.body);
      expect(body.error.code).toBe('ROUTE_NOT_FOUND');
      expect(body.error.message).toContain('POST');
      expect(body.error.message).toContain('/api/does-not-exist');
    });
  });
});

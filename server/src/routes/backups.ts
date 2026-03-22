/**
 * Backup and restore API routes.
 *
 * EPIC-19: Backup and Restore Feature
 *
 * POST   /api/backups              — Create manual backup (admin only)
 * GET    /api/backups              — List all backups (admin only)
 * POST   /api/backups/:filename/restore — Restore from backup (admin only)
 * DELETE /api/backups/:filename    — Delete backup file (admin only)
 *
 * All endpoints return 503 BACKUP_NOT_CONFIGURED if BACKUP_DIR is not set.
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError, BackupNotConfiguredError } from '../errors/AppError.js';
import { requireRole } from '../plugins/auth.js';
import * as backupService from '../services/backupService.js';
import type { BackupResponse, BackupListResponse, RestoreInitiatedResponse } from '@cornerstone/shared';

// JSON schemas
const createBackupSchema = {
  response: {
    201: {
      type: 'object',
      required: ['backup'],
      properties: {
        backup: {
          type: 'object',
          required: ['filename', 'createdAt', 'sizeBytes'],
          properties: {
            filename: { type: 'string' },
            createdAt: { type: 'string' },
            sizeBytes: { type: 'number' },
          },
        },
      },
    },
  },
};

const listBackupsSchema = {
  response: {
    200: {
      type: 'object',
      required: ['backups'],
      properties: {
        backups: {
          type: 'array',
          items: {
            type: 'object',
            required: ['filename', 'createdAt', 'sizeBytes'],
            properties: {
              filename: { type: 'string' },
              createdAt: { type: 'string' },
              sizeBytes: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

const backupFilenameParamsSchema = {
  params: {
    type: 'object',
    required: ['filename'],
    properties: {
      filename: { type: 'string', minLength: 1 },
    },
  },
};

const restoreBackupSchema = {
  response: {
    202: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string' },
      },
    },
  },
};

export default async function backupRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/backups
   *
   * Create a manual backup of the database and app data.
   * Returns 201 with backup metadata.
   * Admin only.
   */
  fastify.post<{ Reply: BackupResponse }>(
    '/',
    {
      schema: createBackupSchema,
      preHandler: requireRole('admin'),
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      if (!fastify.config.backupEnabled) {
        throw new BackupNotConfiguredError();
      }

      const backup = await backupService.createBackup(fastify.db, fastify.config);
      return reply.status(201).send({ backup });
    },
  );

  /**
   * GET /api/backups
   *
   * List all available backups.
   * Returns 200 with array of backup metadata, sorted newest-first.
   * Admin only.
   */
  fastify.get<{ Reply: BackupListResponse }>(
    '/',
    {
      schema: listBackupsSchema,
      preHandler: requireRole('admin'),
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      if (!fastify.config.backupEnabled) {
        throw new BackupNotConfiguredError();
      }

      const backups = await backupService.listBackups(fastify.config.backupDir!);
      return reply.status(200).send({ backups });
    },
  );

  /**
   * DELETE /api/backups/:filename
   *
   * Delete a specific backup file.
   * Returns 204 No Content on success.
   * Admin only.
   */
  fastify.delete<{ Params: { filename: string } }>(
    '/:filename',
    {
      schema: backupFilenameParamsSchema,
      preHandler: requireRole('admin'),
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      if (!fastify.config.backupEnabled) {
        throw new BackupNotConfiguredError();
      }

      await backupService.deleteBackup(fastify.config.backupDir!, request.params.filename);
      return reply.status(204).send();
    },
  );

  /**
   * POST /api/backups/:filename/restore
   *
   * Restore the database and app data from a backup.
   * Returns 202 Accepted immediately, then restores asynchronously and exits.
   * Admin only.
   */
  fastify.post<{ Params: { filename: string }; Reply: RestoreInitiatedResponse }>(
    '/:filename/restore',
    {
      schema: {
        ...backupFilenameParamsSchema,
        ...restoreBackupSchema,
      },
      preHandler: requireRole('admin'),
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      if (!fastify.config.backupEnabled) {
        throw new BackupNotConfiguredError();
      }

      // Send 202 Accepted immediately
      reply.status(202).send({
        message: 'Restore initiated. Server is restarting.',
      });

      // Start restore asynchronously after response is sent
      setImmediate(async () => {
        try {
          await backupService.restoreBackup(fastify.db, fastify.config, request.params.filename);
        } catch (error) {
          fastify.log.error(error, 'Restore failed');
        }
      });
    },
  );
}

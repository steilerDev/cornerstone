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
 * Backups are always enabled: BACKUP_DIR defaults to /backups (an empty value falls back to the default).
 */

import type { FastifyInstance } from 'fastify';
import { UnauthorizedError } from '../errors/AppError.js';
import { requireRole } from '../plugins/auth.js';
import * as backupService from '../services/backupService.js';
import type {
  BackupResponse,
  BackupListResponse,
  RestoreInitiatedResponse,
  BackupSchedulerStatusResponse,
} from '@cornerstone/shared';

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

const schedulerStatusSchema = {
  response: {
    200: {
      type: 'object',
      required: ['scheduler'],
      properties: {
        scheduler: {
          type: 'object',
          required: ['enabled', 'lastRun', 'nextRuns'],
          properties: {
            enabled: { type: 'boolean' },
            lastRun: {
              type: ['object', 'null'],
              properties: {
                timestamp: { type: 'string' },
                success: { type: 'boolean' },
              },
            },
            nextRuns: { type: 'array', items: { type: 'string' } },
          },
        },
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

      const backups = await backupService.listBackups(fastify.config.backupDir);
      return reply.status(200).send({ backups });
    },
  );

  /**
   * GET /api/backups/scheduler-status
   *
   * Returns the automatic backup scheduler's status: whether it is enabled,
   * the outcome of its most recent run, and its next scheduled run times.
   * Admin only.
   */
  fastify.get<{ Reply: BackupSchedulerStatusResponse }>(
    '/scheduler-status',
    {
      schema: schedulerStatusSchema,
      preHandler: requireRole('admin'),
    },
    async (request, reply) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      const scheduler = backupService.getSchedulerStatus();
      return reply.status(200).send({ scheduler });
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

      await backupService.deleteBackup(fastify.config.backupDir, request.params.filename);
      return reply.status(204).send();
    },
  );

  /**
   * POST /api/backups/:filename/restore
   *
   * Restore the database and app data from a backup.
   * Validates first (404/409/500 are returned), then returns 202 and restores asynchronously and exits.
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

      // Validate (filename, existing archive, lock) before answering; errors reach the client
      await backupService.beginRestore(fastify.config, request.params.filename);

      // Schedule the extract/swap before sending the reply, so the operation lock taken by
      // beginRestore is always handed to executeRestore (which releases it in its finally)
      // regardless of what happens to the send. The immediate still fires after the send.
      setImmediate(async () => {
        try {
          await backupService.executeRestore(fastify.db, fastify.config, request.params.filename);
        } catch (error) {
          fastify.log.error(error, 'Restore failed');
        }
      });

      return reply.status(202).send({
        message: 'Restore initiated. Server is restarting.',
      });
    },
  );
}

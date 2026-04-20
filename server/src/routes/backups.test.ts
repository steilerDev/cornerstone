/**
 * Integration tests for backup and restore API routes.
 *
 * EPIC-19: Backup and Restore Feature
 *
 * Tests all 4 endpoints using app.inject():
 *   POST   /api/backups
 *   GET    /api/backups
 *   DELETE /api/backups/:filename
 *   POST   /api/backups/:filename/restore
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { disposableTempDir } from '../test-helpers/disposables.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, BackupListResponse, BackupResponse } from '@cornerstone/shared';
import type { DisposableTempDir } from '../test-helpers/disposables.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe('Backup Routes', () => {
  let app: FastifyInstance;
  let tempDir: DisposableTempDir;
  let backupTempDir: DisposableTempDir;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    // App data directory (DB lives here)
    tempDir = disposableTempDir('cornerstone-backup-routes-test-');
    // Backup directory MUST be outside the app data directory (config validation)
    backupTempDir = disposableTempDir('cornerstone-backup-backups-test-');

    process.env.DATABASE_URL = join(tempDir.path, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    tempDir[Symbol.dispose]();
    backupTempDir[Symbol.dispose]();
  });

  /**
   * Helper: Create a user and return a session cookie.
   */
  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  // ─── POST /api/backups — without BACKUP_DIR ───────────────────────────────

  describe('POST /api/backups', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/backups',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when authenticated as member (non-admin)', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/backups',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ─── GET /api/backups — without BACKUP_DIR ────────────────────────────────

  describe('GET /api/backups', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/backups',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when authenticated as member (non-admin)', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/backups',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ─── DELETE /api/backups/:filename — without BACKUP_DIR ──────────────────

  describe('DELETE /api/backups/:filename', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/backups/cornerstone-backup-2026-03-22T020000Z.tar.gz',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when authenticated as member (non-admin)', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/backups/cornerstone-backup-2026-03-22T020000Z.tar.gz',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ─── POST /api/backups/:filename/restore — without BACKUP_DIR ────────────

  describe('POST /api/backups/:filename/restore', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/backups/cornerstone-backup-2026-03-22T020000Z.tar.gz/restore',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when authenticated as member (non-admin)', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/backups/cornerstone-backup-2026-03-22T020000Z.tar.gz/restore',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // ─── Routes with BACKUP_DIR configured ───────────────────────────────────

  describe('Routes with BACKUP_DIR configured', () => {
    let appWithBackup: FastifyInstance;

    beforeEach(async () => {
      // Set BACKUP_DIR before building the app
      process.env.BACKUP_DIR = backupTempDir.path;
      appWithBackup = await buildApp();
    });

    afterEach(async () => {
      if (appWithBackup) {
        await appWithBackup.close();
      }
    });

    async function createAdminWithSession(): Promise<string> {
      const user = await userService.createLocalUser(
        appWithBackup.db,
        'admin@test.com',
        'Admin',
        'password',
        'admin',
      );
      const sessionToken = sessionService.createSession(appWithBackup.db, user.id, 3600);
      return `cornerstone_session=${sessionToken}`;
    }

    it('GET /api/backups returns 200 with empty list when no backups exist', async () => {
      const cookie = await createAdminWithSession();

      const response = await appWithBackup.inject({
        method: 'GET',
        url: '/api/backups',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BackupListResponse>();
      expect(body.backups).toEqual([]);
    });

    it('GET /api/backups returns 200 with backup list when backups exist', async () => {
      const cookie = await createAdminWithSession();

      // Create backup dir and write fake backup files
      const { mkdirSync } = await import('node:fs');
      mkdirSync(backupTempDir.path, { recursive: true });
      writeFileSync(
        join(backupTempDir.path, 'cornerstone-backup-2026-03-22T020000Z.tar.gz'),
        'backup content',
      );
      writeFileSync(
        join(backupTempDir.path, 'cornerstone-backup-2026-01-01T000000Z.tar.gz'),
        'older backup',
      );

      const response = await appWithBackup.inject({
        method: 'GET',
        url: '/api/backups',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BackupListResponse>();
      expect(body.backups).toHaveLength(2);
      // Sorted newest-first
      expect(body.backups[0]!.filename).toBe('cornerstone-backup-2026-03-22T020000Z.tar.gz');
      expect(body.backups[1]!.filename).toBe('cornerstone-backup-2026-01-01T000000Z.tar.gz');
    });

    it('DELETE /api/backups/:filename returns 404 for a non-existent file', async () => {
      const cookie = await createAdminWithSession();

      const response = await appWithBackup.inject({
        method: 'DELETE',
        url: '/api/backups/cornerstone-backup-2099-01-01T000000Z.tar.gz',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('BACKUP_NOT_FOUND');
    });

    it('DELETE /api/backups/:filename returns 404 for a path traversal attempt', async () => {
      const cookie = await createAdminWithSession();

      // URL-encode the path traversal attempt
      const response = await appWithBackup.inject({
        method: 'DELETE',
        url: '/api/backups/..%2Fetc%2Fpasswd',
        headers: { cookie },
      });

      // The route's validateBackupFilename will return false → BackupNotFoundError → 404
      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('BACKUP_NOT_FOUND');
    });

    it('DELETE /api/backups/:filename returns 204 for an existing backup', async () => {
      const cookie = await createAdminWithSession();
      const { mkdirSync } = await import('node:fs');
      mkdirSync(backupTempDir.path, { recursive: true });
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      writeFileSync(join(backupTempDir.path, filename), 'backup content');

      const response = await appWithBackup.inject({
        method: 'DELETE',
        url: `/api/backups/${filename}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('POST /api/backups/:filename/restore returns 202 Accepted when file exists (async response)', async () => {
      const cookie = await createAdminWithSession();
      const { mkdirSync } = await import('node:fs');
      mkdirSync(backupTempDir.path, { recursive: true });
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      writeFileSync(join(backupTempDir.path, filename), 'backup content');

      const response = await appWithBackup.inject({
        method: 'POST',
        url: `/api/backups/${filename}/restore`,
        headers: { cookie },
      });

      // 202 is sent immediately before the async restore starts
      expect(response.statusCode).toBe(202);
      const body = response.json<{ message: string }>();
      expect(body.message).toBeTruthy();
    });

    it('POST /api/backups returns 500 BACKUP_FAILED when backup directory exists but is read-only', async () => {
      // chmod does not restrict root — skip this test when running as root
      if (process.getuid?.() === 0) {
        return;
      }

      const cookie = await createAdminWithSession();

      // Make the backup directory read-only so the writability probe fails
      chmodSync(backupTempDir.path, 0o444);

      try {
        const response = await appWithBackup.inject({
          method: 'POST',
          url: '/api/backups',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(500);
        const body = response.json<ApiErrorResponse>();
        expect(body.error.code).toBe('BACKUP_FAILED');
      } finally {
        // Restore permissions so afterEach cleanup can delete the directory
        chmodSync(backupTempDir.path, 0o755);
      }
    });
  });
});

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
import * as backupService from '../services/backupService.js';
import { disposableTempDir } from '../test-helpers/disposables.js';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  BackupListResponse,
  BackupSchedulerStatusResponse,
} from '@cornerstone/shared';
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

  describe('GET /api/backups with default config (no BACKUP_DIR env)', () => {
    it('is always enabled: responds 200 with a backups array for an admin', async () => {
      expect(process.env.BACKUP_DIR).toBeUndefined();
      const { cookie } = await createUserWithSession(
        'admin-default@test.com',
        'Admin',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/backups',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json<{ backups: unknown[] }>().backups)).toBe(true);
    });
  });

  // ─── GET /api/backups/scheduler-status — without BACKUP_DIR ──────────────

  describe('GET /api/backups/scheduler-status', () => {
    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/backups/scheduler-status',
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
        url: '/api/backups/scheduler-status',
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
      jest.restoreAllMocks();
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

    it('GET /api/backups/scheduler-status returns 200 with disabled shape when no BACKUP_CADENCE is configured', async () => {
      const cookie = await createAdminWithSession();

      const response = await appWithBackup.inject({
        method: 'GET',
        url: '/api/backups/scheduler-status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BackupSchedulerStatusResponse>();
      expect(body.scheduler).toEqual({ enabled: false, lastRun: null, nextRuns: [] });
    });

    it('POST /api/backups/:filename/restore returns 202 Accepted when file exists (async response)', async () => {
      const cookie = await createAdminWithSession();
      const { mkdirSync } = await import('node:fs');
      mkdirSync(backupTempDir.path, { recursive: true });
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      writeFileSync(join(backupTempDir.path, filename), 'backup content');
      // Never let a (hypothetically successful) restore terminate the test process
      jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

      const response = await appWithBackup.inject({
        method: 'POST',
        url: `/api/backups/${filename}/restore`,
        headers: { cookie },
      });

      // 202 is sent immediately before the async restore starts
      expect(response.statusCode).toBe(202);
      const body = response.json<{ message: string }>();
      expect(body.message).toBeTruthy();

      // The post-reply executeRestore fails on the bogus archive and must release the lock;
      // wait for that so nothing touches the temp dirs after teardown.
      let released = false;
      for (let i = 0; i < 100 && !released; i++) {
        try {
          await backupService.beginRestore(appWithBackup.config, filename);
          released = true;
        } catch (error) {
          expect((error as { code?: string }).code).toBe('BACKUP_IN_PROGRESS');
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
      }
      expect(released).toBe(true);
      await expect(
        backupService.executeRestore(appWithBackup.db, appWithBackup.config, filename),
      ).rejects.toMatchObject({ code: 'RESTORE_FAILED' });
    });

    it('POST /api/backups/:filename/restore returns 404 BACKUP_NOT_FOUND when the archive does not exist', async () => {
      const cookie = await createAdminWithSession();

      const response = await appWithBackup.inject({
        method: 'POST',
        url: '/api/backups/cornerstone-backup-2026-03-22T020000Z.tar.gz/restore',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json<ApiErrorResponse>().error.code).toBe('BACKUP_NOT_FOUND');
    });

    it('POST /api/backups/:filename/restore returns 409 BACKUP_IN_PROGRESS while a backup holds the lock', async () => {
      const cookie = await createAdminWithSession();
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      writeFileSync(join(backupTempDir.path, filename), 'backup content');

      // createBackup takes the module-level lock synchronously, before its first await
      const running = backupService.createBackup(appWithBackup.db, appWithBackup.config);
      const response = await appWithBackup.inject({
        method: 'POST',
        url: `/api/backups/${filename}/restore`,
        headers: { cookie },
      });
      await running;

      expect(response.statusCode).toBe(409);
      expect(response.json<ApiErrorResponse>().error.code).toBe('BACKUP_IN_PROGRESS');
    });

    it('POST /api/backups/:filename/restore returns 500 RESTORE_FAILED when the archive cannot be stat-ed', async () => {
      const cookie = await createAdminWithSession();
      // Point the live config at a path under a regular file so stat fails with ENOTDIR
      const blocker = join(backupTempDir.path, 'not-a-directory');
      writeFileSync(blocker, 'x');
      const originalDir = appWithBackup.config.backupDir;
      appWithBackup.config.backupDir = join(blocker, 'backups');

      try {
        const response = await appWithBackup.inject({
          method: 'POST',
          url: '/api/backups/cornerstone-backup-2026-03-22T020000Z.tar.gz/restore',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json<ApiErrorResponse>().error.code).toBe('RESTORE_FAILED');
      } finally {
        appWithBackup.config.backupDir = originalDir;
      }
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

  // ─── GET /api/backups/scheduler-status — with BACKUP_CADENCE configured ──

  describe('GET /api/backups/scheduler-status — with BACKUP_CADENCE configured', () => {
    let appWithScheduler: FastifyInstance;

    beforeEach(async () => {
      // BACKUP_DIR + a valid BACKUP_CADENCE together enable the real scheduler
      // during buildApp() (see app.ts: backupService.initScheduler(...)).
      process.env.BACKUP_DIR = backupTempDir.path;
      process.env.BACKUP_CADENCE = '0 2 * * *';
      appWithScheduler = await buildApp();
    });

    afterEach(async () => {
      if (appWithScheduler) {
        // app.close() runs the onClose hook, which calls backupService.stopScheduler()
        await appWithScheduler.close();
      }
    });

    it('returns 200 with enabled shape: lastRun null (never run) and two upcoming nextRuns', async () => {
      const user = await userService.createLocalUser(
        appWithScheduler.db,
        'admin-sched@test.com',
        'Admin',
        'password',
        'admin',
      );
      const sessionToken = sessionService.createSession(appWithScheduler.db, user.id, 3600);
      const cookie = `cornerstone_session=${sessionToken}`;

      const response = await appWithScheduler.inject({
        method: 'GET',
        url: '/api/backups/scheduler-status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BackupSchedulerStatusResponse>();
      expect(body.scheduler.enabled).toBe(true);
      expect(body.scheduler.lastRun).toBeNull();
      expect(body.scheduler.nextRuns).toHaveLength(2);
      for (const iso of body.scheduler.nextRuns) {
        expect(new Date(iso).toISOString()).toBe(iso);
      }
    });
  });
});

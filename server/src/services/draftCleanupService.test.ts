/**
 * Unit tests for draftCleanupService.ts
 *
 * Story #1426: Diary photos lost on upload failure — Draft cleanup service
 * Tests orphan detection, deletion, scheduler initialization, and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { ScheduledTask } from 'node-cron';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import type { AppConfig } from '../plugins/config.js';
import type * as NodeCron from 'node-cron';
import type * as DraftCleanupServiceModule from './draftCleanupService.js';

// ─── Mock node-cron ──────────────────────────────────────────────────────────

const mockCronTask = {
  stop: jest.fn(),
} as unknown as ScheduledTask;

const mockCronSchedule = jest.fn<typeof NodeCron.schedule>();

jest.unstable_mockModule('node-cron', () => ({
  default: {
    schedule: mockCronSchedule,
  },
  schedule: mockCronSchedule,
}));

// ─── Mock diaryService (findOrphanDraftIds + deleteDiaryEntry) ───────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFindOrphanDraftIds = jest.fn<(...args: any[]) => string[]>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDeleteDiaryEntry = jest.fn<(...args: any[]) => Promise<void>>();

jest.unstable_mockModule('./diaryService.js', () => ({
  findOrphanDraftIds: mockFindOrphanDraftIds,
  deleteDiaryEntry: mockDeleteDiaryEntry,
  listDiaryEntries: jest.fn(),
  getDiaryEntry: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: jest.fn(),
  promoteDiaryEntry: jest.fn(),
  createAutomaticDiaryEntry: jest.fn(),
}));

// ─── Config factory ──────────────────────────────────────────────────────────

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  port: 3000,
  host: '0.0.0.0',
  databaseUrl: '/app/data/cornerstone.db',
  logLevel: 'fatal',
  nodeEnv: 'test',
  sessionDuration: 3600,
  secureCookies: false,
  trustProxy: false,
  oidcEnabled: false,
  paperlessEnabled: false,
  photoStoragePath: '/app/data/photos',
  photoMaxFileSizeMb: 20,
  diaryAutoEvents: false,
  diaryDraftRetentionDays: 30,
  currency: 'EUR',
  vatRate: 0.19,
  backupEnabled: false,
  backupDir: '/tmp/test-backups',
  backupCadence: undefined,
  backupRetention: undefined,
  llmBaseUrl: undefined,
  llmApiKey: undefined,
  llmModel: undefined,
  llmRequestTimeoutMs: 30000,
  llmMaxTokens: 16384,
  llmProvider: 'generic',
  autoItemizeEnabled: false,
  ...overrides,
});

// ─── Logger mock ─────────────────────────────────────────────────────────────

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
} as unknown as FastifyInstance['log'];

describe('draftCleanupService', () => {
  let runOrphanCleanup: typeof DraftCleanupServiceModule.runOrphanCleanup;
  let initScheduler: typeof DraftCleanupServiceModule.initScheduler;
  let stopScheduler: typeof DraftCleanupServiceModule.stopScheduler;

  let db: BetterSQLite3Database<typeof schema>;
  let sqlite: ReturnType<typeof Database>;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cleanup-svc-test-'));
    const dbPath = join(tempDir, 'test.db');
    sqlite = new Database(dbPath);
    runMigrations(sqlite, undefined);
    db = drizzle(sqlite, { schema });

    mockCronSchedule.mockReset();
    mockCronSchedule.mockReturnValue(mockCronTask);
    mockFindOrphanDraftIds.mockReset();
    mockDeleteDiaryEntry.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Jest mock methods not in Fastify logger interface
    (mockLogger.debug as any).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Jest mock methods not in Fastify logger interface
    (mockLogger.info as any).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Jest mock methods not in Fastify logger interface
    (mockLogger.warn as any).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Jest mock methods not in Fastify logger interface
    (mockLogger.error as any).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Jest mock methods not in ScheduledTask interface
    (mockCronTask.stop as any).mockReset();

    // Import dynamically to get fresh module after mocks
    const mod = await import('./draftCleanupService.js');
    runOrphanCleanup = mod.runOrphanCleanup;
    initScheduler = mod.initScheduler;
    stopScheduler = mod.stopScheduler;
  });

  afterEach(() => {
    // Stop any scheduler that may have been started
    stopScheduler();
    sqlite.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    jest.resetModules();
  });

  // ─── Scenario 29: runOrphanCleanup with retentionDays=0 ─────────────────

  describe('runOrphanCleanup', () => {
    it('Scenario 29: retentionDays=0 → early return, no DB queries', async () => {
      const config = makeConfig({ diaryDraftRetentionDays: 0 });

      await runOrphanCleanup(db, config, mockLogger);

      expect(mockFindOrphanDraftIds).not.toHaveBeenCalled();
      expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });

    it('Scenario 30: old drafts found → deletes them', async () => {
      const config = makeConfig({ diaryDraftRetentionDays: 30 });
      mockFindOrphanDraftIds.mockReturnValue(['draft-1', 'draft-2']);
      mockDeleteDiaryEntry.mockResolvedValue(undefined);

      await runOrphanCleanup(db, config, mockLogger);

      expect(mockFindOrphanDraftIds).toHaveBeenCalledWith(db, 30);
      expect(mockDeleteDiaryEntry).toHaveBeenCalledTimes(2);
      expect(mockDeleteDiaryEntry).toHaveBeenCalledWith(db, 'draft-1', config.photoStoragePath);
      expect(mockDeleteDiaryEntry).toHaveBeenCalledWith(db, 'draft-2', config.photoStoragePath);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: 2, failed: 0 }),
        expect.any(String),
      );
    });

    it('Scenario 31: saved entries older than retention → not deleted (no orphan IDs returned)', async () => {
      const config = makeConfig({ diaryDraftRetentionDays: 30 });
      // findOrphanDraftIds only returns draft IDs — saved entries are not included
      mockFindOrphanDraftIds.mockReturnValue([]);

      await runOrphanCleanup(db, config, mockLogger);

      expect(mockDeleteDiaryEntry).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('No orphan'));
    });

    it('Scenario 32: deleteDiaryEntry throws for one entry → logs warning, continues with others', async () => {
      const config = makeConfig({ diaryDraftRetentionDays: 30 });
      mockFindOrphanDraftIds.mockReturnValue(['draft-fail', 'draft-ok']);
      mockDeleteDiaryEntry
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);

      await runOrphanCleanup(db, config, mockLogger);

      // Both attempted
      expect(mockDeleteDiaryEntry).toHaveBeenCalledTimes(2);
      // Warning logged for failed one
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ draftId: 'draft-fail' }),
        expect.any(String),
      );
      // Completion logged with failed=1, deleted=1
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: 1, failed: 1 }),
        expect.any(String),
      );
    });
  });

  // ─── Scenario 33: initScheduler ──────────────────────────────────────────

  describe('initScheduler', () => {
    it('Scenario 33: retentionDays=0 → does not register cron', () => {
      const config = makeConfig({ diaryDraftRetentionDays: 0 });

      initScheduler(db, config, mockLogger);

      expect(mockCronSchedule).not.toHaveBeenCalled();
    });

    it('retentionDays>0 → registers daily cron at 3 AM UTC', () => {
      const config = makeConfig({ diaryDraftRetentionDays: 30 });

      initScheduler(db, config, mockLogger);

      expect(mockCronSchedule).toHaveBeenCalledWith('0 3 * * *', expect.any(Function));
    });

    it('logs successful initialization', () => {
      const config = makeConfig({ diaryDraftRetentionDays: 7 });

      initScheduler(db, config, mockLogger);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ retentionDays: 7 }),
        expect.any(String),
      );
    });
  });

  // ─── Scenario 34: stopScheduler ──────────────────────────────────────────

  describe('stopScheduler', () => {
    it('Scenario 34: stops the cron task if running', () => {
      const config = makeConfig({ diaryDraftRetentionDays: 30 });
      initScheduler(db, config, mockLogger);

      stopScheduler();

      expect(mockCronTask.stop).toHaveBeenCalledTimes(1);
    });

    it('no-op if scheduler not initialized', () => {
      // stopScheduler without initScheduler — should not throw
      expect(() => stopScheduler()).not.toThrow();
    });
  });
});

/**
 * Unit tests for backupsApi.ts
 *
 * EPIC-19: Backup and Restore Feature
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { listBackups, createBackup, deleteBackup, restoreBackup } from './backupsApi.js';
import type {
  BackupListResponse,
  BackupResponse,
  RestoreInitiatedResponse,
} from '@cornerstone/shared';

describe('backupsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── listBackups ──────────────────────────────────────────────────────────

  describe('listBackups()', () => {
    it('calls GET /api/backups', async () => {
      const mockResponse: BackupListResponse = { backups: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listBackups();

      expect(mockFetch).toHaveBeenCalledWith('/api/backups', expect.any(Object));
    });

    it('returns the response body with empty backups array', async () => {
      const mockResponse: BackupListResponse = { backups: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await listBackups();

      expect(result).toEqual(mockResponse);
      expect(result.backups).toHaveLength(0);
    });

    it('returns the response body with populated backups array', async () => {
      const mockResponse: BackupListResponse = {
        backups: [
          {
            filename: 'cornerstone-backup-2026-03-22T020000Z.tar.gz',
            createdAt: '2026-03-22T02:00:00.000Z',
            sizeBytes: 102400,
          },
          {
            filename: 'cornerstone-backup-2026-01-01T000000Z.tar.gz',
            createdAt: '2026-01-01T00:00:00.000Z',
            sizeBytes: 81920,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await listBackups();

      expect(result.backups).toHaveLength(2);
      expect(result.backups[0]!.filename).toBe('cornerstone-backup-2026-03-22T020000Z.tar.gz');
      expect(result.backups[0]!.sizeBytes).toBe(102400);
    });

    it('throws ApiClientError when server returns 503 BACKUP_NOT_CONFIGURED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            code: 'BACKUP_NOT_CONFIGURED',
            message: 'Backup is not configured',
          },
        }),
      } as Response);

      await expect(listBackups()).rejects.toThrow();
    });

    it('throws ApiClientError when server returns 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(listBackups()).rejects.toThrow();
    });
  });

  // ─── createBackup ─────────────────────────────────────────────────────────

  describe('createBackup()', () => {
    it('calls POST /api/backups', async () => {
      const mockResponse: BackupResponse = {
        backup: {
          filename: 'cornerstone-backup-2026-03-22T020000Z.tar.gz',
          createdAt: '2026-03-22T02:00:00.000Z',
          sizeBytes: 102400,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      await createBackup();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/backups',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('returns the created backup metadata', async () => {
      const mockResponse: BackupResponse = {
        backup: {
          filename: 'cornerstone-backup-2026-03-22T020000Z.tar.gz',
          createdAt: '2026-03-22T02:00:00.000Z',
          sizeBytes: 204800,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createBackup();

      expect(result).toEqual(mockResponse);
      expect(result.backup.filename).toBe('cornerstone-backup-2026-03-22T020000Z.tar.gz');
      expect(result.backup.sizeBytes).toBe(204800);
    });

    it('throws ApiClientError when server returns 503 BACKUP_NOT_CONFIGURED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: 'BACKUP_NOT_CONFIGURED', message: 'Backup is not configured' },
        }),
      } as Response);

      await expect(createBackup()).rejects.toThrow();
    });

    it('throws ApiClientError when server returns 409 BACKUP_IN_PROGRESS', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'BACKUP_IN_PROGRESS',
            message: 'A backup operation is already in progress',
          },
        }),
      } as Response);

      await expect(createBackup()).rejects.toThrow();
    });
  });

  // ─── deleteBackup ─────────────────────────────────────────────────────────

  describe('deleteBackup()', () => {
    it('calls DELETE /api/backups/:filename with the filename', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      await deleteBackup(filename);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/backups/${encodeURIComponent(filename)}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('URL-encodes the filename in the request path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      // A filename with special chars that would need encoding
      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      await deleteBackup(filename);

      const calledUrl = (mockFetch.mock.calls[0]! as [string, ...unknown[]])[0];
      expect(calledUrl).toBe(`/api/backups/${encodeURIComponent(filename)}`);
    });

    it('returns void on successful deletion (204)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteBackup('cornerstone-backup-2026-03-22T020000Z.tar.gz');
      expect(result).toBeUndefined();
    });

    it('throws ApiClientError when server returns 404 BACKUP_NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'BACKUP_NOT_FOUND', message: 'Backup not found' },
        }),
      } as Response);

      await expect(deleteBackup('cornerstone-backup-2099-01-01T000000Z.tar.gz')).rejects.toThrow();
    });
  });

  // ─── restoreBackup ────────────────────────────────────────────────────────

  describe('restoreBackup()', () => {
    it('calls POST /api/backups/:filename/restore with the filename', async () => {
      const mockResponse: RestoreInitiatedResponse = {
        message: 'Restore initiated. Server is restarting.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => mockResponse,
      } as Response);

      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      await restoreBackup(filename);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/backups/${encodeURIComponent(filename)}/restore`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('URL-encodes the filename in the request path', async () => {
      const mockResponse: RestoreInitiatedResponse = {
        message: 'Restore initiated. Server is restarting.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => mockResponse,
      } as Response);

      const filename = 'cornerstone-backup-2026-03-22T020000Z.tar.gz';
      await restoreBackup(filename);

      const calledUrl = (mockFetch.mock.calls[0]! as [string, ...unknown[]])[0];
      expect(calledUrl).toBe(`/api/backups/${encodeURIComponent(filename)}/restore`);
    });

    it('returns the RestoreInitiatedResponse', async () => {
      const mockResponse: RestoreInitiatedResponse = {
        message: 'Restore initiated. Server is restarting.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => mockResponse,
      } as Response);

      const result = await restoreBackup('cornerstone-backup-2026-03-22T020000Z.tar.gz');

      expect(result).toEqual(mockResponse);
      expect(result.message).toBeTruthy();
    });

    it('throws ApiClientError when server returns 404 BACKUP_NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'BACKUP_NOT_FOUND', message: 'Backup not found' },
        }),
      } as Response);

      await expect(restoreBackup('cornerstone-backup-2099-01-01T000000Z.tar.gz')).rejects.toThrow();
    });

    it('throws ApiClientError when server returns 503 BACKUP_NOT_CONFIGURED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: 'BACKUP_NOT_CONFIGURED', message: 'Backup is not configured' },
        }),
      } as Response);

      await expect(restoreBackup('cornerstone-backup-2026-03-22T020000Z.tar.gz')).rejects.toThrow();
    });
  });
});

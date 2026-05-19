import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  listDiaryEntries,
  getDiaryEntry,
  createDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  promoteDiaryEntry,
} from './diaryApi.js';
import type { DiaryEntryListResponse, DiaryEntryDetail } from '@cornerstone/shared';

describe('diaryApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  const baseSummary = {
    id: 'de-1',
    entryType: 'daily_log' as const,
    entryDate: '2026-03-14',
    title: 'Test Entry',
    body: 'Test body content',
    metadata: null,
    isAutomatic: false,
    isSigned: false,
    status: 'saved' as const,
    sourceEntityType: null,
    sourceEntityId: null,
    sourceEntityArea: null,
    sourceEntityTitle: null,
    photoCount: 0,
    createdBy: { id: 'user-1', displayName: 'Alice' },
    createdAt: '2026-03-14T09:00:00.000Z',
    updatedAt: '2026-03-14T09:00:00.000Z',
  };

  const mockDetail: DiaryEntryDetail = { ...baseSummary };

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── listDiaryEntries ──────────────────────────────────────────────────────

  describe('listDiaryEntries', () => {
    const emptyListResponse: DiaryEntryListResponse = {
      items: [],
      pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
    };

    it('sends GET request to /api/diary-entries without params when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries();

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries', expect.any(Object));
    });

    it('includes page param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ page: 2 });

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries?page=2', expect.any(Object));
    });

    it('includes pageSize param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ pageSize: 50 });

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries?pageSize=50', expect.any(Object));
    });

    it('includes type param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ type: 'daily_log,issue' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries?type=daily_log%2Cissue',
        expect.any(Object),
      );
    });

    it('includes dateFrom param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ dateFrom: '2026-03-01' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries?dateFrom=2026-03-01',
        expect.any(Object),
      );
    });

    it('includes dateTo param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ dateTo: '2026-03-31' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries?dateTo=2026-03-31',
        expect.any(Object),
      );
    });

    it('includes automatic param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ automatic: true });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries?automatic=true',
        expect.any(Object),
      );
    });

    it('includes q param when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ q: 'foundation' });

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries?q=foundation', expect.any(Object));
    });

    it('includes multiple params when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ page: 2, type: 'daily_log,issue', q: 'concrete' });

      const callUrl = mockFetch.mock.calls[0]![0] as string;
      expect(callUrl).toContain('page=2');
      expect(callUrl).toContain('type=');
      expect(callUrl).toContain('q=concrete');
    });

    it('returns the parsed list response', async () => {
      const mockListResponse: DiaryEntryListResponse = {
        items: [baseSummary],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockListResponse,
      } as Response);

      const result = await listDiaryEntries();

      expect(result).toEqual(mockListResponse);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('de-1');
    });

    it('throws when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(listDiaryEntries()).rejects.toThrow();
    });
  });

  // ─── getDiaryEntry ─────────────────────────────────────────────────────────

  describe('getDiaryEntry', () => {
    it('sends GET request to /api/diary-entries/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetail,
      } as Response);

      await getDiaryEntry('de-abc');

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries/de-abc', expect.any(Object));
    });

    it('returns the parsed diary entry detail', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetail,
      } as Response);

      const result = await getDiaryEntry('de-1');

      expect(result).toEqual(mockDetail);
      expect(result.id).toBe('de-1');
      expect(result.entryType).toBe('daily_log');
    });

    it('throws on 404 not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Diary entry not found' } }),
      } as Response);

      await expect(getDiaryEntry('nonexistent')).rejects.toThrow();
    });
  });

  // ─── createDiaryEntry ──────────────────────────────────────────────────────

  describe('createDiaryEntry', () => {
    it('sends POST request to /api/diary-entries with the body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockDetail,
      } as Response);

      const requestData = {
        entryType: 'daily_log' as const,
        entryDate: '2026-03-14',
        body: 'Poured concrete foundations today.',
      };

      await createDiaryEntry(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created diary entry detail', async () => {
      const newDetail: DiaryEntryDetail = {
        ...baseSummary,
        id: 'de-new',
        title: 'New Entry',
        body: 'Created today.',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => newDetail,
      } as Response);

      const result = await createDiaryEntry({
        entryType: 'general_note',
        entryDate: '2026-03-14',
        body: 'Created today.',
      });

      expect(result).toEqual(newDetail);
      expect(result.id).toBe('de-new');
    });

    it('throws on validation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'body is required' },
        }),
      } as Response);

      await expect(
        createDiaryEntry({ entryType: 'daily_log', entryDate: '2026-03-14', body: '' }),
      ).rejects.toThrow();
    });
  });

  // ─── updateDiaryEntry ──────────────────────────────────────────────────────

  describe('updateDiaryEntry', () => {
    it('sends PUT request to /api/diary-entries/:id', async () => {
      const updateData = { body: 'Updated body content.' };
      const updatedDetail: DiaryEntryDetail = { ...baseSummary, body: 'Updated body content.' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedDetail,
      } as Response);

      await updateDiaryEntry('de-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries/de-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated diary entry detail', async () => {
      const updatedDetail: DiaryEntryDetail = { ...baseSummary, title: 'Updated Title' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedDetail,
      } as Response);

      const result = await updateDiaryEntry('de-1', { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
    });

    it('throws on 404 when entry not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Diary entry not found' } }),
      } as Response);

      await expect(updateDiaryEntry('nonexistent', { body: 'x' })).rejects.toThrow();
    });
  });

  // ─── deleteDiaryEntry ──────────────────────────────────────────────────────

  describe('deleteDiaryEntry', () => {
    it('sends DELETE request to /api/diary-entries/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteDiaryEntry('de-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries/de-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns void on successful delete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteDiaryEntry('de-1');

      expect(result).toBeUndefined();
    });

    it('throws on 404 when entry not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Diary entry not found' } }),
      } as Response);

      await expect(deleteDiaryEntry('nonexistent')).rejects.toThrow();
    });

    it('throws on server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(deleteDiaryEntry('de-1')).rejects.toThrow();
    });
  });

  // ─── promoteDiaryEntry (Story #1426) ──────────────────────────────────────

  describe('promoteDiaryEntry', () => {
    it('Scenario 58: sends PATCH to /api/diary-entries/:id/promote with provided data', async () => {
      const savedEntry: DiaryEntryDetail = { ...mockDetail, status: 'saved' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => savedEntry,
      } as Response);

      await promoteDiaryEntry('draft-entry-1', { body: 'Final content', entryDate: '2026-05-01' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries/draft-entry-1/promote',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ body: 'Final content', entryDate: '2026-05-01' }),
        }),
      );
    });

    it('sends PATCH with empty body when no overrides provided', async () => {
      const savedEntry: DiaryEntryDetail = { ...mockDetail, status: 'saved' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => savedEntry,
      } as Response);

      await promoteDiaryEntry('draft-1', {});

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/diary-entries/draft-1/promote',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({}),
        }),
      );
    });

    it('returns the promoted DiaryEntryDetail with status=saved', async () => {
      const savedEntry: DiaryEntryDetail = { ...mockDetail, status: 'saved' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => savedEntry,
      } as Response);

      const result = await promoteDiaryEntry('draft-1', {});

      expect(result.status).toBe('saved');
    });

    it('throws on 400 ALREADY_SAVED when entry is already saved', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'ALREADY_SAVED', message: 'Entry is already saved' } }),
      } as Response);

      await expect(promoteDiaryEntry('saved-1', {})).rejects.toThrow();
    });

    it('throws on 404 when entry not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
      } as Response);

      await expect(promoteDiaryEntry('nonexistent', {})).rejects.toThrow();
    });
  });

  // ─── listDiaryEntries status param (Story #1426) ──────────────────────────

  describe('listDiaryEntries status param (Story #1426)', () => {
    const emptyListResponse: DiaryEntryListResponse = {
      items: [],
      pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
    };

    it('Scenario 59: passes status=draft as query param when status is "draft"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ status: 'draft' });

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries?status=draft', expect.any(Object));
    });

    it('passes status=saved as query param when status is "saved"', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({ status: 'saved' });

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries?status=saved', expect.any(Object));
    });

    it('omits status param when status is not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyListResponse,
      } as Response);

      await listDiaryEntries({});

      expect(mockFetch).toHaveBeenCalledWith('/api/diary-entries', expect.any(Object));
    });
  });
});

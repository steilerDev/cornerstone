/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  NoteResponse,
  NoteListResponse,
  CreateNoteRequest,
  UpdateNoteRequest,
} from '@cornerstone/shared';
import { listNotes, createNote, updateNote, deleteNote } from './notesApi.js';
import { ApiClientError } from './apiClient.js';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('notesApi', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('listNotes', () => {
    it('sends GET request with correct workItemId', async () => {
      const mockResponse: NoteListResponse = {
        notes: [
          {
            id: 'note-1',
            content: 'Test note',
            createdBy: {
              id: 'user-1',
              displayName: 'Test User',
            },
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await listNotes('work-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/notes',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('handles empty notes list', async () => {
      const mockResponse: NoteListResponse = { notes: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await listNotes('work-1');

      expect(result.notes).toHaveLength(0);
    });

    it('throws ApiClientError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item not found' },
        }),
      } as Response);

      await expect(listNotes('nonexistent')).rejects.toThrow(ApiClientError);
    });
  });

  describe('createNote', () => {
    it('sends POST request with content', async () => {
      const requestData: CreateNoteRequest = { content: 'New note content' };
      const mockResponse: NoteResponse = {
        id: 'note-1',
        content: 'New note content',
        createdBy: {
          id: 'user-1',
          displayName: 'Test User',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createNote('work-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/notes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws ApiClientError on validation error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Content is required' },
        }),
      } as Response);

      await expect(createNote('work-1', { content: '' })).rejects.toThrow(ApiClientError);
    });
  });

  describe('updateNote', () => {
    it('sends PATCH request with updated content', async () => {
      const requestData: UpdateNoteRequest = { content: 'Updated note content' };
      const mockResponse: NoteResponse = {
        id: 'note-1',
        content: 'Updated note content',
        createdBy: {
          id: 'user-1',
          displayName: 'Test User',
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await updateNote('work-1', 'note-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/notes/note-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(requestData),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws ApiClientError on 403 Forbidden', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 'FORBIDDEN', message: 'Not authorized to edit this note' },
        }),
      } as Response);

      await expect(updateNote('work-1', 'note-1', { content: 'Updated' })).rejects.toThrow(
        ApiClientError,
      );
    });
  });

  describe('deleteNote', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteNote('work-1', 'note-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/notes/note-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('throws ApiClientError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Note not found' },
        }),
      } as Response);

      await expect(deleteNote('work-1', 'note-1')).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError on 403 Forbidden', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          error: { code: 'FORBIDDEN', message: 'Not authorized to delete this note' },
        }),
      } as Response);

      await expect(deleteNote('work-1', 'note-1')).rejects.toThrow(ApiClientError);
    });
  });
});

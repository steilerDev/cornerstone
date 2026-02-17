/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  SubtaskResponse,
  SubtaskListResponse,
  CreateSubtaskRequest,
  UpdateSubtaskRequest,
  ReorderSubtasksRequest,
} from '@cornerstone/shared';
import {
  listSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
} from './subtasksApi.js';
import { ApiClientError } from './apiClient.js';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('subtasksApi', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('listSubtasks', () => {
    it('sends GET request with correct workItemId', async () => {
      const mockResponse: SubtaskListResponse = {
        subtasks: [
          {
            id: 'subtask-1',
            title: 'Test subtask',
            isCompleted: false,
            sortOrder: 0,
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

      const result = await listSubtasks('work-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/subtasks',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('handles empty subtasks list', async () => {
      const mockResponse: SubtaskListResponse = { subtasks: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await listSubtasks('work-1');

      expect(result.subtasks).toHaveLength(0);
    });

    it('throws ApiClientError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item not found' },
        }),
      } as Response);

      await expect(listSubtasks('nonexistent')).rejects.toThrow(ApiClientError);
    });
  });

  describe('createSubtask', () => {
    it('sends POST request with title', async () => {
      const requestData: CreateSubtaskRequest = { title: 'New subtask' };
      const mockResponse: SubtaskResponse = {
        id: 'subtask-1',
        title: 'New subtask',
        isCompleted: false,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createSubtask('work-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/subtasks',
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
          error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
        }),
      } as Response);

      await expect(createSubtask('work-1', { title: '' })).rejects.toThrow(ApiClientError);
    });
  });

  describe('updateSubtask', () => {
    it('sends PATCH request with updated title', async () => {
      const requestData: UpdateSubtaskRequest = { title: 'Updated subtask' };
      const mockResponse: SubtaskResponse = {
        id: 'subtask-1',
        title: 'Updated subtask',
        isCompleted: false,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await updateSubtask('work-1', 'subtask-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/subtasks/subtask-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(requestData),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('sends PATCH request with isCompleted toggle', async () => {
      const requestData: UpdateSubtaskRequest = { isCompleted: true };
      const mockResponse: SubtaskResponse = {
        id: 'subtask-1',
        title: 'Test subtask',
        isCompleted: true,
        sortOrder: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T12:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await updateSubtask('work-1', 'subtask-1', requestData);

      expect(result.isCompleted).toBe(true);
    });

    it('throws ApiClientError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subtask not found' },
        }),
      } as Response);

      await expect(updateSubtask('work-1', 'subtask-1', { title: 'Updated' })).rejects.toThrow(
        ApiClientError,
      );
    });
  });

  describe('deleteSubtask', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteSubtask('work-1', 'subtask-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/subtasks/subtask-1',
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
          error: { code: 'NOT_FOUND', message: 'Subtask not found' },
        }),
      } as Response);

      await expect(deleteSubtask('work-1', 'subtask-1')).rejects.toThrow(ApiClientError);
    });
  });

  describe('reorderSubtasks', () => {
    it('sends PATCH request with subtaskIds array', async () => {
      const requestData: ReorderSubtasksRequest = {
        subtaskIds: ['subtask-2', 'subtask-1', 'subtask-3'],
      };
      const mockResponse: SubtaskListResponse = {
        subtasks: [
          {
            id: 'subtask-2',
            title: 'Second',
            isCompleted: false,
            sortOrder: 0,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 'subtask-1',
            title: 'First',
            isCompleted: false,
            sortOrder: 1,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 'subtask-3',
            title: 'Third',
            isCompleted: false,
            sortOrder: 2,
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

      const result = await reorderSubtasks('work-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/subtasks/reorder',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(requestData),
        }),
      );
      expect(result.subtasks[0].id).toBe('subtask-2');
      expect(result.subtasks[1].id).toBe('subtask-1');
    });

    it('throws ApiClientError on validation error for invalid subtaskIds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'All subtaskIds must belong to this work item',
          },
        }),
      } as Response);

      await expect(
        reorderSubtasks('work-1', { subtaskIds: ['other-work-item-subtask'] }),
      ).rejects.toThrow(ApiClientError);
    });
  });
});

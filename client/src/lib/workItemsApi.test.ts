import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  listWorkItems,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
  deleteWorkItem,
} from './workItemsApi.js';
import type { WorkItemListResponse, WorkItemDetail } from '@cornerstone/shared';

describe('workItemsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listWorkItems', () => {
    it('sends GET request to /api/work-items without query params when no params provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems();

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items', expect.any(Object));
    });

    it('includes page query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 2, pageSize: 25, totalPages: 5, totalItems: 100 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ page: 2 });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?page=2', expect.any(Object));
    });

    it('includes pageSize query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 50, totalPages: 2, totalItems: 100 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ pageSize: 50 });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?pageSize=50', expect.any(Object));
    });

    it('includes status filter query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ status: 'in_progress' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items?status=in_progress',
        expect.any(Object),
      );
    });

    it('includes assignedUserId filter query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ assignedUserId: 'user-123' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items?assignedUserId=user-123',
        expect.any(Object),
      );
    });

    it('includes tagId filter query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ tagId: 'tag-456' });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?tagId=tag-456', expect.any(Object));
    });

    it('includes search query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ q: 'electrical' });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?q=electrical', expect.any(Object));
    });

    it('includes sortBy query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ sortBy: 'title' });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?sortBy=title', expect.any(Object));
    });

    it('includes sortOrder query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ sortOrder: 'asc' });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?sortOrder=asc', expect.any(Object));
    });

    it('includes multiple query params when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 2, pageSize: 50, totalPages: 3, totalItems: 150 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({
        page: 2,
        pageSize: 50,
        status: 'completed',
        q: 'plumbing',
        sortBy: 'end_date',
        sortOrder: 'desc',
      });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('page=2');
      expect(callUrl).toContain('pageSize=50');
      expect(callUrl).toContain('status=completed');
      expect(callUrl).toContain('q=plumbing');
      expect(callUrl).toContain('sortBy=end_date');
      expect(callUrl).toContain('sortOrder=desc');
    });

    it('returns parsed response data', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [
          {
            id: '1',
            title: 'Install electrical',
            status: 'in_progress',
            startDate: '2026-01-01',
            endDate: '2026-01-15',
            durationDays: 14,
            assignedUser: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
            tags: [],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await listWorkItems();

      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Install electrical');
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(listWorkItems()).rejects.toThrow();
    });
  });

  describe('getWorkItem', () => {
    it('sends GET request to /api/work-items/:id', async () => {
      const mockResponse: WorkItemDetail = {
        id: 'work-123',
        title: 'Install plumbing',
        description: 'Install all plumbing fixtures',
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        tags: [],
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        plannedBudget: null,
        actualCost: null,
        confidencePercent: null,
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await getWorkItem('work-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items/work-123', expect.any(Object));
    });

    it('returns parsed work item detail', async () => {
      const mockResponse: WorkItemDetail = {
        id: 'work-123',
        title: 'Install plumbing',
        description: 'Install all plumbing fixtures',
        status: 'completed',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        durationDays: 14,
        startAfter: null,
        startBefore: null,
        assignedUser: { id: 'user-1', displayName: 'Jane Doe', email: 'jane@example.com' },
        createdBy: { id: 'user-2', displayName: 'Admin', email: 'admin@example.com' },
        tags: [{ id: 'tag-1', name: 'Plumbing', color: '#0000FF' }],
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        plannedBudget: null,
        actualCost: null,
        confidencePercent: null,
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-15T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getWorkItem('work-123');

      expect(result).toEqual(mockResponse);
      expect(result.title).toBe('Install plumbing');
      expect(result.status).toBe('completed');
    });

    it('throws error when work item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(getWorkItem('nonexistent')).rejects.toThrow();
    });
  });

  describe('createWorkItem', () => {
    it('sends POST request to /api/work-items with data', async () => {
      const mockResponse: WorkItemDetail = {
        id: 'work-new',
        title: 'New task',
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        tags: [],
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        plannedBudget: null,
        actualCost: null,
        confidencePercent: null,
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { title: 'New task' };
      await createWorkItem(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns created work item', async () => {
      const mockResponse: WorkItemDetail = {
        id: 'work-new',
        title: 'New task',
        description: 'Task description',
        status: 'not_started',
        startDate: '2026-02-01',
        endDate: '2026-02-15',
        durationDays: 14,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        tags: [],
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        plannedBudget: null,
        actualCost: null,
        confidencePercent: null,
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createWorkItem({ title: 'New task', description: 'Task description' });

      expect(result).toEqual(mockResponse);
      expect(result.id).toBe('work-new');
    });

    it('throws error when validation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Title is required' } }),
      } as Response);

      await expect(createWorkItem({ title: '' })).rejects.toThrow();
    });
  });

  describe('updateWorkItem', () => {
    it('sends PATCH request to /api/work-items/:id with data', async () => {
      const mockResponse: WorkItemDetail = {
        id: 'work-123',
        title: 'Updated title',
        description: null,
        status: 'in_progress',
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        tags: [],
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        plannedBudget: null,
        actualCost: null,
        confidencePercent: null,
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { title: 'Updated title', status: 'in_progress' as const };
      await updateWorkItem('work-123', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-123',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns updated work item', async () => {
      const mockResponse: WorkItemDetail = {
        id: 'work-123',
        title: 'Updated title',
        description: 'Updated description',
        status: 'completed',
        startDate: '2026-01-01',
        endDate: '2026-01-15',
        durationDays: 14,
        startAfter: null,
        startBefore: null,
        assignedUser: { id: 'user-2', displayName: 'Bob Smith', email: 'bob@example.com' },
        createdBy: null,
        tags: [],
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        plannedBudget: null,
        actualCost: null,
        confidencePercent: null,
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateWorkItem('work-123', { status: 'completed' });

      expect(result).toEqual(mockResponse);
      expect(result.status).toBe('completed');
    });

    it('throws error when work item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(updateWorkItem('nonexistent', { title: 'Updated' })).rejects.toThrow();
    });
  });

  describe('deleteWorkItem', () => {
    it('sends DELETE request to /api/work-items/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteWorkItem('work-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-123',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful delete', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteWorkItem('work-123');

      expect(result).toBeUndefined();
    });

    it('throws error when work item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(deleteWorkItem('nonexistent')).rejects.toThrow();
    });

    it('throws error when delete fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteWorkItem('work-123')).rejects.toThrow();
    });
  });
});

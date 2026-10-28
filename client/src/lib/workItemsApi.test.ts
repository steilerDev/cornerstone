import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  listWorkItems,
  listWorkItemRows,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
  deleteWorkItem,
  fetchWorkItemSubsidies,
  linkWorkItemSubsidy,
  unlinkWorkItemSubsidy,
  fetchWorkItemSubsidyPayback,
} from './workItemsApi.js';
import type {
  WorkItemListResponse,
  WorkItemListRowsResponse,
  WorkItemDetail,
  SubsidyProgram,
} from '@cornerstone/shared';

const UNDO = { token: 'tok-1', expiresAt: '2026-01-01T00:00:30Z' };

describe('workItemsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listWorkItemRows (#2245)', () => {
    const ROWS: WorkItemListRowsResponse = {
      items: [],
      pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      scopeTotal: 0,
    };

    function respond(body: unknown = ROWS) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);
    }
    const lastUrl = () => new URL(String(mockFetch.mock.calls[0]![0]), 'http://x');

    it('requests /api/work-items without params and returns the rows response', async () => {
      respond();
      await expect(listWorkItemRows()).resolves.toEqual(ROWS);
      expect(mockFetch).toHaveBeenCalledWith('/api/work-items', expect.any(Object));
    });

    it('sends group, milestoneId and expected_cost sort', async () => {
      respond();
      await listWorkItemRows({
        group: 'time',
        milestoneId: 7,
        sortBy: 'expected_cost',
        sortOrder: 'desc',
      });
      const params = lastUrl().searchParams;
      expect(params.get('group')).toBe('time');
      expect(params.get('milestoneId')).toBe('7');
      expect(params.get('sortBy')).toBe('expected_cost');
      expect(params.get('sortOrder')).toBe('desc');
    });

    it('joins ids with commas and omits an empty ids list', async () => {
      respond();
      await listWorkItemRows({ ids: ['wi-1', 'wi-2'] });
      expect(lastUrl().searchParams.get('ids')).toBe('wi-1,wi-2');
      mockFetch.mockClear();
      respond();
      await listWorkItemRows({ ids: [] });
      expect(mockFetch).toHaveBeenCalledWith('/api/work-items', expect.any(Object));
    });

    it('forwards the abort signal', async () => {
      respond();
      const controller = new AbortController();
      await listWorkItemRows({}, { signal: controller.signal });
      expect((mockFetch.mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal);
    });

    it('listWorkItems accepts the same ids list', async () => {
      respond();
      await listWorkItems({ ids: ['a'], milestoneId: 3 });
      const params = lastUrl().searchParams;
      expect(params.get('ids')).toBe('a');
      expect(params.get('milestoneId')).toBe('3');
    });
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

    it('includes areaId filter query param when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listWorkItems({ areaId: 'area-456' });

      expect(mockFetch).toHaveBeenCalledWith('/api/work-items?areaId=area-456', expect.any(Object));
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

    it('sends the four shown-date filters when provided', async () => {
      const mockResponse: WorkItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponse } as Response);

      await listWorkItems({
        startDateFrom: '2026-03-01',
        startDateTo: '2026-03-31',
        endDateFrom: '2026-04-01',
        endDateTo: '2026-04-30',
      });

      const url = mockFetch.mock.calls[0]![0] as string;
      const params = new URL(url, 'http://localhost').searchParams;
      expect(params.get('startDateFrom')).toBe('2026-03-01');
      expect(params.get('startDateTo')).toBe('2026-03-31');
      expect(params.get('endDateFrom')).toBe('2026-04-01');
      expect(params.get('endDateTo')).toBe('2026-04-30');
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

      const callUrl = mockFetch.mock.calls[0]![0] as string;
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
            projectedStartDate: '2026-01-01',
            projectedEndDate: '2026-01-15',
            isLate: false,
            lateDays: null,
            isHeldUp: false,
            durationDays: 14,
            actualStartDate: null,
            actualEndDate: null,
            assignedUser: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
            assignedVendor: null,
            area: null,
            budgetLineCount: 0,
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
      expect(result.items[0]!.title).toBe('Install electrical');
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
        projectedStartDate: null,
        projectedEndDate: null,
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        assignedVendor: null,
        area: null,
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        budgets: [],
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
        projectedStartDate: '2026-01-01',
        projectedEndDate: '2026-01-15',
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: 14,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: { id: 'user-1', displayName: 'Jane Doe', email: 'jane@example.com' },
        createdBy: { id: 'user-2', displayName: 'Admin', email: 'admin@example.com' },
        assignedVendor: null,
        area: null,
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        budgets: [],
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
        projectedStartDate: null,
        projectedEndDate: null,
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        assignedVendor: null,
        area: null,
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        budgets: [],
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
        projectedStartDate: '2026-02-01',
        projectedEndDate: '2026-02-15',
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: 14,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        assignedVendor: null,
        area: null,
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        budgets: [],
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
        projectedStartDate: null,
        projectedEndDate: null,
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: null,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: null,
        createdBy: null,
        assignedVendor: null,
        area: null,
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        budgets: [],
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
        projectedStartDate: '2026-01-01',
        projectedEndDate: '2026-01-15',
        isLate: false,
        lateDays: null,
        isHeldUp: false,
        durationDays: 14,
        actualStartDate: null,
        actualEndDate: null,
        startAfter: null,
        startBefore: null,
        assignedUser: { id: 'user-2', displayName: 'Bob Smith', email: 'bob@example.com' },
        createdBy: null,
        assignedVendor: null,
        area: null,
        subtasks: [],
        dependencies: { predecessors: [], successors: [] },
        budgets: [],
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

  // ─── fetchWorkItemSubsidies ────────────────────────────────────────────────

  describe('fetchWorkItemSubsidies', () => {
    const mockSubsidy: SubsidyProgram = {
      id: 'subsidy-1',
      name: 'Green Energy Rebate',
      description: null,
      eligibility: null,
      reductionType: 'percentage',
      reductionValue: 15,
      applicationStatus: 'eligible',
      applicationDeadline: null,
      notes: null,
      maximumAmount: null,
      applicableCategories: [],
      includesNoCategoryItems: false,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('sends GET request to /api/work-items/:workItemId/subsidies', async () => {
      // NOTE: The client reads r.subsidyPrograms but the route sends { subsidies: [...] }.
      // This test mocks what the client expects (subsidyPrograms key).
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subsidyPrograms: [mockSubsidy] }),
      } as Response);

      await fetchWorkItemSubsidies('work-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-123/subsidies',
        expect.any(Object),
      );
    });

    it('returns the subsidies array from the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subsidies: [mockSubsidy] }),
      } as Response);

      const result = await fetchWorkItemSubsidies('work-123');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('subsidy-1');
      expect(result[0]!.name).toBe('Green Energy Rebate');
    });

    it('returns empty array when no subsidies linked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subsidies: [] }),
      } as Response);

      const result = await fetchWorkItemSubsidies('work-123');

      expect(result).toEqual([]);
    });

    it('throws error when work item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(fetchWorkItemSubsidies('nonexistent')).rejects.toThrow();
    });
  });

  // ─── linkWorkItemSubsidy ───────────────────────────────────────────────────

  describe('linkWorkItemSubsidy', () => {
    it('sends POST request to /api/work-items/:workItemId/subsidies with subsidyProgramId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ subsidy: { id: 'subsidy-1', name: 'Test Subsidy' } }),
      } as Response);

      await linkWorkItemSubsidy('work-123', 'subsidy-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-123/subsidies',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ subsidyProgramId: 'subsidy-1' }),
        }),
      );
    });

    it('resolves on success (201 response)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ subsidy: { id: 'subsidy-1', name: 'Test Subsidy' } }),
      } as Response);

      // linkWorkItemSubsidy uses post<void> — the Promise resolves (does not reject)
      await expect(linkWorkItemSubsidy('work-123', 'subsidy-1')).resolves.not.toThrow();
    });

    it('throws error when subsidy is already linked (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'Subsidy program is already linked to this work item',
          },
        }),
      } as Response);

      await expect(linkWorkItemSubsidy('work-123', 'subsidy-1')).rejects.toThrow();
    });

    it('throws error when subsidy program not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subsidy program not found' },
        }),
      } as Response);

      await expect(linkWorkItemSubsidy('work-123', 'nonexistent-subsidy')).rejects.toThrow();
    });
  });

  // ─── unlinkWorkItemSubsidy ─────────────────────────────────────────────────

  describe('unlinkWorkItemSubsidy', () => {
    it('sends DELETE request to /api/work-items/:workItemId/subsidies/:subsidyProgramId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ undo: UNDO }),
      } as Response);

      await unlinkWorkItemSubsidy('work-123', 'subsidy-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-123/subsidies/subsidy-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('resolves with the Undo token (200)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ undo: UNDO }),
      } as Response);

      const result = await unlinkWorkItemSubsidy('work-123', 'subsidy-1');

      expect(result).toEqual({ undo: UNDO });
    });

    it('throws error when subsidy not linked (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Subsidy program is not linked to this work item',
          },
        }),
      } as Response);

      await expect(unlinkWorkItemSubsidy('work-123', 'subsidy-1')).rejects.toThrow();
    });
  });

  describe('listWorkItems vendor and budget-line filters', () => {
    it('sends the vendor and budget-line bounds, including zero', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], pagination: {} }),
      } as Response);

      await listWorkItems({ assignedVendorId: 'vendor-1', budgetLinesMin: 0, budgetLinesMax: 4 });

      const url = new URL(mockFetch.mock.calls[0]![0] as string, 'http://localhost');
      expect(url.searchParams.get('assignedVendorId')).toBe('vendor-1');
      expect(url.searchParams.get('budgetLinesMin')).toBe('0');
      expect(url.searchParams.get('budgetLinesMax')).toBe('4');
    });
  });

  describe('fetchWorkItemSubsidyPayback', () => {
    it('sends GET to /api/work-items/:id/subsidy-payback and resolves with the body', async () => {
      const body = {
        workItemId: 'work-123',
        minTotalPayback: 0,
        maxTotalPayback: 10,
        subsidies: [],
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body } as Response);

      const result = await fetchWorkItemSubsidyPayback('work-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-123/subsidy-payback',
        expect.any(Object),
      );
      expect(result).toEqual(body);
    });
  });

  describe('listWorkItems request options', () => {
    it('forwards the abort signal to fetch for a search', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);
      const controller = new AbortController();

      await listWorkItems({ q: 'roof', pageSize: 50 }, { signal: controller.signal });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items?pageSize=50&q=roof',
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('sends no signal when no options are given', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await listWorkItems();

      expect(mockFetch.mock.calls[0]![1]!.signal).toBeUndefined();
    });
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  listHouseholdItems,
  getHouseholdItem,
  createHouseholdItem,
  updateHouseholdItem,
  deleteHouseholdItem,
} from './householdItemsApi.js';
import type {
  HouseholdItemListResponse,
  HouseholdItemDetail,
  HouseholdItemSummary,
} from '@cornerstone/shared';

describe('householdItemsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listHouseholdItems', () => {
    it('sends GET request to /api/household-items without query params when no params provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems();

      expect(mockFetch).toHaveBeenCalledWith('/api/household-items', expect.any(Object));
    });

    it('includes page query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 2, pageSize: 25, totalPages: 5, totalItems: 100 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ page: 2 });

      expect(mockFetch).toHaveBeenCalledWith('/api/household-items?page=2', expect.any(Object));
    });

    it('includes pageSize query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 50, totalPages: 2, totalItems: 100 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ pageSize: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?pageSize=50',
        expect.any(Object),
      );
    });

    it('includes search query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ q: 'desk' });

      expect(mockFetch).toHaveBeenCalledWith('/api/household-items?q=desk', expect.any(Object));
    });

    it('includes category filter query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ category: 'furniture' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?category=furniture',
        expect.any(Object),
      );
    });

    it('includes status filter query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ status: 'delivered' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?status=delivered',
        expect.any(Object),
      );
    });

    it('includes room filter query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ room: 'bedroom' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?room=bedroom',
        expect.any(Object),
      );
    });

    it('includes vendorId filter query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ vendorId: 'vendor-123' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?vendorId=vendor-123',
        expect.any(Object),
      );
    });

    it('includes tagId filter query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ tagId: 'tag-456' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?tagId=tag-456',
        expect.any(Object),
      );
    });

    it('includes sortBy query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ sortBy: 'name' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?sortBy=name',
        expect.any(Object),
      );
    });

    it('includes sortOrder query param when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 1, pageSize: 25, totalPages: 0, totalItems: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({ sortOrder: 'asc' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items?sortOrder=asc',
        expect.any(Object),
      );
    });

    it('includes multiple query params when provided', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [],
        pagination: { page: 2, pageSize: 50, totalPages: 3, totalItems: 150 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await listHouseholdItems({
        page: 2,
        pageSize: 50,
        category: 'appliances',
        status: 'ordered',
        q: 'refrigerator',
        sortBy: 'order_date',
        sortOrder: 'desc',
      });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('page=2');
      expect(callUrl).toContain('pageSize=50');
      expect(callUrl).toContain('category=appliances');
      expect(callUrl).toContain('status=ordered');
      expect(callUrl).toContain('q=refrigerator');
      expect(callUrl).toContain('sortBy=order_date');
      expect(callUrl).toContain('sortOrder=desc');
    });

    it('returns parsed response data', async () => {
      const mockResponse: HouseholdItemListResponse = {
        items: [
          {
            id: 'hi-1',
            name: 'Coffee table',
            description: 'Wooden coffee table',
            category: 'furniture',
            status: 'delivered',
            vendor: { id: 'vendor-1', name: 'Furniture Plus', specialty: 'Furniture' },
            room: 'living room',
            quantity: 1,
            orderDate: '2026-01-01',
            expectedDeliveryDate: '2026-01-10',
            actualDeliveryDate: '2026-01-09',
            earliestDeliveryDate: '2026-01-10',
            latestDeliveryDate: '2026-01-15',
            url: null,
            tagIds: [],
            budgetLineCount: 0,
            totalPlannedAmount: 200,
            budgetSummary: { totalPlanned: 200, totalActual: 0, subsidyReduction: 0, netCost: 200 },
            createdBy: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-09T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 25, totalPages: 1, totalItems: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await listHouseholdItems();

      expect(result).toEqual(mockResponse);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Coffee table');
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(listHouseholdItems()).rejects.toThrow();
    });
  });

  describe('getHouseholdItem', () => {
    it('sends GET request to /api/household-items/:id', async () => {
      const mockResponse: HouseholdItemDetail = {
        id: 'hi-1',
        name: 'Sofa',
        description: 'Leather sofa',
        category: 'furniture',
        status: 'not_ordered',
        vendor: null,
        room: 'living room',
        quantity: 1,
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        url: null,
        tagIds: [],
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        tags: [],
        dependencies: [],
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItem: mockResponse }),
      } as Response);

      await getHouseholdItem('hi-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/household-items/hi-1', expect.any(Object));
    });

    it('returns parsed household item detail', async () => {
      const mockResponse: HouseholdItemDetail = {
        id: 'hi-1',
        name: 'Dining table',
        description: 'Oak dining table',
        category: 'furniture',
        status: 'delivered',
        vendor: { id: 'vendor-1', name: 'Furniture Plus', specialty: 'Furniture' },
        room: 'dining room',
        quantity: 1,
        orderDate: '2026-01-01',
        expectedDeliveryDate: '2026-01-10',
        actualDeliveryDate: '2026-01-09',
        earliestDeliveryDate: '2026-01-08',
        latestDeliveryDate: '2026-01-15',
        url: 'https://example.com/dining-table',
        tagIds: ['tag-1'],
        budgetLineCount: 1,
        totalPlannedAmount: 500,
        budgetSummary: { totalPlanned: 500, totalActual: 0, subsidyReduction: 0, netCost: 500 },
        createdBy: { id: 'user-1', displayName: 'John Doe', email: 'john@example.com' },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-09T00:00:00.000Z',
        tags: [{ id: 'tag-1', name: 'Essential', color: '#FF0000' }],
        dependencies: [],
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItem: mockResponse }),
      } as Response);

      const result = await getHouseholdItem('hi-1');

      expect(result).toEqual(mockResponse);
      expect(result.name).toBe('Dining table');
      expect(result.status).toBe('delivered');
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(getHouseholdItem('nonexistent')).rejects.toThrow();
    });
  });

  describe('createHouseholdItem', () => {
    it('sends POST request to /api/household-items with data', async () => {
      const mockResponse: HouseholdItemDetail = {
        id: 'hi-new',
        name: 'New item',
        description: null,
        category: 'furniture',
        status: 'not_ordered',
        vendor: null,
        room: null,
        quantity: 1,
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        url: null,
        tagIds: [],
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        tags: [],
        dependencies: [],
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ householdItem: mockResponse }),
      } as Response);

      const requestData = { name: 'New item' };
      await createHouseholdItem(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns created household item', async () => {
      const mockResponse: HouseholdItemDetail = {
        id: 'hi-new',
        name: 'Bed frame',
        description: 'Queen size bed frame',
        category: 'furniture',
        status: 'not_ordered',
        vendor: null,
        room: 'bedroom',
        quantity: 1,
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        url: 'https://example.com/bed',
        tagIds: [],
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        tags: [],
        dependencies: [],
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ householdItem: mockResponse }),
      } as Response);

      const result = await createHouseholdItem({
        name: 'Bed frame',
        description: 'Queen size bed frame',
      });

      expect(result).toEqual(mockResponse);
      expect(result.id).toBe('hi-new');
    });

    it('throws error when validation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }),
      } as Response);

      await expect(createHouseholdItem({ name: '' })).rejects.toThrow();
    });
  });

  describe('updateHouseholdItem', () => {
    it('sends PATCH request to /api/household-items/:id with data', async () => {
      const mockResponse: HouseholdItemDetail = {
        id: 'hi-1',
        name: 'Updated name',
        description: null,
        category: 'furniture',
        status: 'ordered',
        vendor: null,
        room: null,
        quantity: 1,
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        url: null,
        tagIds: [],
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        tags: [],
        dependencies: [],
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItem: mockResponse }),
      } as Response);

      const updateData = { name: 'Updated name', status: 'ordered' as const };
      await updateHouseholdItem('hi-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns updated household item', async () => {
      const mockResponse: HouseholdItemDetail = {
        id: 'hi-1',
        name: 'Updated item',
        description: 'Updated description',
        category: 'appliances',
        status: 'delivered',
        vendor: { id: 'vendor-2', name: 'Appliance Store', specialty: 'Appliances' },
        room: 'kitchen',
        quantity: 1,
        orderDate: '2026-01-01',
        expectedDeliveryDate: '2026-01-15',
        actualDeliveryDate: '2026-01-15',
        earliestDeliveryDate: '2026-01-14',
        latestDeliveryDate: '2026-01-20',
        url: null,
        tagIds: [],
        budgetLineCount: 0,
        totalPlannedAmount: 0,
        budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
        tags: [],
        dependencies: [],
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ householdItem: mockResponse }),
      } as Response);

      const result = await updateHouseholdItem('hi-1', { status: 'delivered' });

      expect(result).toEqual(mockResponse);
      expect(result.status).toBe('delivered');
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(updateHouseholdItem('nonexistent', { name: 'Updated' })).rejects.toThrow();
    });
  });

  describe('deleteHouseholdItem', () => {
    it('sends DELETE request to /api/household-items/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteHouseholdItem('hi-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-1',
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

      const result = await deleteHouseholdItem('hi-1');

      expect(result).toBeUndefined();
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(deleteHouseholdItem('nonexistent')).rejects.toThrow();
    });

    it('throws error when delete fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(deleteHouseholdItem('hi-1')).rejects.toThrow();
    });
  });
});

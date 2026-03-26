import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchTrades, fetchTrade, createTrade, updateTrade, deleteTrade } from './tradesApi.js';
import type { TradeListResponse, TradeSingleResponse, TradeResponse } from '@cornerstone/shared';

const makeTrade = (overrides?: Partial<TradeResponse>): TradeResponse => ({
  id: 'trade-1',
  name: 'Plumbing',
  color: '#0000ff',
  description: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('tradesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchTrades', () => {
    it('sends GET request to /api/trades without query params when no params provided', async () => {
      const mockResponse: TradeListResponse = { trades: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchTrades();

      expect(mockFetch).toHaveBeenCalledWith('/api/trades', expect.any(Object));
    });

    it('includes search query param when provided', async () => {
      const mockResponse: TradeListResponse = { trades: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchTrades({ search: 'plumb' });

      expect(mockFetch).toHaveBeenCalledWith('/api/trades?search=plumb', expect.any(Object));
    });

    it('omits search param when search is empty string', async () => {
      const mockResponse: TradeListResponse = { trades: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchTrades({ search: '' });

      expect(mockFetch).toHaveBeenCalledWith('/api/trades', expect.any(Object));
    });

    it('returns the trades list from the response', async () => {
      const trade = makeTrade();
      const mockResponse: TradeListResponse = { trades: [trade] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchTrades();

      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].id).toBe('trade-1');
      expect(result.trades[0].name).toBe('Plumbing');
    });

    it('returns empty trades array when no trades exist', async () => {
      const mockResponse: TradeListResponse = { trades: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchTrades();

      expect(result.trades).toEqual([]);
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchTrades()).rejects.toThrow();
    });
  });

  describe('fetchTrade', () => {
    it('sends GET request to /api/trades/:id', async () => {
      const trade = makeTrade({ id: 'trade-42' });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchTrade('trade-42');

      expect(mockFetch).toHaveBeenCalledWith('/api/trades/trade-42', expect.any(Object));
    });

    it('returns the trade from the response envelope', async () => {
      const trade = makeTrade({ name: 'Electrical', color: '#ffff00' });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchTrade('trade-1');

      expect(result).toEqual(trade);
      expect(result.name).toBe('Electrical');
    });

    it('throws error when trade not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }),
      } as Response);

      await expect(fetchTrade('nonexistent')).rejects.toThrow();
    });
  });

  describe('createTrade', () => {
    it('sends POST request to /api/trades with the request data', async () => {
      const trade = makeTrade({ name: 'Carpentry' });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = { name: 'Carpentry', color: '#8B4513' };
      await createTrade(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/trades',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created trade from the response envelope', async () => {
      const trade = makeTrade({ id: 'trade-new', name: 'Masonry' });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createTrade({ name: 'Masonry' });

      expect(result).toEqual(trade);
      expect(result.id).toBe('trade-new');
    });

    it('creates a trade with optional fields', async () => {
      const trade = makeTrade({
        id: 'trade-new',
        name: 'HVAC',
        description: 'Heating, ventilation and air conditioning',
        sortOrder: 5,
      });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const requestData = {
        name: 'HVAC',
        description: 'Heating, ventilation and air conditioning',
        sortOrder: 5,
      };
      const result = await createTrade(requestData);

      expect(result.description).toBe('Heating, ventilation and air conditioning');
    });

    it('throws error when validation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Name is required' } }),
      } as Response);

      await expect(createTrade({ name: '' })).rejects.toThrow();
    });

    it('throws error when trade name conflicts (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Trade name already exists' },
        }),
      } as Response);

      await expect(createTrade({ name: 'Plumbing' })).rejects.toThrow();
    });
  });

  describe('updateTrade', () => {
    it('sends PATCH request to /api/trades/:id with the update data', async () => {
      const trade = makeTrade({ name: 'Advanced Plumbing' });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const updateData = { name: 'Advanced Plumbing' };
      await updateTrade('trade-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/trades/trade-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated trade from the response envelope', async () => {
      const trade = makeTrade({ name: 'Electrical Engineering', color: '#ff8800' });
      const mockResponse: TradeSingleResponse = { trade };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await updateTrade('trade-1', { color: '#ff8800' });

      expect(result).toEqual(trade);
      expect(result.color).toBe('#ff8800');
    });

    it('throws error when trade not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }),
      } as Response);

      await expect(updateTrade('nonexistent', { name: 'New name' })).rejects.toThrow();
    });
  });

  describe('deleteTrade', () => {
    it('sends DELETE request to /api/trades/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteTrade('trade-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/trades/trade-1',
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

      const result = await deleteTrade('trade-1');

      expect(result).toBeUndefined();
    });

    it('throws error when trade not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }),
      } as Response);

      await expect(deleteTrade('nonexistent')).rejects.toThrow();
    });

    it('throws error when trade is in use (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'TRADE_IN_USE', message: 'Trade is referenced by vendors' },
        }),
      } as Response);

      await expect(deleteTrade('trade-1')).rejects.toThrow();
    });
  });
});

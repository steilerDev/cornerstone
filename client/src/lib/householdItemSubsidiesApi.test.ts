import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchHouseholdItemSubsidies,
  linkHouseholdItemSubsidy,
  unlinkHouseholdItemSubsidy,
  fetchHouseholdItemSubsidyPayback,
} from './householdItemSubsidiesApi.js';
import type { SubsidyProgram, HouseholdItemSubsidyPaybackResponse } from '@cornerstone/shared';

describe('householdItemSubsidiesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchHouseholdItemSubsidies', () => {
    it('sends GET request to /api/household-items/:householdItemId/subsidies', async () => {
      const mockResponse = {
        subsidies: [] as SubsidyProgram[],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchHouseholdItemSubsidies('hi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/subsidies',
        expect.any(Object),
      );
    });

    it('returns an array of subsidy programs', async () => {
      const mockSubsidy: SubsidyProgram = {
        id: 'subsidy-1',
        name: 'Solar Rebate',
        description: 'Solar panel installation rebate',
        eligibility: null,
        reductionType: 'percentage',
        reductionValue: 25,
        applicationStatus: 'eligible',
        applicationDeadline: null,
        notes: null,
        applicableCategories: [],
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subsidies: [mockSubsidy] }),
      } as Response);

      const result = await fetchHouseholdItemSubsidies('hi-123');

      expect(result).toEqual([mockSubsidy]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('subsidy-1');
      expect(result[0].name).toBe('Solar Rebate');
    });

    it('returns empty array when no subsidies are linked', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subsidies: [] }),
      } as Response);

      const result = await fetchHouseholdItemSubsidies('hi-123');

      expect(result).toEqual([]);
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Household item not found' } }),
      } as Response);

      await expect(fetchHouseholdItemSubsidies('nonexistent')).rejects.toThrow();
    });

    it('throws error when response is 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchHouseholdItemSubsidies('hi-123')).rejects.toThrow();
    });
  });

  describe('linkHouseholdItemSubsidy', () => {
    it('sends POST request with correct URL and body', async () => {
      const mockSubsidy: SubsidyProgram = {
        id: 'subsidy-1',
        name: 'Test Subsidy',
        description: null,
        eligibility: null,
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'eligible',
        applicationDeadline: null,
        notes: null,
        applicableCategories: [],
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ subsidy: mockSubsidy }),
      } as Response);

      await linkHouseholdItemSubsidy('hi-123', 'subsidy-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/subsidies',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ subsidyProgramId: 'subsidy-1' }),
        }),
      );
    });

    it('returns linked subsidy program', async () => {
      const mockSubsidy: SubsidyProgram = {
        id: 'subsidy-1',
        name: 'Energy Efficiency Grant',
        description: 'Grant for energy-efficient improvements',
        eligibility: null,
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'eligible',
        applicationDeadline: '2026-12-31',
        notes: 'Must apply by end of year',
        applicableCategories: [],
        createdBy: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ subsidy: mockSubsidy }),
      } as Response);

      const result = await linkHouseholdItemSubsidy('hi-123', 'subsidy-1');

      expect(result).toEqual(mockSubsidy);
      expect(result.id).toBe('subsidy-1');
      expect(result.name).toBe('Energy Efficiency Grant');
      expect(result.reductionValue).toBe(20);
    });

    it('throws error when subsidy program not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subsidy program not found' },
        }),
      } as Response);

      await expect(linkHouseholdItemSubsidy('hi-123', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(linkHouseholdItemSubsidy('nonexistent', 'subsidy-1')).rejects.toThrow();
    });

    it('throws error on duplicate link (409 conflict)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Subsidy already linked' },
        }),
      } as Response);

      await expect(linkHouseholdItemSubsidy('hi-123', 'subsidy-1')).rejects.toThrow();
    });
  });

  describe('unlinkHouseholdItemSubsidy', () => {
    it('sends DELETE request to correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await unlinkHouseholdItemSubsidy('hi-123', 'subsidy-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/subsidies/subsidy-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful unlink', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await unlinkHouseholdItemSubsidy('hi-123', 'subsidy-1');

      expect(result).toBeUndefined();
    });

    it('throws error when subsidy link not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subsidy link not found' },
        }),
      } as Response);

      await expect(unlinkHouseholdItemSubsidy('hi-123', 'nonexistent')).rejects.toThrow();
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(unlinkHouseholdItemSubsidy('nonexistent', 'subsidy-1')).rejects.toThrow();
    });

    it('throws error when delete fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Delete failed' } }),
      } as Response);

      await expect(unlinkHouseholdItemSubsidy('hi-123', 'subsidy-1')).rejects.toThrow();
    });
  });

  describe('fetchHouseholdItemSubsidyPayback', () => {
    it('sends GET request to /api/household-items/:householdItemId/subsidy-payback', async () => {
      const mockResponse: HouseholdItemSubsidyPaybackResponse = {
        householdItemId: 'hi-123',
        minTotalPayback: 0,
        maxTotalPayback: 0,
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchHouseholdItemSubsidyPayback('hi-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/household-items/hi-123/subsidy-payback',
        expect.any(Object),
      );
    });

    it('returns payback response with correct structure', async () => {
      const mockResponse: HouseholdItemSubsidyPaybackResponse = {
        householdItemId: 'hi-123',
        minTotalPayback: 1000,
        maxTotalPayback: 2000,
        subsidies: [
          {
            subsidyProgramId: 'subsidy-1',
            name: 'Solar Rebate',
            reductionType: 'percentage',
            reductionValue: 25,
            minPayback: 1000,
            maxPayback: 2000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchHouseholdItemSubsidyPayback('hi-123');

      expect(result).toEqual(mockResponse);
      expect(result.householdItemId).toBe('hi-123');
      expect(result.minTotalPayback).toBe(1000);
      expect(result.maxTotalPayback).toBe(2000);
      expect(result.subsidies).toHaveLength(1);
    });

    it('returns zero payback when no subsidies are linked', async () => {
      const mockResponse: HouseholdItemSubsidyPaybackResponse = {
        householdItemId: 'hi-123',
        minTotalPayback: 0,
        maxTotalPayback: 0,
        subsidies: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchHouseholdItemSubsidyPayback('hi-123');

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies).toHaveLength(0);
    });

    it('returns multiple subsidies in payback breakdown', async () => {
      const mockResponse: HouseholdItemSubsidyPaybackResponse = {
        householdItemId: 'hi-123',
        minTotalPayback: 4000,
        maxTotalPayback: 6000,
        subsidies: [
          {
            subsidyProgramId: 'subsidy-1',
            name: 'Solar Rebate',
            reductionType: 'percentage',
            reductionValue: 25,
            minPayback: 2000,
            maxPayback: 3000,
          },
          {
            subsidyProgramId: 'subsidy-2',
            name: 'Energy Grant',
            reductionType: 'fixed',
            reductionValue: 2000,
            minPayback: 2000,
            maxPayback: 3000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchHouseholdItemSubsidyPayback('hi-123');

      expect(result.subsidies).toHaveLength(2);
      expect(result.subsidies[0].name).toBe('Solar Rebate');
      expect(result.subsidies[1].name).toBe('Energy Grant');
      expect(result.minTotalPayback).toBe(4000);
      expect(result.maxTotalPayback).toBe(6000);
    });

    it('throws error when household item not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Household item not found' },
        }),
      } as Response);

      await expect(fetchHouseholdItemSubsidyPayback('nonexistent')).rejects.toThrow();
    });

    it('throws error when response is not OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchHouseholdItemSubsidyPayback('hi-123')).rejects.toThrow();
    });
  });
});

/**
 * Unit tests for budgetLineAssignApi.ts (Story #1545).
 *
 * Tests the API client function that calls POST /api/budget-lines/:id/assign.
 * Mocks globalThis.fetch to verify correct URL construction, request body,
 * and error handling.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { assignBudgetLine } from './budgetLineAssignApi.js';
import type { InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';

/**
 * Minimal mock for a successful InvoiceBudgetLineDetailResponse.
 */
const makeDetailResponse = (
  overrides?: Partial<InvoiceBudgetLineDetailResponse>,
): InvoiceBudgetLineDetailResponse => ({
  id: 'ibl-001',
  invoiceId: 'inv-001',
  workItemBudgetId: 'wib-001',
  householdItemBudgetId: null,
  itemizedAmount: 500,
  budgetLineDescription: 'Test orphan line',
  plannedAmount: 500,
  confidence: 'own_estimate',
  categoryId: null,
  categoryName: null,
  categoryColor: null,
  categoryTranslationKey: null,
  parentItemId: 'wi-001',
  parentItemTitle: 'Kitchen Renovation',
  parentItemType: 'work_item',
  parentItemArea: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('budgetLineAssignApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── URL construction ─────────────────────────────────────────────────────

  describe('URL construction', () => {
    it('calls POST /api/budget-lines/:id/assign with the correct URL', async () => {
      const mockResponse = makeDetailResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-abc-123', {
        targetType: 'work_item',
        targetId: 'wi-001',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/budget-lines/wib-abc-123/assign',
        expect.any(Object),
      );
    });

    it('URL-encodes the id parameter when it contains special characters', async () => {
      const mockResponse = makeDetailResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib/special id', {
        targetType: 'work_item',
        targetId: 'wi-001',
      });

      const calledUrl = (mockFetch.mock.calls[0]! as [string, ...unknown[]])[0];
      expect(calledUrl).toBe('/api/budget-lines/wib%2Fspecial%20id/assign');
    });

    it('uses POST method', async () => {
      const mockResponse = makeDetailResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-001', {
        targetType: 'work_item',
        targetId: 'wi-001',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends Content-Type: application/json header', async () => {
      const mockResponse = makeDetailResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-001', {
        targetType: 'work_item',
        targetId: 'wi-001',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
  });

  // ─── Request body ─────────────────────────────────────────────────────────

  describe('request body', () => {
    it('sends targetType: work_item and targetId in the body', async () => {
      const mockResponse = makeDetailResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-001', {
        targetType: 'work_item',
        targetId: 'wi-abc',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ targetType: 'work_item', targetId: 'wi-abc' }),
        }),
      );
    });

    it('sends targetType: household_item and targetId in the body', async () => {
      const mockResponse = makeDetailResponse({ parentItemType: 'household_item' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-001', {
        targetType: 'household_item',
        targetId: 'hi-xyz',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ targetType: 'household_item', targetId: 'hi-xyz' }),
        }),
      );
    });

    it('includes optional budgetCategoryId in body when provided', async () => {
      const mockResponse = makeDetailResponse({ categoryId: 'bc-construction' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-001', {
        targetType: 'work_item',
        targetId: 'wi-001',
        budgetCategoryId: 'bc-construction',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            targetType: 'work_item',
            targetId: 'wi-001',
            budgetCategoryId: 'bc-construction',
          }),
        }),
      );
    });

    it('includes budgetCategoryId: null when explicitly set to null', async () => {
      const mockResponse = makeDetailResponse({ categoryId: null });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await assignBudgetLine('wib-001', {
        targetType: 'work_item',
        targetId: 'wi-001',
        budgetCategoryId: null,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            targetType: 'work_item',
            targetId: 'wi-001',
            budgetCategoryId: null,
          }),
        }),
      );
    });
  });

  // ─── Successful response parsing ───────────────────────────────────────────

  describe('successful response', () => {
    it('returns the parsed InvoiceBudgetLineDetailResponse on success', async () => {
      const mockResponse = makeDetailResponse({
        id: 'ibl-xyz',
        parentItemType: 'work_item',
        parentItemId: 'wi-001',
        parentItemTitle: 'Kitchen Reno',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await assignBudgetLine('wib-001', {
        targetType: 'work_item',
        targetId: 'wi-001',
      });

      expect(result).toEqual(mockResponse);
      expect(result.id).toBe('ibl-xyz');
      expect(result.parentItemType).toBe('work_item');
      expect(result.parentItemTitle).toBe('Kitchen Reno');
    });

    it('returns household_item response correctly', async () => {
      const mockResponse = makeDetailResponse({
        workItemBudgetId: null,
        householdItemBudgetId: 'hib-001',
        parentItemType: 'household_item',
        parentItemId: 'hi-001',
        parentItemTitle: 'Sofa',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await assignBudgetLine('wib-001', {
        targetType: 'household_item',
        targetId: 'hi-001',
      });

      expect(result.parentItemType).toBe('household_item');
      expect(result.parentItemTitle).toBe('Sofa');
      expect(result.householdItemBudgetId).toBe('hib-001');
      expect(result.workItemBudgetId).toBeNull();
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws when server returns 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(
        assignBudgetLine('wib-001', { targetType: 'work_item', targetId: 'wi-001' }),
      ).rejects.toThrow();
    });

    it('throws when server returns 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item budget line not found' },
        }),
      } as Response);

      await expect(
        assignBudgetLine('wib-nonexistent', { targetType: 'work_item', targetId: 'wi-001' }),
      ).rejects.toThrow();
    });

    it('throws when server returns 409 CONFLICT (already assigned)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'This budget line is already assigned.' },
        }),
      } as Response);

      await expect(
        assignBudgetLine('wib-001', { targetType: 'work_item', targetId: 'wi-002' }),
      ).rejects.toThrow();
    });

    it('throws when server returns 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'targetType is required' },
        }),
      } as Response);

      await expect(
        assignBudgetLine('wib-001', { targetType: 'work_item', targetId: 'wi-001' }),
      ).rejects.toThrow();
    });

    it('throws when fetch encounters a network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      await expect(
        assignBudgetLine('wib-001', { targetType: 'work_item', targetId: 'wi-001' }),
      ).rejects.toThrow();
    });

    it('thrown error from 404 has correct status code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Budget line not found' },
        }),
      } as Response);

      let caught: unknown;
      try {
        await assignBudgetLine('wib-not-found', { targetType: 'work_item', targetId: 'wi-001' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      // ApiClientError has statusCode
      expect((caught as { statusCode?: number }).statusCode).toBe(404);
    });

    it('thrown error from 409 has the error code from the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Already assigned' },
        }),
      } as Response);

      let caught: unknown;
      try {
        await assignBudgetLine('wib-001', { targetType: 'work_item', targetId: 'wi-001' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeDefined();
      expect((caught as { error?: { code?: string } }).error?.code).toBe('CONFLICT');
    });
  });
});

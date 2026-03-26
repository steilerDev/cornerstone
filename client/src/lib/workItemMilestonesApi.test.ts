import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getWorkItemMilestones,
  addRequiredMilestone,
  removeRequiredMilestone,
  addLinkedMilestone,
  removeLinkedMilestone,
} from './workItemMilestonesApi.js';
import type { WorkItemMilestones } from '@cornerstone/shared';

describe('workItemMilestonesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockMilestonesResponse: WorkItemMilestones = {
    required: [
      {
        id: 1,
        name: 'Foundation Approved',
        targetDate: '2026-03-01',
      },
    ],
    linked: [
      {
        id: 2,
        name: 'Framing Complete',
        targetDate: '2026-06-01',
      },
    ],
  };

  // ─── getWorkItemMilestones ────────────────────────────────────────────────

  describe('getWorkItemMilestones', () => {
    it('sends GET request to /api/work-items/:workItemId/milestones', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMilestonesResponse,
      } as Response);

      await getWorkItemMilestones('work-item-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/milestones',
        expect.any(Object),
      );
    });

    it('returns the milestones response with required and linked arrays', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMilestonesResponse,
      } as Response);

      const result = await getWorkItemMilestones('work-item-1');

      expect(result.required).toHaveLength(1);
      expect(result.linked).toHaveLength(1);
      expect(result.required[0].name).toBe('Foundation Approved');
      expect(result.linked[0].name).toBe('Framing Complete');
    });

    it('returns empty arrays when no milestones are associated', async () => {
      const emptyResponse: WorkItemMilestones = { required: [], linked: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyResponse,
      } as Response);

      const result = await getWorkItemMilestones('work-item-1');

      expect(result.required).toEqual([]);
      expect(result.linked).toEqual([]);
    });

    it('throws error when work item not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Work item not found' } }),
      } as Response);

      await expect(getWorkItemMilestones('nonexistent')).rejects.toThrow();
    });

    it('throws error on server error (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(getWorkItemMilestones('work-item-1')).rejects.toThrow();
    });
  });

  // ─── addRequiredMilestone ─────────────────────────────────────────────────

  describe('addRequiredMilestone', () => {
    it('sends POST request to /api/work-items/:workItemId/milestones/required/:milestoneId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({}),
      } as Response);

      await addRequiredMilestone('work-item-1', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/milestones/required/1',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('resolves successfully on 201 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({}),
      } as Response);

      await expect(addRequiredMilestone('work-item-1', 1)).resolves.not.toThrow();
    });

    it('throws error when milestone not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }),
      } as Response);

      await expect(addRequiredMilestone('work-item-1', 999)).rejects.toThrow();
    });

    it('throws error when relationship already exists (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'CONFLICT', message: 'Relationship already exists' } }),
      } as Response);

      await expect(addRequiredMilestone('work-item-1', 1)).rejects.toThrow();
    });
  });

  // ─── removeRequiredMilestone ──────────────────────────────────────────────

  describe('removeRequiredMilestone', () => {
    it('sends DELETE request to /api/work-items/:workItemId/milestones/required/:milestoneId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await removeRequiredMilestone('work-item-1', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/milestones/required/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns void on successful removal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await removeRequiredMilestone('work-item-1', 1);

      expect(result).toBeUndefined();
    });

    it('throws error when relationship not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Required milestone relationship not found' },
        }),
      } as Response);

      await expect(removeRequiredMilestone('work-item-1', 999)).rejects.toThrow();
    });
  });

  // ─── addLinkedMilestone ───────────────────────────────────────────────────

  describe('addLinkedMilestone', () => {
    it('sends POST request to /api/work-items/:workItemId/milestones/linked/:milestoneId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({}),
      } as Response);

      await addLinkedMilestone('work-item-1', 2);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/milestones/linked/2',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('resolves successfully on 201 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({}),
      } as Response);

      await expect(addLinkedMilestone('work-item-1', 2)).resolves.not.toThrow();
    });

    it('throws error when milestone not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }),
      } as Response);

      await expect(addLinkedMilestone('work-item-1', 999)).rejects.toThrow();
    });

    it('throws error when relationship already exists (409)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'CONFLICT', message: 'Relationship already exists' } }),
      } as Response);

      await expect(addLinkedMilestone('work-item-1', 2)).rejects.toThrow();
    });
  });

  // ─── removeLinkedMilestone ────────────────────────────────────────────────

  describe('removeLinkedMilestone', () => {
    it('sends DELETE request to /api/work-items/:workItemId/milestones/linked/:milestoneId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await removeLinkedMilestone('work-item-1', 2);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-item-1/milestones/linked/2',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('returns void on successful removal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await removeLinkedMilestone('work-item-1', 2);

      expect(result).toBeUndefined();
    });

    it('throws error when relationship not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Linked milestone relationship not found' },
        }),
      } as Response);

      await expect(removeLinkedMilestone('work-item-1', 999)).rejects.toThrow();
    });
  });
});

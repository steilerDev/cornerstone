/**
 * @jest-environment jsdom
 *
 * Unit tests for milestonesApi.ts — API client functions for the milestones endpoint.
 * Verifies correct HTTP method, URL, and response mapping for each function.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  MilestoneSummary,
  MilestoneDetail,
  MilestoneListResponse,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  MilestoneWorkItemLinkResponse,
} from '@cornerstone/shared';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MILESTONE_SUMMARY: MilestoneSummary = {
  id: 1,
  title: 'Foundation Complete',
  description: 'All foundation work done',
  targetDate: '2024-06-30',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 3,
  dependentWorkItemCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MILESTONE_DETAIL: MilestoneDetail = {
  id: 1,
  title: 'Foundation Complete',
  description: null,
  targetDate: '2024-06-30',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItems: [],
  dependentWorkItems: [],
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('milestonesApi', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  // ─── listMilestones ─────────────────────────────────────────────────────

  describe('listMilestones', () => {
    it('sends GET request to /api/milestones', async () => {
      const { listMilestones } = await import('./milestonesApi.js');

      const response: MilestoneListResponse = { milestones: [MILESTONE_SUMMARY] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      await listMilestones();

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns the milestones array extracted from response', async () => {
      const { listMilestones } = await import('./milestonesApi.js');

      const response: MilestoneListResponse = { milestones: [MILESTONE_SUMMARY] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const result = await listMilestones();

      expect(result).toEqual([MILESTONE_SUMMARY]);
    });

    it('returns an empty array when milestones list is empty', async () => {
      const { listMilestones } = await import('./milestonesApi.js');

      const response: MilestoneListResponse = { milestones: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response);

      const result = await listMilestones();

      expect(result).toEqual([]);
    });

    it('throws ApiClientError on server error', async () => {
      const { listMilestones } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(listMilestones()).rejects.toThrow(ApiClientError);
    });
  });

  // ─── getMilestone ────────────────────────────────────────────────────────

  describe('getMilestone', () => {
    it('sends GET request to /api/milestones/:id', async () => {
      const { getMilestone } = await import('./milestonesApi.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MILESTONE_DETAIL,
      } as Response);

      await getMilestone(1);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns the milestone detail directly from response', async () => {
      const { getMilestone } = await import('./milestonesApi.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MILESTONE_DETAIL,
      } as Response);

      const result = await getMilestone(1);

      expect(result).toEqual(MILESTONE_DETAIL);
    });

    it('throws ApiClientError on 404 not found', async () => {
      const { getMilestone } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }),
      } as Response);

      await expect(getMilestone(999)).rejects.toThrow(ApiClientError);
    });
  });

  // ─── createMilestone ────────────────────────────────────────────────────

  describe('createMilestone', () => {
    it('sends POST request to /api/milestones', async () => {
      const { createMilestone } = await import('./milestonesApi.js');

      const requestData: CreateMilestoneRequest = {
        title: 'Foundation Complete',
        targetDate: '2024-06-30',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => MILESTONE_SUMMARY,
      } as Response);

      await createMilestone(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends request body as JSON', async () => {
      const { createMilestone } = await import('./milestonesApi.js');

      const requestData: CreateMilestoneRequest = {
        title: 'Foundation Complete',
        targetDate: '2024-06-30',
        description: 'Major milestone',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => MILESTONE_SUMMARY,
      } as Response);

      await createMilestone(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones',
        expect.objectContaining({
          body: JSON.stringify(requestData),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('returns the created milestone directly from response', async () => {
      const { createMilestone } = await import('./milestonesApi.js');

      const requestData: CreateMilestoneRequest = {
        title: 'Foundation Complete',
        targetDate: '2024-06-30',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => MILESTONE_SUMMARY,
      } as Response);

      const result = await createMilestone(requestData);

      expect(result).toEqual(MILESTONE_SUMMARY);
    });

    it('throws ApiClientError on validation error', async () => {
      const { createMilestone } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
        }),
      } as Response);

      await expect(createMilestone({ title: '', targetDate: '2024-06-30' })).rejects.toThrow(
        ApiClientError,
      );
    });
  });

  // ─── updateMilestone ────────────────────────────────────────────────────

  describe('updateMilestone', () => {
    it('sends PATCH request to /api/milestones/:id', async () => {
      const { updateMilestone } = await import('./milestonesApi.js');

      const requestData: UpdateMilestoneRequest = { title: 'Updated Title' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MILESTONE_SUMMARY,
      } as Response);

      await updateMilestone(1, requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('sends request body as JSON', async () => {
      const { updateMilestone } = await import('./milestonesApi.js');

      const requestData: UpdateMilestoneRequest = { title: 'Updated', isCompleted: true };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MILESTONE_SUMMARY,
      } as Response);

      await updateMilestone(1, requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1',
        expect.objectContaining({ body: JSON.stringify(requestData) }),
      );
    });

    it('returns updated milestone directly from response', async () => {
      const { updateMilestone } = await import('./milestonesApi.js');

      const updated: MilestoneSummary = { ...MILESTONE_SUMMARY, title: 'Updated' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => updated,
      } as Response);

      const result = await updateMilestone(1, { title: 'Updated' });

      expect(result).toEqual(updated);
    });

    it('throws ApiClientError on 404', async () => {
      const { updateMilestone } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }),
      } as Response);

      await expect(updateMilestone(999, { title: 'x' })).rejects.toThrow(ApiClientError);
    });
  });

  // ─── deleteMilestone ────────────────────────────────────────────────────

  describe('deleteMilestone', () => {
    it('sends DELETE request to /api/milestones/:id', async () => {
      const { deleteMilestone } = await import('./milestonesApi.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteMilestone(1);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('resolves without value on success (204 No Content)', async () => {
      const { deleteMilestone } = await import('./milestonesApi.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteMilestone(1);

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError on 404', async () => {
      const { deleteMilestone } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Milestone not found' } }),
      } as Response);

      await expect(deleteMilestone(999)).rejects.toThrow(ApiClientError);
    });
  });

  // ─── linkWorkItem ────────────────────────────────────────────────────────

  describe('linkWorkItem', () => {
    it('sends POST request to /api/milestones/:milestoneId/work-items', async () => {
      const { linkWorkItem } = await import('./milestonesApi.js');

      const linkResponse: MilestoneWorkItemLinkResponse = {
        milestoneId: 1,
        workItemId: 'wi-1',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => linkResponse,
      } as Response);

      await linkWorkItem(1, 'wi-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1/work-items',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends workItemId in request body', async () => {
      const { linkWorkItem } = await import('./milestonesApi.js');

      const linkResponse: MilestoneWorkItemLinkResponse = {
        milestoneId: 1,
        workItemId: 'wi-1',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => linkResponse,
      } as Response);

      await linkWorkItem(1, 'wi-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1/work-items',
        expect.objectContaining({
          body: JSON.stringify({ workItemId: 'wi-1' }),
        }),
      );
    });

    it('returns the link response directly (no wrapper)', async () => {
      const { linkWorkItem } = await import('./milestonesApi.js');

      const linkResponse: MilestoneWorkItemLinkResponse = {
        milestoneId: 1,
        workItemId: 'wi-1',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => linkResponse,
      } as Response);

      const result = await linkWorkItem(1, 'wi-1');

      expect(result).toEqual(linkResponse);
    });

    it('throws ApiClientError on 409 conflict (already linked)', async () => {
      const { linkWorkItem } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: 'CONFLICT', message: 'Work item already linked' },
        }),
      } as Response);

      await expect(linkWorkItem(1, 'wi-1')).rejects.toThrow(ApiClientError);
    });
  });

  // ─── unlinkWorkItem ──────────────────────────────────────────────────────

  describe('unlinkWorkItem', () => {
    it('sends DELETE request to /api/milestones/:milestoneId/work-items/:workItemId', async () => {
      const { unlinkWorkItem } = await import('./milestonesApi.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await unlinkWorkItem(1, 'wi-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/milestones/1/work-items/wi-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('resolves without value on success (204 No Content)', async () => {
      const { unlinkWorkItem } = await import('./milestonesApi.js');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await unlinkWorkItem(1, 'wi-1');

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError on 404 when link does not exist', async () => {
      const { unlinkWorkItem } = await import('./milestonesApi.js');
      const { ApiClientError } = await import('./apiClient.js');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Link not found' },
        }),
      } as Response);

      await expect(unlinkWorkItem(1, 'wi-missing')).rejects.toThrow(ApiClientError);
    });
  });
});

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchSubsidyPrograms,
  fetchSubsidyProgram,
  createSubsidyProgram,
  updateSubsidyProgram,
  deleteSubsidyProgram,
} from './subsidyProgramsApi.js';
import type {
  SubsidyProgram,
  SubsidyProgramListResponse,
  SubsidyProgramResponse,
} from '@cornerstone/shared';

describe('subsidyProgramsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  const sampleProgram: SubsidyProgram = {
    id: 'prog-1',
    name: 'Energy Rebate',
    description: 'Energy efficiency rebate',
    eligibility: 'Home owners',
    reductionType: 'percentage',
    reductionValue: 15,
    applicationStatus: 'eligible',
    applicationDeadline: '2027-12-31',
    notes: 'Apply early',
    applicableCategories: [],
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── fetchSubsidyPrograms ──────────────────────────────────────────────────

  describe('fetchSubsidyPrograms', () => {
    it('sends GET request to /api/subsidy-programs', async () => {
      const mockResponse: SubsidyProgramListResponse = { subsidyPrograms: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchSubsidyPrograms();

      expect(mockFetch).toHaveBeenCalledWith('/api/subsidy-programs', expect.any(Object));
    });

    it('returns parsed response with empty subsidyPrograms array', async () => {
      const mockResponse: SubsidyProgramListResponse = { subsidyPrograms: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchSubsidyPrograms();

      expect(result).toEqual(mockResponse);
      expect(result.subsidyPrograms).toEqual([]);
    });

    it('returns parsed response with programs list', async () => {
      const program2: SubsidyProgram = {
        id: 'prog-2',
        name: 'Fixed Grant',
        description: null,
        eligibility: null,
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'applied',
        applicationDeadline: null,
        notes: null,
        applicableCategories: [],
        createdBy: null,
        createdAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      };
      const mockResponse: SubsidyProgramListResponse = {
        subsidyPrograms: [sampleProgram, program2],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchSubsidyPrograms();

      expect(result.subsidyPrograms).toHaveLength(2);
      expect(result.subsidyPrograms[0].name).toBe('Energy Rebate');
      expect(result.subsidyPrograms[1].name).toBe('Fixed Grant');
    });

    it('throws ApiClientError when server returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchSubsidyPrograms()).rejects.toThrow();
    });

    it('propagates network errors as NetworkError', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      // The apiClient wraps network errors in NetworkError with 'Network request failed' message
      await expect(fetchSubsidyPrograms()).rejects.toThrow('Network request failed');
    });
  });

  // ─── fetchSubsidyProgram ───────────────────────────────────────────────────

  describe('fetchSubsidyProgram', () => {
    it('sends GET request to /api/subsidy-programs/:id', async () => {
      const mockResponse: SubsidyProgramResponse = { subsidyProgram: sampleProgram };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchSubsidyProgram('prog-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/subsidy-programs/prog-1', expect.any(Object));
    });

    it('returns the subsidy program response', async () => {
      const mockResponse: SubsidyProgramResponse = { subsidyProgram: sampleProgram };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchSubsidyProgram('prog-1');

      expect(result).toEqual(mockResponse);
      expect(result.subsidyProgram.name).toBe('Energy Rebate');
      expect(result.subsidyProgram.reductionType).toBe('percentage');
      expect(result.subsidyProgram.reductionValue).toBe(15);
    });

    it('includes correct ID in request path', async () => {
      const mockResponse: SubsidyProgramResponse = {
        subsidyProgram: { ...sampleProgram, id: 'special-prog-999' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchSubsidyProgram('special-prog-999');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/special-prog-999',
        expect.any(Object),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subsidy program not found' },
        }),
      } as Response);

      await expect(fetchSubsidyProgram('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(fetchSubsidyProgram('prog-1')).rejects.toThrow();
    });
  });

  // ─── createSubsidyProgram ──────────────────────────────────────────────────

  describe('createSubsidyProgram', () => {
    it('sends POST request to /api/subsidy-programs with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => sampleProgram,
      } as Response);

      const requestData = {
        name: 'Energy Rebate',
        reductionType: 'percentage' as const,
        reductionValue: 15,
      };
      await createSubsidyProgram(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created subsidy program', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => sampleProgram,
      } as Response);

      const result = await createSubsidyProgram({
        name: 'Energy Rebate',
        reductionType: 'percentage',
        reductionValue: 15,
        description: 'A description',
        eligibility: 'Home owners',
        applicationStatus: 'eligible',
        applicationDeadline: '2027-12-31',
        notes: 'Apply early',
        categoryIds: [],
      });

      expect(result).toEqual(sampleProgram);
      expect(result.id).toBe('prog-1');
      expect(result.name).toBe('Energy Rebate');
      expect(result.reductionType).toBe('percentage');
      expect(result.reductionValue).toBe(15);
    });

    it('sends all optional fields when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => sampleProgram,
      } as Response);

      const requestData = {
        name: 'Full Program',
        reductionType: 'fixed' as const,
        reductionValue: 5000,
        description: 'Desc',
        eligibility: 'Eligible criteria',
        applicationStatus: 'applied' as const,
        applicationDeadline: '2027-01-01',
        notes: 'Notes',
        categoryIds: ['cat-1', 'cat-2'],
      };

      await createSubsidyProgram(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'name is required' },
        }),
      } as Response);

      await expect(
        createSubsidyProgram({ name: '', reductionType: 'percentage', reductionValue: 10 }),
      ).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(
        createSubsidyProgram({ name: 'Test', reductionType: 'percentage', reductionValue: 10 }),
      ).rejects.toThrow();
    });
  });

  // ─── updateSubsidyProgram ──────────────────────────────────────────────────

  describe('updateSubsidyProgram', () => {
    it('sends PATCH request to /api/subsidy-programs/:id with body', async () => {
      const updatedProgram: SubsidyProgram = { ...sampleProgram, name: 'Updated Rebate' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProgram,
      } as Response);

      const updateData = { name: 'Updated Rebate' };
      await updateSubsidyProgram('prog-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/prog-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated subsidy program', async () => {
      const updatedProgram: SubsidyProgram = {
        ...sampleProgram,
        name: 'Updated',
        reductionValue: 25,
        applicationStatus: 'approved',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProgram,
      } as Response);

      const result = await updateSubsidyProgram('prog-1', {
        name: 'Updated',
        reductionValue: 25,
        applicationStatus: 'approved',
      });

      expect(result).toEqual(updatedProgram);
      expect(result.name).toBe('Updated');
      expect(result.reductionValue).toBe(25);
      expect(result.applicationStatus).toBe('approved');
    });

    it('handles partial update (only reductionType)', async () => {
      const updatedProgram: SubsidyProgram = { ...sampleProgram, reductionType: 'fixed' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProgram,
      } as Response);

      const updateData = { reductionType: 'fixed' as const };
      await updateSubsidyProgram('prog-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/prog-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('handles setting description to null', async () => {
      const updatedProgram: SubsidyProgram = { ...sampleProgram, description: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProgram,
      } as Response);

      const updateData = { description: null };
      await updateSubsidyProgram('prog-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/prog-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('handles updating categoryIds', async () => {
      const updatedProgram: SubsidyProgram = { ...sampleProgram };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProgram,
      } as Response);

      const updateData = { categoryIds: ['cat-1', 'cat-2'] };
      await updateSubsidyProgram('prog-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/prog-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subsidy program not found' },
        }),
      } as Response);

      await expect(updateSubsidyProgram('nonexistent', { name: 'Updated' })).rejects.toThrow();
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Percentage reduction value must not exceed 100',
          },
        }),
      } as Response);

      await expect(
        updateSubsidyProgram('prog-1', { reductionType: 'percentage', reductionValue: 110 }),
      ).rejects.toThrow();
    });

    it('includes correct ID in request path', async () => {
      const updatedProgram: SubsidyProgram = { ...sampleProgram, id: 'custom-prog-id' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProgram,
      } as Response);

      await updateSubsidyProgram('custom-prog-id', { name: 'Updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/custom-prog-id',
        expect.any(Object),
      );
    });
  });

  // ─── deleteSubsidyProgram ──────────────────────────────────────────────────

  describe('deleteSubsidyProgram', () => {
    it('sends DELETE request to /api/subsidy-programs/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteSubsidyProgram('prog-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/prog-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful deletion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteSubsidyProgram('prog-1');

      expect(result).toBeUndefined();
    });

    it('includes correct ID in request path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteSubsidyProgram('specific-prog-456');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subsidy-programs/specific-prog-456',
        expect.any(Object),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Subsidy program not found' },
        }),
      } as Response);

      await expect(deleteSubsidyProgram('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 409 SUBSIDY_PROGRAM_IN_USE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'SUBSIDY_PROGRAM_IN_USE',
            message: 'Subsidy program is in use and cannot be deleted',
            details: { workItemCount: 3 },
          },
        }),
      } as Response);

      await expect(deleteSubsidyProgram('prog-in-use')).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(deleteSubsidyProgram('prog-1')).rejects.toThrow();
    });
  });
});

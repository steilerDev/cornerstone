/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  WorkItemDependenciesResponse,
  CreateDependencyRequest,
  DependencyCreatedResponse,
} from '@cornerstone/shared';
import { getDependencies, createDependency, deleteDependency } from './dependenciesApi.js';
import { ApiClientError } from './apiClient.js';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('dependenciesApi', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('getDependencies', () => {
    it('sends GET request with correct workItemId', async () => {
      const mockResponse: WorkItemDependenciesResponse = {
        predecessors: [
          {
            workItem: {
              id: 'work-0',
              title: 'Foundation work',
              status: 'completed',
              startDate: null,
              endDate: null,
              durationDays: null,
              actualStartDate: null,
              actualEndDate: null,
              assignedUser: null,
              tags: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
            dependencyType: 'finish_to_start',
            leadLagDays: 0,
          },
        ],
        successors: [
          {
            workItem: {
              id: 'work-2',
              title: 'Follow-up work',
              status: 'not_started',
              startDate: null,
              endDate: null,
              durationDays: null,
              actualStartDate: null,
              actualEndDate: null,
              assignedUser: null,
              tags: [],
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
            dependencyType: 'finish_to_start',
            leadLagDays: 0,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await getDependencies('work-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/dependencies',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockResponse);
      expect(result.predecessors).toHaveLength(1);
      expect(result.successors).toHaveLength(1);
    });

    it('handles work item with no dependencies', async () => {
      const mockResponse: WorkItemDependenciesResponse = {
        predecessors: [],
        successors: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await getDependencies('work-1');

      expect(result.predecessors).toHaveLength(0);
      expect(result.successors).toHaveLength(0);
    });

    it('throws ApiClientError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item not found' },
        }),
      } as Response);

      await expect(getDependencies('nonexistent')).rejects.toThrow(ApiClientError);
    });
  });

  describe('createDependency', () => {
    it('sends POST request with predecessorId and finish_to_start type', async () => {
      const requestData: CreateDependencyRequest = {
        predecessorId: 'work-0',
        dependencyType: 'finish_to_start',
      };
      const mockResponse: DependencyCreatedResponse = {
        successorId: 'work-1',
        predecessorId: 'work-0',
        dependencyType: 'finish_to_start',
        leadLagDays: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createDependency('work-1', requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/dependencies',
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

    it('sends POST request with start_to_start dependency type', async () => {
      const requestData: CreateDependencyRequest = {
        predecessorId: 'work-0',
        dependencyType: 'start_to_start',
      };
      const mockResponse: DependencyCreatedResponse = {
        successorId: 'work-1',
        predecessorId: 'work-0',
        dependencyType: 'start_to_start',
        leadLagDays: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockResponse,
      } as Response);

      const result = await createDependency('work-1', requestData);

      expect(result.dependencyType).toBe('start_to_start');
    });

    it('throws ApiClientError on circular dependency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CIRCULAR_DEPENDENCY',
            message: 'Creating this dependency would create a circular dependency',
          },
        }),
      } as Response);

      await expect(
        createDependency('work-1', {
          predecessorId: 'work-2',
          dependencyType: 'finish_to_start',
        }),
      ).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError on self-dependency', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'A work item cannot depend on itself',
          },
        }),
      } as Response);

      await expect(
        createDependency('work-1', {
          predecessorId: 'work-1',
          dependencyType: 'finish_to_start',
        }),
      ).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError when predecessor does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Predecessor work item not found' },
        }),
      } as Response);

      await expect(
        createDependency('work-1', {
          predecessorId: 'nonexistent',
          dependencyType: 'finish_to_start',
        }),
      ).rejects.toThrow(ApiClientError);
    });
  });

  describe('deleteDependency', () => {
    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteDependency('work-1', 'work-0');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/work-items/work-1/dependencies/work-0',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('throws ApiClientError on 404 when dependency does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Dependency not found' },
        }),
      } as Response);

      await expect(deleteDependency('work-1', 'work-0')).rejects.toThrow(ApiClientError);
    });

    it('throws ApiClientError on 404 when work item does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Work item not found' },
        }),
      } as Response);

      await expect(deleteDependency('nonexistent', 'work-0')).rejects.toThrow(ApiClientError);
    });
  });
});

/**
 * @jest-environment jsdom
 *
 * Unit tests for useMilestones hook.
 * Tests loading state transitions, error handling for all error types,
 * and mutation method return values (create, update, delete, link, unlink).
 *
 * NOTE: These tests use global.fetch mocks rather than jest.unstable_mockModule
 * references. The hook imports from milestonesApi.js, which in turn calls
 * apiClient.ts, which calls `fetch`. Mocking fetch at the global level is more
 * reliable in this ESM module environment and avoids the instance-mismatch issue
 * noted in useTimeline.test.tsx.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, renderHook, screen, waitFor, act } from '@testing-library/react';
import type { MilestoneSummary } from '@cornerstone/shared';
import type React from 'react';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MILESTONE_1: MilestoneSummary = {
  id: 1,
  title: 'Foundation Complete',
  description: null,
  targetDate: '2024-06-30',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 0,
  dependentWorkItemCount: 0,
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const MILESTONE_2: MilestoneSummary = {
  id: 2,
  title: 'Framing Complete',
  description: 'All framing done',
  targetDate: '2024-08-15',
  isCompleted: true,
  completedAt: '2024-08-14T12:00:00Z',
  color: '#EF4444',
  workItemCount: 2,
  dependentWorkItemCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice', email: 'alice@example.com' },
  createdAt: '2024-01-02T00:00:00Z',
  updatedAt: '2024-08-14T12:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useMilestones', () => {
  // Module is cached — import once via lazy init
  let useMilestones: () => {
    milestones: MilestoneSummary[];
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
    createMilestone: (data: {
      title: string;
      targetDate: string;
    }) => Promise<MilestoneSummary | null>;
    updateMilestone: (id: number, data: { title?: string }) => Promise<MilestoneSummary | null>;
    deleteMilestone: (id: number) => Promise<boolean>;
    linkWorkItem: (milestoneId: number, workItemId: string) => Promise<boolean>;
    unlinkWorkItem: (milestoneId: number, workItemId: string) => Promise<boolean>;
  };

  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    if (!useMilestones) {
      const module = await import('./useMilestones.js');
      useMilestones = module.useMilestones;
    }
    // Each test gets a fresh fetch mock
    mockFetch = jest.fn<typeof fetch>();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    // Restore native fetch after each test
    global.fetch = undefined as unknown as typeof fetch;
  });

  // ---------------------------------------------------------------------------
  // Test component helper for state-observation tests
  // ---------------------------------------------------------------------------

  function TestComponent() {
    const { isLoading, error, milestones, refetch } = useMilestones();
    return (
      <div>
        <span data-testid="loading">{isLoading ? 'loading' : 'done'}</span>
        <span data-testid="error">{error ?? 'null'}</span>
        <span data-testid="count">{milestones.length}</span>
        <button data-testid="refetch" onClick={refetch}>
          Refetch
        </button>
      </div>
    ) as React.ReactElement;
  }

  /** Helper: configure fetch to return a list response that never resolves */
  function setupFetchNeverResolves() {
    mockFetch.mockReturnValue(new Promise<Response>(() => {}));
  }

  /** Helper: configure fetch to return a successful list response */
  function setupFetchSuccess(milestones: MilestoneSummary[]) {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ milestones }),
    } as Response);
  }

  /** Helper: configure fetch to return a specific error response */
  function setupFetchError(status: number, code: string, message: string) {
    mockFetch.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: { code, message } }),
    } as Response);
  }

  /** Helper: configure fetch to throw a network-level error */
  function setupFetchNetworkFailure() {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
  }

  // ── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts in loading state', () => {
      setupFetchNeverResolves();

      render(<TestComponent />);

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });

    it('starts with no error', () => {
      setupFetchNeverResolves();

      render(<TestComponent />);

      expect(screen.getByTestId('error')).toHaveTextContent('null');
    });

    it('starts with empty milestones array', () => {
      setupFetchNeverResolves();

      render(<TestComponent />);

      expect(screen.getByTestId('count')).toHaveTextContent('0');
    });
  });

  // ── Successful load ────────────────────────────────────────────────────────

  describe('successful load', () => {
    it('sets isLoading to false after fetch resolves', async () => {
      setupFetchSuccess([MILESTONE_1]);

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('done');
      });
    });

    it('populates milestones after fetch resolves', async () => {
      setupFetchSuccess([MILESTONE_1, MILESTONE_2]);

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('count')).toHaveTextContent('2');
      });
    });

    it('sets error to null on success', async () => {
      setupFetchSuccess([MILESTONE_1]);

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('null');
      });
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('sets isLoading to false on fetch failure', async () => {
      setupFetchNetworkFailure();

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('done');
      });
    });

    it('surfaces ApiClientError message', async () => {
      setupFetchError(500, 'INTERNAL_ERROR', 'Server is down');

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Server is down');
      });
    });

    it('surfaces NetworkError message containing "network error"', async () => {
      setupFetchNetworkFailure();

      render(<TestComponent />);

      await waitFor(() => {
        const errorText = screen.getByTestId('error').textContent ?? '';
        expect(errorText.toLowerCase()).toContain('network error');
      });
    });

    it('NetworkError message contains "unable to connect"', async () => {
      setupFetchNetworkFailure();

      render(<TestComponent />);

      await waitFor(() => {
        const errorText = screen.getByTestId('error').textContent ?? '';
        expect(errorText.toLowerCase()).toContain('unable to connect');
      });
    });

    it('shows 404 error message from ApiClientError', async () => {
      setupFetchError(404, 'NOT_FOUND', 'Milestone not found');

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Milestone not found');
      });
    });

    it('clears milestones array when load fails', async () => {
      setupFetchNetworkFailure();

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('done');
      });

      // Milestones remain empty when load fails
      expect(screen.getByTestId('count')).toHaveTextContent('0');
    });
  });

  // ── refetch ────────────────────────────────────────────────────────────────

  describe('refetch', () => {
    it('sets isLoading back to true when refetch is triggered', async () => {
      // First call resolves, second never resolves (to observe loading state)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ milestones: [MILESTONE_1] }),
        } as Response)
        .mockReturnValueOnce(new Promise<Response>(() => {}));

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('done');
      });

      act(() => {
        screen.getByTestId('refetch').click();
      });

      // Should be loading again
      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    });

    it('clears error when refetch starts', async () => {
      // First call fails, second never resolves (to observe error clearing)
      mockFetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockReturnValueOnce(new Promise<Response>(() => {}));

      render(<TestComponent />);

      await waitFor(() => {
        const errorText = screen.getByTestId('error').textContent ?? '';
        expect(errorText).not.toBe('null');
      });

      act(() => {
        screen.getByTestId('refetch').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('null');
      });
    });

    it('exposes a refetch function that can be triggered', () => {
      setupFetchNeverResolves();

      render(<TestComponent />);

      expect(screen.getByTestId('refetch')).toBeInTheDocument();
    });
  });

  // ── Mutation methods ───────────────────────────────────────────────────────
  //
  // Mutation tests use the global.fetch mock (already set in outer beforeEach).
  // Each test configures fetch to respond to both the list call (on mount)
  // and the mutation call itself.

  describe('mutation methods', () => {
    /** Helper: responds to fetch calls with appropriate responses for a mutation */
    function setupFetchForMutation(opts: {
      listResponse: MilestoneSummary[];
      mutationPath: string;
      mutationMethod: string;
      mutationResponse: unknown;
      mutationStatus?: number;
    }) {
      mockFetch.mockImplementation(async (url, init) => {
        const urlStr = String(url);
        const method = (init?.method ?? 'GET').toUpperCase();

        if (
          method === 'GET' &&
          urlStr.includes('/api/milestones') &&
          !urlStr.includes('/work-items')
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ milestones: opts.listResponse }),
          } as Response;
        }

        if (method === opts.mutationMethod.toUpperCase() && urlStr.includes(opts.mutationPath)) {
          const status = opts.mutationStatus ?? 200;
          if (status === 204) {
            return { ok: true, status: 204 } as Response;
          }
          return {
            ok: true,
            status,
            json: async () => opts.mutationResponse,
          } as Response;
        }

        // Default fallback
        return {
          ok: true,
          status: 200,
          json: async () => ({ milestones: [] }),
        } as Response;
      });
    }

    it('createMilestone returns created milestone on success', async () => {
      setupFetchForMutation({
        listResponse: [],
        mutationPath: '/api/milestones',
        mutationMethod: 'POST',
        mutationResponse: MILESTONE_1,
        mutationStatus: 201,
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: MilestoneSummary | null = null;
      await act(async () => {
        returnValue = await result.current.createMilestone({
          title: 'New',
          targetDate: '2024-09-01',
        });
      });

      expect(returnValue).toEqual(MILESTONE_1);
    });

    it('createMilestone returns null when server returns error', async () => {
      mockFetch.mockImplementation(async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ milestones: [] }) } as Response;
        }
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Bad request' } }),
        } as Response;
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: MilestoneSummary | null | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.createMilestone({ title: '', targetDate: '' });
      });

      expect(returnValue).toBeNull();
    });

    it('updateMilestone returns updated milestone on success', async () => {
      const updated: MilestoneSummary = { ...MILESTONE_1, title: 'Updated' };
      setupFetchForMutation({
        listResponse: [MILESTONE_1],
        mutationPath: '/api/milestones/1',
        mutationMethod: 'PATCH',
        mutationResponse: updated,
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: MilestoneSummary | null = null;
      await act(async () => {
        returnValue = await result.current.updateMilestone(1, { title: 'Updated' });
      });

      expect(returnValue).toEqual(updated);
    });

    it('updateMilestone returns null when server returns error', async () => {
      mockFetch.mockImplementation(async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ milestones: [] }) } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
        } as Response;
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: MilestoneSummary | null | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.updateMilestone(1, {});
      });

      expect(returnValue).toBeNull();
    });

    it('deleteMilestone returns true on success (204 No Content)', async () => {
      setupFetchForMutation({
        listResponse: [MILESTONE_1],
        mutationPath: '/api/milestones/1',
        mutationMethod: 'DELETE',
        mutationResponse: null,
        mutationStatus: 204,
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: boolean | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.deleteMilestone(1);
      });

      expect(returnValue).toBe(true);
    });

    it('deleteMilestone returns false when server returns error', async () => {
      mockFetch.mockImplementation(async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ milestones: [] }) } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
        } as Response;
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: boolean | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.deleteMilestone(999);
      });

      expect(returnValue).toBe(false);
    });

    it('linkWorkItem returns true on success', async () => {
      setupFetchForMutation({
        listResponse: [],
        mutationPath: '/api/milestones/1/work-items',
        mutationMethod: 'POST',
        mutationResponse: { milestoneId: 1, workItemId: 'wi-1' },
        mutationStatus: 201,
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: boolean | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.linkWorkItem(1, 'wi-1');
      });

      expect(returnValue).toBe(true);
    });

    it('linkWorkItem returns false when server returns error', async () => {
      mockFetch.mockImplementation(async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ milestones: [] }) } as Response;
        }
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: 'CONFLICT', message: 'Already linked' } }),
        } as Response;
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: boolean | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.linkWorkItem(1, 'wi-1');
      });

      expect(returnValue).toBe(false);
    });

    it('unlinkWorkItem returns true on success (204 No Content)', async () => {
      setupFetchForMutation({
        listResponse: [],
        mutationPath: '/api/milestones/1/work-items/wi-1',
        mutationMethod: 'DELETE',
        mutationResponse: null,
        mutationStatus: 204,
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: boolean | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.unlinkWorkItem(1, 'wi-1');
      });

      expect(returnValue).toBe(true);
    });

    it('unlinkWorkItem returns false when server returns error', async () => {
      mockFetch.mockImplementation(async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => ({ milestones: [] }) } as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
        } as Response;
      });

      const { result } = renderHook(() => useMilestones());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let returnValue: boolean | undefined = undefined;
      await act(async () => {
        returnValue = await result.current.unlinkWorkItem(1, 'wi-1');
      });

      expect(returnValue).toBe(false);
    });
  });
});

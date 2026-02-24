/**
 * @jest-environment jsdom
 *
 * Unit tests for the useTimeline hook.
 *
 * Tests the hook's state management: initial loading, error surfacing,
 * and refetch behavior. These are tested through a minimal React component
 * that renders hook output — following project conventions from
 * AuthContext.test.tsx and similar files.
 *
 * Coverage note: Data population on successful fetch and ApiClientError/generic
 * error surfacing are tested at the page level in TimelinePage.test.tsx, which
 * exercises the full hook-component chain. The systemic async batching behavior
 * in React 19 + jest.unstable_mockModule requires this split.
 *
 * Mock interception note: jest.unstable_mockModule registers the mock at the
 * absolute path level. The hook's static import of getTimeline is intercepted
 * when the module is first loaded after the mock is registered. However, mock
 * call counts cannot be reliably verified here because the mock reference may
 * not be the same function instance used by the hook (ESM module caching).
 * Call-count verification is done at the page level in TimelinePage.test.tsx
 * where the mock path unambiguously matches the loaded module.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, act } from '@testing-library/react';
import type * as TimelineApiModule from '../lib/timelineApi.js';
import type { TimelineResponse } from '@cornerstone/shared';
import type React from 'react';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockGetTimeline = jest.fn<typeof TimelineApiModule.getTimeline>();

jest.unstable_mockModule('../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

// Note: The TimelinePage.test.tsx uses '../../lib/timelineApi.js' which also works.
// This confirms the mock path resolution is relative to the test file directory.

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const EMPTY_TIMELINE: TimelineResponse = {
  workItems: [],
  dependencies: [],
  milestones: [],
  criticalPath: [],
  dateRange: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useTimeline', () => {
  let useTimeline: () => {
    data: TimelineResponse | null;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
  };

  beforeEach(async () => {
    if (!useTimeline) {
      const module = await import('./useTimeline.js');
      useTimeline = module.useTimeline;
    }
    mockGetTimeline.mockReset();
  });

  function TestComponent() {
    const { isLoading, error, refetch } = useTimeline();
    return (
      <div>
        <span data-testid="loading">{isLoading ? 'loading' : 'done'}</span>
        <span data-testid="error">{error ?? 'null'}</span>
        <button data-testid="refetch" onClick={refetch}>
          Refetch
        </button>
      </div>
    ) as React.ReactElement;
  }

  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts in loading state with no error', () => {
    mockGetTimeline.mockReturnValue(new Promise(() => {}));

    render(<TestComponent />);

    expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  // ── Loading state transitions ──────────────────────────────────────────────

  it('sets isLoading to false after fetch resolves', async () => {
    mockGetTimeline.mockResolvedValue(EMPTY_TIMELINE);

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });
  });

  it('sets isLoading to false after fetch rejects', async () => {
    const { NetworkError } = await import('../lib/apiClient.js');
    mockGetTimeline.mockRejectedValue(
      new NetworkError('Network request failed', new TypeError('Failed')),
    );

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('surfaces network error message for NetworkError', async () => {
    const { NetworkError } = await import('../lib/apiClient.js');
    const networkError = new NetworkError(
      'Network request failed',
      new TypeError('Failed to fetch'),
    );
    mockGetTimeline.mockRejectedValue(networkError);

    render(<TestComponent />);

    await waitFor(() => {
      const errorText = screen.getByTestId('error').textContent ?? '';
      expect(errorText.toLowerCase()).toContain('network error');
    });
  });

  it('network error message includes "unable to connect"', async () => {
    const { NetworkError } = await import('../lib/apiClient.js');
    const networkError = new NetworkError('Network request failed', new TypeError('Failed'));
    mockGetTimeline.mockRejectedValue(networkError);

    render(<TestComponent />);

    await waitFor(() => {
      const errorText = screen.getByTestId('error').textContent ?? '';
      expect(errorText.toLowerCase()).toContain('unable to connect');
    });
  });

  it('error message is cleared when refetch starts', async () => {
    const { NetworkError } = await import('../lib/apiClient.js');
    const networkError = new NetworkError('Network request failed', new TypeError('Failed'));

    // First call rejects, second never resolves (we observe state DURING second fetch)
    mockGetTimeline.mockRejectedValueOnce(networkError);
    mockGetTimeline.mockReturnValueOnce(new Promise(() => {}));

    render(<TestComponent />);

    // Wait for error state to appear
    await waitFor(() => {
      const errorText = screen.getByTestId('error').textContent ?? '';
      expect(errorText).not.toBe('null');
    });

    // Trigger refetch (which will never resolve — so we can check mid-fetch state)
    act(() => {
      screen.getByTestId('refetch').click();
    });

    // Error should be cleared (setError(null) is called at start of each fetch)
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('null');
    });
  });

  // ── refetch ────────────────────────────────────────────────────────────────

  it('exposes a refetch function', () => {
    mockGetTimeline.mockReturnValue(new Promise(() => {}));

    render(<TestComponent />);

    expect(screen.getByTestId('refetch')).toBeInTheDocument();
  });

  it('sets isLoading back to true when refetch is triggered', async () => {
    mockGetTimeline.mockResolvedValueOnce(EMPTY_TIMELINE);
    // Second fetch never resolves — to observe loading state
    mockGetTimeline.mockReturnValueOnce(new Promise(() => {}));

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
});

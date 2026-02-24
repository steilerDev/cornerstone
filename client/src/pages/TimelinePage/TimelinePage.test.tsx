/**
 * @jest-environment jsdom
 *
 * Smoke tests for TimelinePage — verifies the page renders without crashing
 * in a router context. Comprehensive tests for the Gantt chart functionality
 * are owned by the qa-integration-tester agent.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type * as TimelineApiTypes from '../../lib/timelineApi.js';
import type { TimelineResponse } from '@cornerstone/shared';
import type React from 'react';

const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();

jest.unstable_mockModule('../../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

const EMPTY_TIMELINE: TimelineResponse = {
  workItems: [],
  dependencies: [],
  milestones: [],
  criticalPath: [],
  dateRange: null,
};

describe('TimelinePage', () => {
  let TimelinePage: React.ComponentType;

  beforeEach(async () => {
    if (!TimelinePage) {
      const module = await import('./TimelinePage.js');
      TimelinePage = module.TimelinePage;
    }

    mockGetTimeline.mockResolvedValue(EMPTY_TIMELINE);
  });

  function renderWithRouter() {
    return render(
      <MemoryRouter>
        <TimelinePage />
      </MemoryRouter>,
    );
  }

  it('renders Timeline heading', () => {
    renderWithRouter();
    expect(screen.getByRole('heading', { name: /timeline/i })).toBeInTheDocument();
  });

  it('renders zoom level toggle controls', () => {
    renderWithRouter();
    expect(screen.getByRole('toolbar', { name: /zoom level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /day/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /week/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /month/i })).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', () => {
    // Leave in loading state by never resolving the promise
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    renderWithRouter();
    expect(screen.getByTestId('gantt-chart-skeleton')).toBeInTheDocument();
  });
});

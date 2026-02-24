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

const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();

jest.unstable_mockModule('../../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

const { TimelinePage } = await import('./TimelinePage.js');

const EMPTY_TIMELINE: TimelineResponse = {
  workItems: [],
  dependencies: [],
  milestones: [],
  criticalPath: [],
  dateRange: null,
};

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <TimelinePage />
    </MemoryRouter>,
  );
}

describe('TimelinePage', () => {
  beforeEach(() => {
    mockGetTimeline.mockResolvedValue(EMPTY_TIMELINE);
  });

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
    // Do not resolve the promise — leave in loading state
    mockGetTimeline.mockReturnValue(new Promise(() => {}));
    renderWithRouter();
    expect(screen.getByTestId('gantt-chart-skeleton')).toBeInTheDocument();
  });
});

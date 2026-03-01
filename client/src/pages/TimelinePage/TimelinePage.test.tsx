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
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type { TimelineResponse } from '@cornerstone/shared';
import type React from 'react';

const mockGetTimeline = jest.fn<typeof TimelineApiTypes.getTimeline>();

jest.unstable_mockModule('../../lib/timelineApi.js', () => ({
  getTimeline: mockGetTimeline,
}));

// Mock milestonesApi so useMilestones doesn't make real network calls.
const mockListMilestones = jest.fn<typeof MilestonesApiTypes.listMilestones>();
jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  listMilestones: mockListMilestones,
  getMilestone: jest.fn<typeof MilestonesApiTypes.getMilestone>(),
  createMilestone: jest.fn<typeof MilestonesApiTypes.createMilestone>(),
  updateMilestone: jest.fn<typeof MilestonesApiTypes.updateMilestone>(),
  deleteMilestone: jest.fn<typeof MilestonesApiTypes.deleteMilestone>(),
  linkWorkItem: jest.fn<typeof MilestonesApiTypes.linkWorkItem>(),
  unlinkWorkItem: jest.fn<typeof MilestonesApiTypes.unlinkWorkItem>(),
  addDependentWorkItem: jest.fn<typeof MilestonesApiTypes.addDependentWorkItem>(),
  removeDependentWorkItem: jest.fn<typeof MilestonesApiTypes.removeDependentWorkItem>(),
}));

// Mock useToast so TimelinePage can render without a ToastProvider wrapper.
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    toasts: [],
    showToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
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
    mockListMilestones.mockResolvedValue([]);
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

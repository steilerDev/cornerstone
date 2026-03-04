/**
 * @jest-environment jsdom
 *
 * Smoke tests for TimelinePage — verifies the page renders without crashing
 * in a router context. Comprehensive tests for the Gantt chart functionality
 * are owned by the qa-integration-tester agent.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
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
  householdItems: [],
  criticalPath: [],
  dateRange: null,
};

describe('TimelinePage', () => {
  let TimelinePage: React.ComponentType;
  let parseFilterParam: (raw: string | null) => ReadonlySet<string>;
  let serializeFilterParam: (active: ReadonlySet<string>) => string;

  beforeEach(async () => {
    if (!TimelinePage) {
      const module = await import('./TimelinePage.js');
      TimelinePage = module.TimelinePage;
      parseFilterParam = module.parseFilterParam as (raw: string | null) => ReadonlySet<string>;
      serializeFilterParam = module.serializeFilterParam as (
        active: ReadonlySet<string>,
      ) => string;
    }

    mockGetTimeline.mockResolvedValue(EMPTY_TIMELINE);
    mockListMilestones.mockResolvedValue([]);
  });

  function renderWithRouter(initialEntries?: string[]) {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
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

  // ---------------------------------------------------------------------------
  // parseFilterParam — unit tests for the exported helper
  // ---------------------------------------------------------------------------

  describe('parseFilterParam', () => {
    it('returns all 3 entity types when raw is null', () => {
      const result = parseFilterParam(null);
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(true);
      expect(result.size).toBe(3);
    });

    it('parses "work-items,milestones" into a 2-element set', () => {
      const result = parseFilterParam('work-items,milestones');
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('parses a single valid value "milestones"', () => {
      const result = parseFilterParam('milestones');
      expect(result.has('milestones')).toBe(true);
      expect(result.size).toBe(1);
    });

    it('falls back to all types when raw contains only invalid values', () => {
      const result = parseFilterParam('bad-value');
      expect(result.size).toBe(3);
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(true);
    });

    it('filters out invalid tokens and keeps valid ones', () => {
      const result = parseFilterParam('work-items,bad-value,milestones');
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(false);
      expect(result.size).toBe(2);
    });

    it('falls back to all types when raw is an empty string', () => {
      const result = parseFilterParam('');
      expect(result.size).toBe(3);
      expect(result.has('work-items')).toBe(true);
      expect(result.has('milestones')).toBe(true);
      expect(result.has('household-items')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // serializeFilterParam — unit tests for the exported helper
  // ---------------------------------------------------------------------------

  describe('serializeFilterParam', () => {
    it('serializes all 3 entity types in canonical order', () => {
      const result = serializeFilterParam(new Set(['work-items', 'milestones', 'household-items']));
      expect(result).toBe('work-items,milestones,household-items');
    });

    it('serializes a single entity type', () => {
      const result = serializeFilterParam(new Set(['milestones']));
      expect(result).toBe('milestones');
    });

    it('serializes an unordered set in canonical ALL_ENTITY_TYPES order', () => {
      // Set contains household-items before work-items, but output must follow canonical order
      const result = serializeFilterParam(new Set(['household-items', 'work-items']));
      expect(result).toBe('work-items,household-items');
    });
  });

  // ---------------------------------------------------------------------------
  // Entity filter group rendering
  // ---------------------------------------------------------------------------

  describe('entity filter group rendering', () => {
    it('renders a group with aria-label "Entity filter"', () => {
      renderWithRouter();
      expect(screen.getByRole('group', { name: /entity filter/i })).toBeInTheDocument();
    });

    it('renders three filter buttons all pressed by default', () => {
      renderWithRouter();
      const workItemsBtn = screen.getByTestId('entity-filter-work-items');
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');
      const householdItemsBtn = screen.getByTestId('entity-filter-household-items');

      expect(workItemsBtn).toHaveAttribute('aria-pressed', 'true');
      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'true');
      expect(householdItemsBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // Toggling entity filter buttons
  // ---------------------------------------------------------------------------

  describe('entity filter button toggling', () => {
    it('marks milestones button inactive after clicking it', () => {
      renderWithRouter();
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');

      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(milestonesBtn);
      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('disables the last-active button so the user cannot hide all entities', () => {
      renderWithRouter(['/timeline?filter=milestones']);
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');
      const workItemsBtn = screen.getByTestId('entity-filter-work-items');
      const householdItemsBtn = screen.getByTestId('entity-filter-household-items');

      expect(milestonesBtn).toBeDisabled();
      expect(workItemsBtn).toHaveAttribute('aria-pressed', 'false');
      expect(householdItemsBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('restores an entity when its hidden button is clicked', () => {
      renderWithRouter(['/timeline?filter=work-items']);
      const milestonesBtn = screen.getByTestId('entity-filter-milestones');

      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(milestonesBtn);
      expect(milestonesBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // ---------------------------------------------------------------------------
  // URL param initialises filter state
  // ---------------------------------------------------------------------------

  describe('entity filter URL param initialisation', () => {
    it('shows only work items active when URL has ?filter=work-items', () => {
      renderWithRouter(['/timeline?filter=work-items']);
      expect(screen.getByTestId('entity-filter-work-items')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('entity-filter-milestones')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByTestId('entity-filter-household-items')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('falls back to all entities shown when URL has an invalid filter param', () => {
      renderWithRouter(['/timeline?filter=invalid-value']);
      expect(screen.getByTestId('entity-filter-work-items')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('entity-filter-milestones')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('entity-filter-household-items')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Filter group visible in calendar view
  // ---------------------------------------------------------------------------

  describe('entity filter in calendar view', () => {
    it('shows the entity filter group when the view is calendar', () => {
      renderWithRouter(['/timeline?view=calendar']);
      expect(screen.getByRole('group', { name: /entity filter/i })).toBeInTheDocument();
    });
  });
});

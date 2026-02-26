/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { DependencyResponse } from '@cornerstone/shared';
import { DependencySentenceDisplay } from './DependencySentenceDisplay.js';

// Helper factory for mock DependencyResponse
function mockDependencyResponse(overrides: Partial<DependencyResponse> = {}): DependencyResponse {
  return {
    workItem: {
      id: 'wi-1',
      title: 'Drywall',
      status: 'not_started',
      startDate: null,
      endDate: null,
      durationDays: null,
      assignedUser: null,
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    dependencyType: 'finish_to_start',
    ...overrides,
  };
}

type OnDeleteFn = (type: 'predecessor' | 'successor', workItemId: string, title: string) => void;

function renderDisplay(
  predecessors: DependencyResponse[],
  successors: DependencyResponse[],
  onDelete: ReturnType<typeof jest.fn<OnDeleteFn>> = jest.fn<OnDeleteFn>(),
) {
  return render(
    <MemoryRouter>
      <DependencySentenceDisplay
        predecessors={predecessors}
        successors={successors}
        onDelete={onDelete}
      />
    </MemoryRouter>,
  );
}

describe('DependencySentenceDisplay', () => {
  describe('empty state', () => {
    it('renders "No dependencies" when both arrays are empty', () => {
      renderDisplay([], []);
      expect(screen.getByText('No dependencies')).toBeInTheDocument();
    });
  });

  describe('predecessor grouping', () => {
    it('renders correct group header for finish_to_start predecessor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'finish_to_start' });
      renderDisplay([dep], []);
      expect(screen.getByText('Must finish before this can start:')).toBeInTheDocument();
    });

    it('renders correct group header for start_to_start predecessor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'start_to_start' });
      renderDisplay([dep], []);
      expect(screen.getByText('Must start before this can start:')).toBeInTheDocument();
    });

    it('renders correct group header for finish_to_finish predecessor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'finish_to_finish' });
      renderDisplay([dep], []);
      expect(screen.getByText('Must finish before this can finish:')).toBeInTheDocument();
    });

    it('renders correct group header for start_to_finish predecessor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'start_to_finish' });
      renderDisplay([dep], []);
      expect(screen.getByText('Must start before this can finish:')).toBeInTheDocument();
    });

    it('renders work item title in predecessor group', () => {
      const dep = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-2', title: 'Foundation Work' },
      });
      renderDisplay([dep], []);
      expect(screen.getByText('Foundation Work')).toBeInTheDocument();
    });

    it('renders work item link with correct URL for predecessor', () => {
      const dep = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-abc', title: 'Framing' },
      });
      renderDisplay([dep], []);
      const link = screen.getByRole('link', { name: 'Framing' });
      expect(link).toHaveAttribute('href', '/work-items/wi-abc');
    });
  });

  describe('successor grouping', () => {
    it('renders correct group header for finish_to_start successor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'finish_to_start' });
      renderDisplay([], [dep]);
      expect(screen.getByText('This must finish before ... can start:')).toBeInTheDocument();
    });

    it('renders correct group header for start_to_start successor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'start_to_start' });
      renderDisplay([], [dep]);
      expect(screen.getByText('This must start before ... can start:')).toBeInTheDocument();
    });

    it('renders correct group header for finish_to_finish successor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'finish_to_finish' });
      renderDisplay([], [dep]);
      expect(screen.getByText('This must finish before ... can finish:')).toBeInTheDocument();
    });

    it('renders correct group header for start_to_finish successor', () => {
      const dep = mockDependencyResponse({ dependencyType: 'start_to_finish' });
      renderDisplay([], [dep]);
      expect(screen.getByText('This must start before ... can finish:')).toBeInTheDocument();
    });

    it('renders work item title in successor group', () => {
      const dep = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-3', title: 'Plumbing' },
      });
      renderDisplay([], [dep]);
      expect(screen.getByText('Plumbing')).toBeInTheDocument();
    });

    it('renders work item link with correct URL for successor', () => {
      const dep = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-xyz', title: 'Electrical' },
      });
      renderDisplay([], [dep]);
      const link = screen.getByRole('link', { name: 'Electrical' });
      expect(link).toHaveAttribute('href', '/work-items/wi-xyz');
    });
  });

  describe('multiple groups', () => {
    it('renders predecessors grouped by dependency type', () => {
      const dep1 = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-1', title: 'Foundation' },
        dependencyType: 'finish_to_start',
      });
      const dep2 = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-2', title: 'Excavation' },
        dependencyType: 'start_to_start',
      });
      renderDisplay([dep1, dep2], []);

      expect(screen.getByText('Must finish before this can start:')).toBeInTheDocument();
      expect(screen.getByText('Must start before this can start:')).toBeInTheDocument();
      expect(screen.getByText('Foundation')).toBeInTheDocument();
      expect(screen.getByText('Excavation')).toBeInTheDocument();
    });

    it('renders multiple items in the same group', () => {
      const dep1 = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-1', title: 'Foundation' },
        dependencyType: 'finish_to_start',
      });
      const dep2 = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-2', title: 'Excavation' },
        dependencyType: 'finish_to_start',
      });
      renderDisplay([dep1, dep2], []);

      // Only one group header should appear
      expect(screen.getAllByText('Must finish before this can start:')).toHaveLength(1);
      expect(screen.getByText('Foundation')).toBeInTheDocument();
      expect(screen.getByText('Excavation')).toBeInTheDocument();
    });
  });

  describe('delete button', () => {
    it('calls onDelete with correct type and workItemId when × is clicked for a predecessor', async () => {
      const user = userEvent.setup();
      const onDelete =
        jest.fn<(type: 'predecessor' | 'successor', workItemId: string, title: string) => void>();
      const dep = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-delete-pred', title: 'Drywall' },
        dependencyType: 'finish_to_start',
      });
      renderDisplay([dep], [], onDelete);

      const deleteButton = screen.getByRole('button', {
        name: /remove dependency on drywall/i,
      });
      await user.click(deleteButton);

      expect(onDelete).toHaveBeenCalledWith('predecessor', 'wi-delete-pred', 'Drywall');
    });

    it('calls onDelete with correct type and workItemId when × is clicked for a successor', async () => {
      const user = userEvent.setup();
      const onDelete =
        jest.fn<(type: 'predecessor' | 'successor', workItemId: string, title: string) => void>();
      const dep = mockDependencyResponse({
        workItem: {
          ...mockDependencyResponse().workItem,
          id: 'wi-delete-succ',
          title: 'Painting',
        },
        dependencyType: 'finish_to_start',
      });
      renderDisplay([], [dep], onDelete);

      const deleteButton = screen.getByRole('button', {
        name: /remove dependency on painting/i,
      });
      await user.click(deleteButton);

      expect(onDelete).toHaveBeenCalledWith('successor', 'wi-delete-succ', 'Painting');
    });

    it('renders delete button with accessible aria-label', () => {
      const dep = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-5', title: 'Roofing' },
      });
      renderDisplay([dep], []);

      const deleteButton = screen.getByRole('button', {
        name: 'Remove dependency on Roofing',
      });
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe('mixed predecessors and successors', () => {
    it('renders both predecessor and successor groups simultaneously', () => {
      const pred = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-pred', title: 'Foundation' },
        dependencyType: 'finish_to_start',
      });
      const succ = mockDependencyResponse({
        workItem: { ...mockDependencyResponse().workItem, id: 'wi-succ', title: 'Painting' },
        dependencyType: 'finish_to_finish',
      });
      renderDisplay([pred], [succ]);

      expect(screen.getByText('Must finish before this can start:')).toBeInTheDocument();
      expect(screen.getByText('This must finish before ... can finish:')).toBeInTheDocument();
      expect(screen.getByText('Foundation')).toBeInTheDocument();
      expect(screen.getByText('Painting')).toBeInTheDocument();
    });

    it('does not show "No dependencies" when at least one item exists', () => {
      const pred = mockDependencyResponse();
      renderDisplay([pred], []);
      expect(screen.queryByText('No dependencies')).not.toBeInTheDocument();
    });
  });

  describe('custom thisItemLabel', () => {
    it('uses custom thisItemLabel in predecessor header', () => {
      const dep = mockDependencyResponse({ dependencyType: 'finish_to_start' });
      render(
        <MemoryRouter>
          <DependencySentenceDisplay
            predecessors={[dep]}
            successors={[]}
            thisItemLabel="Kitchen renovation"
            onDelete={jest.fn()}
          />
        </MemoryRouter>,
      );
      expect(
        screen.getByText('Must finish before Kitchen renovation can start:'),
      ).toBeInTheDocument();
    });
  });
});

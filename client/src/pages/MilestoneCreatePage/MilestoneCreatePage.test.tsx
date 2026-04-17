/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as MilestonesApiTypes from '../../lib/milestonesApi.js';
import type { MilestoneSummary } from '@cornerstone/shared';
import type * as MilestoneCreatePageTypes from './MilestoneCreatePage.js';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockCreateMilestone = jest.fn<typeof MilestonesApiTypes.createMilestone>();

jest.unstable_mockModule('../../lib/milestonesApi.js', () => ({
  createMilestone: mockCreateMilestone,
  listMilestones: jest.fn(),
  getMilestone: jest.fn(),
  updateMilestone: jest.fn(),
  deleteMilestone: jest.fn(),
  linkWorkItem: jest.fn(),
  unlinkWorkItem: jest.fn(),
  addDependentWorkItem: jest.fn(),
  removeDependentWorkItem: jest.fn(),
  fetchMilestoneLinkedHouseholdItems: jest.fn(),
}));

// ── Location capture helper ───────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const createdMilestone: MilestoneSummary = {
  id: 42,
  title: 'Roof Complete',
  description: null,
  targetDate: '2026-06-15',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 0,
  dependentWorkItemCount: 0,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('MilestoneCreatePage', () => {
  let MilestoneCreatePageModule: typeof MilestoneCreatePageTypes;

  beforeEach(async () => {
    mockCreateMilestone.mockReset();

    if (!MilestoneCreatePageModule) {
      MilestoneCreatePageModule = await import('./MilestoneCreatePage.js');
    }
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/project/milestones/new']}>
        <Routes>
          <Route
            path="/project/milestones/new"
            element={<MilestoneCreatePageModule.MilestoneCreatePage />}
          />
          <Route path="/project/milestones/:id" element={<div>Milestone Detail</div>} />
          <Route path="/project/milestones" element={<div>Milestones List</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );
  }

  // ─── Form rendering ───────────────────────────────────────────────────────

  describe('form rendering', () => {
    it('renders the create form with title input', () => {
      renderPage();

      expect(screen.getByTestId('milestone-title-input')).toBeInTheDocument();
    });

    it('renders the target date input', () => {
      renderPage();

      expect(screen.getByTestId('milestone-target-date-input')).toBeInTheDocument();
    });

    it('renders the description textarea', () => {
      renderPage();

      expect(screen.getByTestId('milestone-description-input')).toBeInTheDocument();
    });

    it('renders the create/submit button', () => {
      renderPage();

      expect(screen.getByTestId('create-milestone-button')).toBeInTheDocument();
    });

    it('renders the back link to milestones list', () => {
      renderPage();

      // The header back link ("← Milestones") is the anchor with a "←" prefix;
      // narrower regex avoids matching the SubNav Milestones tab or Cancel link.
      const backLink = screen.getByRole('link', { name: /←\s*milestones/i });
      expect(backLink).toBeInTheDocument();
    });

    it('title input starts empty', () => {
      renderPage();

      const titleInput = screen.getByTestId('milestone-title-input');
      expect(titleInput).toHaveValue('');
    });

    it('target date input starts empty', () => {
      renderPage();

      const dateInput = screen.getByTestId('milestone-target-date-input');
      expect(dateInput).toHaveValue('');
    });

    it('description input starts empty', () => {
      renderPage();

      const descInput = screen.getByTestId('milestone-description-input');
      expect(descInput).toHaveValue('');
    });

    it('submit button is enabled initially', () => {
      renderPage();

      expect(screen.getByTestId('create-milestone-button')).not.toBeDisabled();
    });
  });

  // ─── Validation ──────────────────────────────────────────────────────────

  describe('form validation', () => {
    it('shows error when submitting without a title', async () => {
      const user = userEvent.setup();
      renderPage();

      // Set only date, not title
      await user.type(screen.getByTestId('milestone-target-date-input'), '2026-06-15');
      // Use fireEvent.submit to bypass native HTML required validation
      fireEvent.submit(screen.getByTestId('create-milestone-button').closest('form')!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateMilestone).not.toHaveBeenCalled();
    });

    it('shows error when submitting without a target date', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'My Milestone');
      // Use fireEvent.submit to bypass native HTML required validation
      fireEvent.submit(screen.getByTestId('create-milestone-button').closest('form')!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateMilestone).not.toHaveBeenCalled();
    });

    it('shows error when both title and date are missing', async () => {
      renderPage();

      // Use fireEvent.submit to bypass native HTML required validation
      fireEvent.submit(screen.getByTestId('create-milestone-button').closest('form')!);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(mockCreateMilestone).not.toHaveBeenCalled();
    });
  });

  // ─── Successful submission ────────────────────────────────────────────────

  describe('successful submission', () => {
    it('calls createMilestone with title and targetDate', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockResolvedValueOnce(createdMilestone);

      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Roof Complete',
            targetDate: '2026-06-15',
          }),
        );
      });
    });

    it('navigates to the milestone detail page after creation', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockResolvedValueOnce(createdMilestone);

      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/project/milestones/42');
      });
    });

    it('includes description when provided', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockResolvedValueOnce(createdMilestone);

      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.type(screen.getByTestId('milestone-description-input'), 'All roofing done');
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(mockCreateMilestone).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Roof Complete',
            targetDate: '2026-06-15',
            description: 'All roofing done',
          }),
        );
      });
    });

    it('disables submit button while submitting', async () => {
      let resolveCreate: (v: MilestoneSummary) => void;
      mockCreateMilestone.mockReturnValueOnce(
        new Promise<MilestoneSummary>((res) => {
          resolveCreate = res;
        }),
      );

      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(screen.getByTestId('create-milestone-button')).toBeDisabled();
      });

      // Resolve to avoid dangling promises
      resolveCreate!(createdMilestone);
    });
  });

  // ─── API error handling ───────────────────────────────────────────────────

  describe('API error handling', () => {
    it('shows ApiClientError message when creation fails', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockRejectedValueOnce(
        new ApiClientError(409, {
          code: 'CONFLICT',
          message: 'A milestone with this title already exists',
        }),
      );

      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('A milestone with this title already exists')).toBeInTheDocument();
      });
    });

    it('shows generic error message when non-ApiClientError is thrown', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockRejectedValueOnce(new Error('Network failure'));

      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/failed to create milestone/i)).toBeInTheDocument();
      });
    });

    it('re-enables submit button after error', async () => {
      const user = userEvent.setup();
      mockCreateMilestone.mockRejectedValueOnce(new Error('Failure'));

      renderPage();

      await user.type(screen.getByTestId('milestone-title-input'), 'Roof Complete');
      fireEvent.change(screen.getByTestId('milestone-target-date-input'), {
        target: { value: '2026-06-15' },
      });
      await user.click(screen.getByTestId('create-milestone-button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByTestId('create-milestone-button')).not.toBeDisabled();
    });
  });
});

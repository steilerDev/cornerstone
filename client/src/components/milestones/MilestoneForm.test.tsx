/**
 * @jest-environment jsdom
 *
 * Unit tests for MilestoneForm component.
 * Tests create mode (empty form), edit mode (pre-filled), form validation,
 * and submit/cancel handlers.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as MilestoneFormTypes from './MilestoneForm.js';
import type { MilestoneSummary } from '@cornerstone/shared';

// Mock workItemsApi before dynamic import of MilestoneForm (which imports WorkItemSelector)
const mockListWorkItems = jest.fn<typeof WorkItemsApiTypes.listWorkItems>();

jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({
  listWorkItems: mockListWorkItems,
  getWorkItem: jest.fn(),
  createWorkItem: jest.fn(),
  updateWorkItem: jest.fn(),
  deleteWorkItem: jest.fn(),
  fetchWorkItemSubsidies: jest.fn(),
  linkWorkItemSubsidy: jest.fn(),
  unlinkWorkItemSubsidy: jest.fn(),
}));

// MilestoneForm is dynamically imported after the mock is set up
let MilestoneForm: (typeof MilestoneFormTypes)['MilestoneForm'];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const defaultPagination = { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };

const MILESTONE: MilestoneSummary = {
  id: 1,
  title: 'Foundation Complete',
  description: 'All foundation work done',
  targetDate: '2024-06-30',
  isCompleted: false,
  completedAt: null,
  color: null,
  workItemCount: 2,
  createdBy: null,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const COMPLETED_MILESTONE: MilestoneSummary = {
  ...MILESTONE,
  id: 2,
  title: 'Framing Done',
  isCompleted: true,
  completedAt: '2024-08-14T12:00:00Z',
  targetDate: '2024-08-15',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadMilestoneForm() {
  if (!MilestoneForm) {
    const mod = await import('./MilestoneForm.js');
    MilestoneForm = mod.MilestoneForm as typeof MilestoneForm;
  }
}

function renderCreate(
  overrides: {
    isSubmitting?: boolean;
    submitError?: string | null;
    onSubmit?: jest.Mock;
    onCancel?: jest.Mock;
  } = {},
) {
  const onSubmit = overrides.onSubmit ?? jest.fn();
  const onCancel = overrides.onCancel ?? jest.fn();
  return render(
    <MilestoneForm
      milestone={null}
      isSubmitting={overrides.isSubmitting ?? false}
      submitError={overrides.submitError ?? null}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
}

function renderEdit(
  milestone: MilestoneSummary = MILESTONE,
  overrides: {
    isSubmitting?: boolean;
    submitError?: string | null;
    onSubmit?: jest.Mock;
    onCancel?: jest.Mock;
  } = {},
) {
  const onSubmit = overrides.onSubmit ?? jest.fn();
  const onCancel = overrides.onCancel ?? jest.fn();
  return render(
    <MilestoneForm
      milestone={milestone}
      isSubmitting={overrides.isSubmitting ?? false}
      submitError={overrides.submitError ?? null}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MilestoneForm', () => {
  beforeEach(async () => {
    await loadMilestoneForm();
    mockListWorkItems.mockReset();
    // Default: return empty list so WorkItemSelector doesn't leave pending promises
    mockListWorkItems.mockResolvedValue({ items: [], pagination: defaultPagination });
  });

  // ── Create mode ────────────────────────────────────────────────────────────

  describe('create mode', () => {
    it('renders the form element', () => {
      renderCreate();
      expect(screen.getByTestId('milestone-form')).toBeInTheDocument();
    });

    it('has aria-label "Create milestone"', () => {
      renderCreate();
      expect(screen.getByRole('form', { name: /create milestone/i })).toBeInTheDocument();
    });

    it('renders empty title input', () => {
      renderCreate();
      const input = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('renders empty description textarea', () => {
      renderCreate();
      const textarea = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('');
    });

    it('renders empty date input', () => {
      renderCreate();
      const input = screen.getByLabelText(/target date/i) as HTMLInputElement;
      expect(input.value).toBe('');
    });

    it('does not render completed checkbox in create mode', () => {
      renderCreate();
      expect(screen.queryByLabelText(/mark as completed/i)).not.toBeInTheDocument();
    });

    it('renders "Create Milestone" submit button', () => {
      renderCreate();
      expect(screen.getByTestId('milestone-form-submit')).toHaveTextContent('Create Milestone');
    });

    it('renders Cancel button', () => {
      renderCreate();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('shows WorkItemSelector in create mode', () => {
      renderCreate();
      expect(screen.getByTestId('work-item-selector')).toBeInTheDocument();
    });

    it('shows "Contributing Work Items" label in create mode', () => {
      renderCreate();
      // Use exact text match to avoid matching the hint text "Contributing work items..."
      const labels = screen.getAllByText(/contributing work items/i);
      // At least one element should be a label element
      const labelEl = labels.find((el) => el.tagName.toLowerCase() === 'label');
      expect(labelEl).toBeInTheDocument();
    });

    it('shows help text about projected date in create mode', () => {
      renderCreate();
      expect(screen.getByText(/projected date/i)).toBeInTheDocument();
    });

    it('submits with workItemIds=undefined when no work items are selected', () => {
      // The MilestoneForm sends workItemIds as undefined when no items are selected
      // (not as an empty array), to keep the create payload minimal.
      const onSubmit = jest.fn();
      renderCreate({ onSubmit });

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test Milestone' } });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-09-01' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      const callArg = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      // workItemIds is sent as undefined when no items selected (optimized payload)
      expect(callArg.workItemIds).toBeUndefined();
    });
  });

  // ── Edit mode ──────────────────────────────────────────────────────────────

  describe('edit mode', () => {
    it('has aria-label "Edit milestone"', () => {
      renderEdit();
      expect(screen.getByRole('form', { name: /edit milestone/i })).toBeInTheDocument();
    });

    it('pre-fills title from milestone', () => {
      renderEdit();
      const input = screen.getByLabelText(/name/i) as HTMLInputElement;
      expect(input.value).toBe('Foundation Complete');
    });

    it('pre-fills description from milestone', () => {
      renderEdit();
      const textarea = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
      expect(textarea.value).toBe('All foundation work done');
    });

    it('pre-fills target date from milestone', () => {
      renderEdit();
      const input = screen.getByLabelText(/target date/i) as HTMLInputElement;
      expect(input.value).toBe('2024-06-30');
    });

    it('renders completed checkbox in edit mode', () => {
      renderEdit();
      expect(screen.getByLabelText(/mark as completed/i)).toBeInTheDocument();
    });

    it('checkbox is unchecked for incomplete milestone', () => {
      renderEdit();
      const checkbox = screen.getByLabelText(/mark as completed/i) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
    });

    it('checkbox is checked for completed milestone', () => {
      renderEdit(COMPLETED_MILESTONE);
      const checkbox = screen.getByLabelText(/mark as completed/i) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
    });

    it('renders "Save Changes" submit button', () => {
      renderEdit();
      expect(screen.getByTestId('milestone-form-submit')).toHaveTextContent('Save Changes');
    });

    it('shows completed date when milestone is completed', () => {
      renderEdit(COMPLETED_MILESTONE);
      expect(screen.getByText(/completed on/i)).toBeInTheDocument();
    });

    it('does not show completed date for incomplete milestone', () => {
      renderEdit();
      expect(screen.queryByText(/completed on/i)).not.toBeInTheDocument();
    });

    it('pre-fills target date from milestone with plain date string', () => {
      const milestoneWithPlainDate: MilestoneSummary = {
        ...MILESTONE,
        targetDate: '2024-09-15',
      };
      renderEdit(milestoneWithPlainDate);
      const input = screen.getByLabelText(/target date/i) as HTMLInputElement;
      expect(input.value).toBe('2024-09-15');
    });

    it('does NOT show WorkItemSelector in edit mode', () => {
      renderEdit();
      expect(screen.queryByTestId('work-item-selector')).not.toBeInTheDocument();
    });

    it('does NOT show the projected date help text in edit mode', () => {
      renderEdit();
      expect(screen.queryByText(/projected date/i)).not.toBeInTheDocument();
    });
  });

  // ── Form validation ────────────────────────────────────────────────────────

  describe('form validation', () => {
    it('shows title error when submitting without a title', async () => {
      renderCreate();

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByText(/milestone name is required/i)).toBeInTheDocument();
      });
    });

    it('shows date error when submitting without a target date', async () => {
      renderCreate();

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test' } });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByText(/target date is required/i)).toBeInTheDocument();
      });
    });

    it('shows both errors when title and date are missing', async () => {
      renderCreate();

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByText(/milestone name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/target date is required/i)).toBeInTheDocument();
      });
    });

    it('title error is marked as role="alert"', async () => {
      renderCreate();

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const titleAlert = alerts.find((a) => a.textContent?.includes('Milestone name'));
        expect(titleAlert).toBeInTheDocument();
      });
    });

    it('clears title error when user types in title field', async () => {
      renderCreate();

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByText(/milestone name is required/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test' } });

      expect(screen.queryByText(/milestone name is required/i)).not.toBeInTheDocument();
    });

    it('clears date error when user selects a date', async () => {
      renderCreate();

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      await waitFor(() => {
        expect(screen.getByText(/target date is required/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-09-01' },
      });

      expect(screen.queryByText(/target date is required/i)).not.toBeInTheDocument();
    });

    it('does not call onSubmit when validation fails', () => {
      const onSubmit = jest.fn();
      renderCreate({ onSubmit });

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  // ── Form submission ────────────────────────────────────────────────────────

  describe('form submission', () => {
    it('calls onSubmit with trimmed title and date in create mode', () => {
      const onSubmit = jest.fn();
      renderCreate({ onSubmit });

      fireEvent.change(screen.getByLabelText(/name/i), {
        target: { value: '  Foundation Complete  ' },
      });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-06-30' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Foundation Complete',
          targetDate: '2024-06-30',
        }),
      );
    });

    it('passes null description when description is empty in create mode', () => {
      const onSubmit = jest.fn();
      renderCreate({ onSubmit });

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-06-30' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
    });

    it('passes trimmed description in create mode', () => {
      const onSubmit = jest.fn();
      renderCreate({ onSubmit });

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: '  My description  ' },
      });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-06-30' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'My description' }),
      );
    });

    it('calls onSubmit with isCompleted field in edit mode', () => {
      const onSubmit = jest.fn();
      renderEdit(MILESTONE, { onSubmit });

      // Check the completed checkbox
      fireEvent.click(screen.getByLabelText(/mark as completed/i));

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isCompleted: true }));
    });

    it('calls onSubmit with isCompleted=false by default in edit mode', () => {
      const onSubmit = jest.fn();
      renderEdit(MILESTONE, { onSubmit });

      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ isCompleted: false }));
    });

    it('does not include isCompleted in create mode payload', () => {
      const onSubmit = jest.fn();
      renderCreate({ onSubmit });

      fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/target date/i), {
        target: { value: '2024-06-30' },
      });
      fireEvent.click(screen.getByTestId('milestone-form-submit'));

      const callArg = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg).not.toHaveProperty('isCompleted');
    });
  });

  // ── Cancel button ──────────────────────────────────────────────────────────

  describe('cancel button', () => {
    it('calls onCancel when Cancel button is clicked', () => {
      const onCancel = jest.fn();
      renderCreate({ onCancel });

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onCancel).toHaveBeenCalled();
    });
  });

  // ── Submitting state ───────────────────────────────────────────────────────

  describe('submitting state', () => {
    it('shows "Saving…" text on submit button when isSubmitting=true', () => {
      renderCreate({ isSubmitting: true });
      expect(screen.getByTestId('milestone-form-submit')).toHaveTextContent('Saving…');
    });

    it('disables submit button when isSubmitting=true', () => {
      renderCreate({ isSubmitting: true });
      expect(screen.getByTestId('milestone-form-submit')).toBeDisabled();
    });

    it('disables cancel button when isSubmitting=true', () => {
      renderCreate({ isSubmitting: true });
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    });

    it('disables title input when isSubmitting=true', () => {
      renderCreate({ isSubmitting: true });
      expect(screen.getByLabelText(/name/i)).toBeDisabled();
    });
  });

  // ── Error banner ───────────────────────────────────────────────────────────

  describe('error banner', () => {
    it('renders error banner when submitError is provided', () => {
      renderCreate({ submitError: 'Failed to create milestone. Please try again.' });
      expect(screen.getByText(/failed to create milestone/i)).toBeInTheDocument();
    });

    it('error banner has role="alert"', () => {
      renderCreate({ submitError: 'Server error' });
      const alerts = screen.getAllByRole('alert');
      const bannerAlert = alerts.find((a) => a.textContent?.includes('Server error'));
      expect(bannerAlert).toBeInTheDocument();
    });

    it('does not render error banner when submitError is null', () => {
      renderCreate({ submitError: null });
      // No alert role for API error banner expected when no error
      const alerts = screen.queryAllByRole('alert');
      expect(alerts).toHaveLength(0);
    });
  });
});

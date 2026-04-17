/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type React from 'react';
import type { BudgetSource, BudgetSourceListResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type { MassMoveModalProps } from './MassMoveModal.js';

// ─── Module-scope mock functions ─────────────────────────────────────────────

const mockFetchBudgetSources = jest.fn<() => Promise<BudgetSourceListResponse>>();
const mockMoveBudgetLinesBetweenSources = jest.fn<
  (
    sourceId: string,
    data: {
      workItemBudgetIds: string[];
      householdItemBudgetIds: string[];
      targetSourceId: string;
    },
  ) => Promise<{ movedWorkItemLines: number; movedHouseholdItemLines: number }>
>();

// Captured SearchPicker callbacks for test-triggered selection
let capturedSearchPickerOnChange: ((id: string) => void) | null = null;
let capturedSearchPickerOnSelectItem: ((item: { id: string; label: string }) => void) | null = null;

// ─── Mock: budgetSourcesApi ───────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchBudgetSources,
  fetchBudgetSource: jest.fn(),
  createBudgetSource: jest.fn(),
  updateBudgetSource: jest.fn(),
  deleteBudgetSource: jest.fn(),
  fetchBudgetLinesForSource: jest.fn(),
  moveBudgetLinesBetweenSources: mockMoveBudgetLinesBetweenSources,
}));

// ─── Mock: errorTranslation ───────────────────────────────────────────────────

jest.unstable_mockModule('../../lib/errorTranslation.js', () => ({
  translateApiError: (_code: string, _t: unknown) => 'Translated error',
}));

// ─── Mock: SearchPicker — simple input that stores callbacks ─────────────────

jest.unstable_mockModule('../SearchPicker/SearchPicker.js', () => ({
  SearchPicker: ({
    onChange,
    onSelectItem,
    placeholder,
    id,
    disabled,
  }: {
    value: string;
    onChange: (id: string) => void;
    onSelectItem?: (item: { id: string; label: string }) => void;
    placeholder?: string;
    id?: string;
    disabled?: boolean;
  }) => {
    capturedSearchPickerOnChange = onChange;
    capturedSearchPickerOnSelectItem = onSelectItem ?? null;
    return (
      <input
        id={id}
        data-testid="mock-search-picker"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

// ─── Mock: Modal — renders title + children + footer ─────────────────────────

jest.unstable_mockModule('../Modal/Modal.js', () => ({
  Modal: ({
    title,
    children,
    footer,
    onClose,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    onClose: () => void;
  }) => (
    <div data-testid="mock-modal">
      <h2>{title}</h2>
      <button type="button" aria-label="close" onClick={onClose}>
        Close
      </button>
      <div>{children}</div>
      <div data-testid="modal-footer">{footer}</div>
    </div>
  ),
}));

// ─── Mock: FormError — renders a banner with role="alert" ────────────────────

jest.unstable_mockModule('../FormError/FormError.js', () => ({
  FormError: ({ message }: { message: string; variant?: string }) => (
    <div role="alert" data-testid="form-error">
      {message}
    </div>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBudgetSource(
  id: string,
  name: string,
  overrides: Partial<BudgetSource> = {},
): BudgetSource {
  return {
    id,
    name,
    sourceType: 'bank_loan',
    totalAmount: 100000,
    usedAmount: 0,
    availableAmount: 100000,
    claimedAmount: 0,
    unclaimedAmount: 0,
    actualAvailableAmount: 100000,
    paidAmount: 0,
    projectedAmount: 0,
    isDiscretionary: false,
    interestRate: null,
    terms: null,
    notes: null,
    status: 'active',
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildProps(overrides: Partial<MassMoveModalProps> = {}): MassMoveModalProps {
  return {
    sourceId: 'src-origin',
    sourceName: 'Home Loan',
    selectedLineIds: new Set(['wib-1', 'wib-2']),
    claimedCount: 0,
    workItemBudgetIds: ['wib-1', 'wib-2'],
    householdItemBudgetIds: [],
    onClose: jest.fn(),
    onSuccess: jest.fn(),
    ...overrides,
  };
}

// ─── Component import (after mocks) ──────────────────────────────────────────

let MassMoveModal: (typeof import('./MassMoveModal.js'))['MassMoveModal'];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MassMoveModal', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    capturedSearchPickerOnChange = null;
    capturedSearchPickerOnSelectItem = null;

    // Default: available sources list
    mockFetchBudgetSources.mockResolvedValue({
      budgetSources: [
        makeBudgetSource('src-origin', 'Home Loan'),
        makeBudgetSource('src-target', 'Savings Account'),
        makeBudgetSource('src-other', 'Credit Line'),
      ],
    });

    if (!MassMoveModal) {
      const module = await import('./MassMoveModal.js');
      MassMoveModal = module.MassMoveModal;
    }
  });

  // ─── Title & context line ────────────────────────────────────────────────

  describe('static content', () => {
    it('renders modal title "Move lines to another source"', () => {
      render(<MassMoveModal {...buildProps()} />);

      expect(screen.getByText('Move lines to another source')).toBeInTheDocument();
    });

    it('renders context line showing count and sourceName for 2 lines', () => {
      render(
        <MassMoveModal
          {...buildProps({ selectedLineIds: new Set(['wib-1', 'wib-2']), sourceName: 'Home Loan' })}
        />,
      );

      // movingCount_other: "Moving {{count}} lines from {{sourceName}}"
      expect(screen.getByText(/Moving 2 lines from Home Loan/i)).toBeInTheDocument();
    });

    it('renders context line for 1 line (singular)', () => {
      render(
        <MassMoveModal
          {...buildProps({
            selectedLineIds: new Set(['wib-1']),
            workItemBudgetIds: ['wib-1'],
            sourceName: 'Savings',
          })}
        />,
      );

      // movingCount_one: "Moving {{count}} line from {{sourceName}}"
      expect(screen.getByText(/Moving 1 line from Savings/i)).toBeInTheDocument();
    });

    it('renders the SearchPicker with placeholder', () => {
      render(<MassMoveModal {...buildProps()} />);

      const picker = screen.getByTestId('mock-search-picker');
      expect(picker).toBeInTheDocument();
      expect(picker).toHaveAttribute('placeholder', 'Search sources…');
    });
  });

  // ─── No warning when claimedCount=0 ──────────────────────────────────────

  describe('claimedCount = 0 (no warning)', () => {
    it('does not render warning block when claimedCount is 0', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not render "I understand" checkbox when claimedCount is 0', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      expect(screen.queryByText(/I understand/i)).not.toBeInTheDocument();
    });
  });

  // ─── Warning block when claimedCount > 0 ─────────────────────────────────

  describe('claimedCount > 0 (warning block)', () => {
    it('renders warning alert block when claimedCount > 0', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 2 })} />);

      // Warning block has role="alert"
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('renders warning heading containing "claimed invoice" when claimedCount=1', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 1 })} />);

      // claimedWarningHeading_one: "{{count}} line has a claimed invoice"
      expect(screen.getByText(/1 line has a claimed invoice/i)).toBeInTheDocument();
    });

    it('renders warning heading for multiple claimed lines when claimedCount=3', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 3 })} />);

      // claimedWarningHeading_other: "{{count}} lines have a claimed invoice"
      expect(screen.getByText(/3 lines have a claimed invoice/i)).toBeInTheDocument();
    });

    it('renders "I understand" checkbox when claimedCount > 0', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 1 })} />);

      expect(
        screen.getByLabelText(/I understand this will reassign lines with a claimed invoice/i),
      ).toBeInTheDocument();
    });
  });

  // ─── Confirm button aria-disabled logic ──────────────────────────────────

  describe('confirm button disabled state', () => {
    it('confirm button is aria-disabled when claimedCount>0, "I understand" unchecked, target picked', async () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 1 })} />);

      // Simulate selecting a target source
      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('confirm button is aria-disabled when claimedCount>0, "I understand" checked, target NOT picked', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 1 })} />);

      // Check "I understand" but don't pick a target
      const understoodCheckbox = screen.getByLabelText(
        /I understand this will reassign lines with a claimed invoice/i,
      );
      fireEvent.click(understoodCheckbox);

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('confirm button is NOT aria-disabled when claimedCount=0 and target is picked', async () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      expect(confirmButton).toHaveAttribute('aria-disabled', 'false');
    });

    it('confirm button is NOT aria-disabled when claimedCount>0, "I understand" checked, target picked', async () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 1 })} />);

      // Pick target
      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      // Check "I understand"
      const understoodCheckbox = screen.getByLabelText(
        /I understand this will reassign lines with a claimed invoice/i,
      );
      fireEvent.click(understoodCheckbox);

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      expect(confirmButton).toHaveAttribute('aria-disabled', 'false');
    });

    it('confirm button is initially aria-disabled when no target is selected (claimedCount=0)', () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
    });
  });

  // ─── Clicking confirm when aria-disabled does NOT submit ─────────────────

  describe('confirm blocked when aria-disabled', () => {
    it('does NOT call moveBudgetLinesBetweenSources when confirm is clicked with no target selected', async () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      // No target picked — confirm is disabled
      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockMoveBudgetLinesBetweenSources).not.toHaveBeenCalled();
      });
    });

    it('does NOT call moveBudgetLinesBetweenSources when claimedCount>0 and "I understand" is unchecked', async () => {
      render(<MassMoveModal {...buildProps({ claimedCount: 1 })} />);

      // Pick target but skip "I understand"
      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockMoveBudgetLinesBetweenSources).not.toHaveBeenCalled();
      });
    });
  });

  // ─── Success path ─────────────────────────────────────────────────────────

  describe('success path', () => {
    it('calls moveBudgetLinesBetweenSources with correct payload on confirm', async () => {
      mockMoveBudgetLinesBetweenSources.mockResolvedValue({
        movedWorkItemLines: 2,
        movedHouseholdItemLines: 0,
      });

      const props = buildProps({
        sourceId: 'src-origin',
        workItemBudgetIds: ['wib-1', 'wib-2'],
        householdItemBudgetIds: [],
        claimedCount: 0,
      });
      render(<MassMoveModal {...props} />);

      // Pick target
      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      const confirmButton = screen.getByRole('button', { name: /Move lines/i });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockMoveBudgetLinesBetweenSources).toHaveBeenCalledWith('src-origin', {
          workItemBudgetIds: ['wib-1', 'wib-2'],
          householdItemBudgetIds: [],
          targetSourceId: 'src-target',
        });
      });
    });

    it('calls onSuccess(totalMoved, targetName) after successful move', async () => {
      mockMoveBudgetLinesBetweenSources.mockResolvedValue({
        movedWorkItemLines: 2,
        movedHouseholdItemLines: 1,
      });

      const onSuccess = jest.fn<(count: number, name: string) => void>();
      render(<MassMoveModal {...buildProps({ claimedCount: 0, onSuccess })} />);

      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Move lines/i }));
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(3, 'Savings Account');
      });
    });

    it('calls onClose after successful move', async () => {
      mockMoveBudgetLinesBetweenSources.mockResolvedValue({
        movedWorkItemLines: 1,
        movedHouseholdItemLines: 0,
      });

      const onClose = jest.fn();
      render(<MassMoveModal {...buildProps({ claimedCount: 0, onClose })} />);

      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Move lines/i }));
      });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─── API error path ───────────────────────────────────────────────────────

  describe('API error path', () => {
    it('shows FormError banner when moveBudgetLinesBetweenSources throws ApiClientError', async () => {
      mockMoveBudgetLinesBetweenSources.mockRejectedValue(
        new ApiClientError(400, { code: 'SAME_SOURCE', message: 'Source and target must differ' }),
      );

      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Move lines/i }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toBeInTheDocument();
      });
    });

    it('modal stays open (onClose not called) after API error', async () => {
      mockMoveBudgetLinesBetweenSources.mockRejectedValue(
        new ApiClientError(409, {
          code: 'STALE_OWNERSHIP',
          message: 'Lines no longer belong to this source',
        }),
      );

      const onClose = jest.fn();
      render(<MassMoveModal {...buildProps({ claimedCount: 0, onClose })} />);

      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Move lines/i }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('form-error')).toBeInTheDocument();
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('shows generic error message for non-ApiClientError exceptions', async () => {
      mockMoveBudgetLinesBetweenSources.mockRejectedValue(new Error('Network timeout'));

      render(<MassMoveModal {...buildProps({ claimedCount: 0 })} />);

      await act(async () => {
        if (capturedSearchPickerOnChange) capturedSearchPickerOnChange('src-target');
        if (capturedSearchPickerOnSelectItem)
          capturedSearchPickerOnSelectItem({ id: 'src-target', label: 'Savings Account' });
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Move lines/i }));
      });

      await waitFor(() => {
        const errorBanner = screen.getByTestId('form-error');
        expect(errorBanner).toBeInTheDocument();
        // Generic error message
        expect(errorBanner.textContent).toContain('Failed to move lines');
      });
    });
  });

  // ─── Cancel button ────────────────────────────────────────────────────────

  describe('cancel button', () => {
    it('clicking Cancel calls onClose', () => {
      const onClose = jest.fn();
      render(<MassMoveModal {...buildProps({ onClose })} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not call moveBudgetLinesBetweenSources when Cancel is clicked', () => {
      render(<MassMoveModal {...buildProps()} />);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(mockMoveBudgetLinesBetweenSources).not.toHaveBeenCalled();
    });
  });
});

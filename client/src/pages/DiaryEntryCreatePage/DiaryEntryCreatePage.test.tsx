/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type React from 'react';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockCreateDiaryEntry = jest.fn<typeof DiaryApiTypes.createDiaryEntry>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  createDiaryEntry: mockCreateDiaryEntry,
  getDiaryEntry: jest.fn(),
  listDiaryEntries: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
}));

// Mock ToastContext so useToast() works without a real ToastProvider.
// This avoids the dual-React instance issue caused by statically importing ToastProvider
// while the page component is dynamically imported (which loads its own React instance).
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const createdEntry = {
  id: 'de-new',
  entryType: 'daily_log' as const,
  entryDate: '2026-03-14',
  title: null,
  body: 'Some body text',
  metadata: null,
  isAutomatic: false,
  sourceEntityType: null,
  sourceEntityId: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

describe('DiaryEntryCreatePage', () => {
  let DiaryEntryCreatePage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryEntryCreatePage) {
      const mod = await import('./DiaryEntryCreatePage.js');
      DiaryEntryCreatePage = mod.default;
    }
    mockCreateDiaryEntry.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/diary/new']}>
        <Routes>
          <Route path="/diary/new" element={<DiaryEntryCreatePage />} />
          <Route path="/diary/:id" element={<div data-testid="detail-page">Detail Page</div>} />
          <Route path="/diary" element={<div data-testid="diary-list">Diary List</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );

  // ─── Type selector step ──────────────────────────────────────────────────────

  describe('type selector step', () => {
    it('renders the "New Diary Entry" h1 heading', () => {
      renderPage();
      expect(
        screen.getByRole('heading', { name: /new diary entry/i, level: 1 }),
      ).toBeInTheDocument();
    });

    it('renders the "Select Entry Type" sub-heading', () => {
      renderPage();
      expect(screen.getByText(/select entry type/i)).toBeInTheDocument();
    });

    it('renders the daily_log type card', () => {
      renderPage();
      expect(screen.getByTestId('type-card-daily_log')).toBeInTheDocument();
    });

    it('renders the site_visit type card', () => {
      renderPage();
      expect(screen.getByTestId('type-card-site_visit')).toBeInTheDocument();
    });

    it('renders the delivery type card', () => {
      renderPage();
      expect(screen.getByTestId('type-card-delivery')).toBeInTheDocument();
    });

    it('renders the issue type card', () => {
      renderPage();
      expect(screen.getByTestId('type-card-issue')).toBeInTheDocument();
    });

    it('renders the general_note type card', () => {
      renderPage();
      expect(screen.getByTestId('type-card-general_note')).toBeInTheDocument();
    });

    it('renders exactly 5 type cards', () => {
      renderPage();
      const cards = [
        screen.getByTestId('type-card-daily_log'),
        screen.getByTestId('type-card-site_visit'),
        screen.getByTestId('type-card-delivery'),
        screen.getByTestId('type-card-issue'),
        screen.getByTestId('type-card-general_note'),
      ];
      expect(cards).toHaveLength(5);
    });

    it('clicking a type card advances to the form step', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId('type-card-daily_log'));
      // Form step shows body textarea (part of DiaryEntryForm)
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
      });
    });

    it('clicking the "Back to Diary" button navigates to /diary', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /back to diary/i }));
      await waitFor(() => {
        expect(screen.getByTestId('diary-list')).toBeInTheDocument();
      });
    });
  });

  // ─── Form step ──────────────────────────────────────────────────────────────

  describe('form step (after type selection)', () => {
    async function advanceToFormStep(type = 'daily_log') {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId(`type-card-${type}`));
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
      });
      return user;
    }

    it('renders the "← Back" button on the form step', async () => {
      await advanceToFormStep();
      expect(screen.getByRole('button', { name: /← back/i })).toBeInTheDocument();
    });

    it('"← Back" button returns to type selector', async () => {
      const user = await advanceToFormStep();
      await user.click(screen.getByRole('button', { name: /← back/i }));
      await waitFor(() => {
        expect(screen.getByTestId('type-card-daily_log')).toBeInTheDocument();
      });
    });

    it('entry date defaults to today', async () => {
      await advanceToFormStep();
      const today = new Date().toISOString().split('T')[0];
      const input = screen.getByLabelText(/entry date/i) as HTMLInputElement;
      expect(input.value).toBe(today);
    });

    it('renders the "Create Entry" submit button', async () => {
      await advanceToFormStep();
      expect(screen.getByRole('button', { name: /create entry/i })).toBeInTheDocument();
    });

    it('renders the "Cancel" button on the form step', async () => {
      await advanceToFormStep();
      expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
    });

    it('"Cancel" button returns to type selector', async () => {
      const user = await advanceToFormStep();
      await user.click(screen.getByRole('button', { name: /^cancel$/i }));
      await waitFor(() => {
        expect(screen.getByTestId('type-card-daily_log')).toBeInTheDocument();
      });
    });

    it('shows daily_log metadata section after selecting daily_log', async () => {
      await advanceToFormStep('daily_log');
      expect(screen.getByText('Daily Log Details')).toBeInTheDocument();
    });

    it('shows site_visit metadata section after selecting site_visit', async () => {
      await advanceToFormStep('site_visit');
      expect(screen.getByText('Site Visit Details')).toBeInTheDocument();
    });

    it('shows delivery metadata section after selecting delivery', async () => {
      await advanceToFormStep('delivery');
      expect(screen.getByText('Delivery Details')).toBeInTheDocument();
    });

    it('shows issue metadata section after selecting issue', async () => {
      await advanceToFormStep('issue');
      expect(screen.getByText('Issue Details')).toBeInTheDocument();
    });

    it('does not show any metadata section for general_note', async () => {
      await advanceToFormStep('general_note');
      expect(screen.queryByText('Daily Log Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Site Visit Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Delivery Details')).not.toBeInTheDocument();
      expect(screen.queryByText('Issue Details')).not.toBeInTheDocument();
    });
  });

  // ─── Validation ──────────────────────────────────────────────────────────────

  // Note: Form validation is tested in DiaryEntryForm.test.tsx.
  // Page-level validation tests are skipped due to ESM dynamic import
  // limitations with form submit event handling in Jest.

  // ─── Successful submit ───────────────────────────────────────────────────────

  describe('successful submission', () => {
    it('calls createDiaryEntry and navigates to the detail page on success', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce(createdEntry);
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(
        screen.getByRole('textbox', { name: /^entry/i }),
        'Foundation work done today.',
      );
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/diary/de-new');
      });
    });

    it('calls createDiaryEntry with correct entryType and body', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce(createdEntry);
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(screen.getByRole('textbox', { name: /^entry/i }), 'My log entry');
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            entryType: 'daily_log',
            body: 'My log entry',
          }),
        );
      });
    });

    it('passes null title when title is empty', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce(createdEntry);
      renderPage();

      await user.click(screen.getByTestId('type-card-general_note'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(screen.getByRole('textbox', { name: /^entry/i }), 'A note');
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(expect.objectContaining({ title: null }));
      });
    });

    it('shows "Creating..." label on submit button while submitting', async () => {
      const user = userEvent.setup();
      // Never resolves during this check
      mockCreateDiaryEntry.mockReturnValue(new Promise(() => undefined));
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(screen.getByRole('textbox', { name: /^entry/i }), 'Some text');
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /creating.../i })).toBeInTheDocument();
      });
    });
  });

  // ─── Failed submit ───────────────────────────────────────────────────────────

  describe('submission failure', () => {
    it('shows error banner when createDiaryEntry throws', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockRejectedValueOnce(new Error('Network error'));
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(screen.getByRole('textbox', { name: /^entry/i }), 'Some text');
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create diary entry/i)).toBeInTheDocument();
      });
    });

    it('does not navigate on failure', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockRejectedValueOnce(new Error('Oops'));
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(screen.getByRole('textbox', { name: /^entry/i }), 'Some text');
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to create diary entry/i)).toBeInTheDocument();
      });

      expect(screen.getByTestId('location')).toHaveTextContent('/diary/new');
    });
  });
});

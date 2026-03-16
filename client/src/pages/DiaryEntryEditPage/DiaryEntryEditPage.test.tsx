/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryDetail } from '@cornerstone/shared';
import type React from 'react';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockGetDiaryEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();
const mockUpdateDiaryEntry = jest.fn<typeof DiaryApiTypes.updateDiaryEntry>();
const mockDeleteDiaryEntry = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  getDiaryEntry: mockGetDiaryEntry,
  listDiaryEntries: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: mockUpdateDiaryEntry,
  deleteDiaryEntry: mockDeleteDiaryEntry,
}));

// Stable mock references — hoisted so useToast() returns the same function identity
// on every render, preventing infinite re-render loops in useEffect dependency arrays.
const mockShowToast = jest.fn();
const mockDismissToast = jest.fn();

// Mock ToastContext so useToast() works without a real ToastProvider.
// This avoids the dual-React instance issue caused by statically importing ToastProvider
// while the page component is dynamically imported (which loads its own React instance).
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: mockShowToast, dismissToast: mockDismissToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      displayName: 'Alice Builder',
      email: 'alice@example.com',
      role: 'admin',
      authProvider: 'local',
      createdAt: '2026-01-01T00:00:00Z',
    },
    oidcEnabled: false,
    isLoading: false,
    error: null,
    refreshAuth: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    }),
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// ── Location helper ───────────────────────────────────────────────────────────

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseDailyLogEntry: DiaryEntryDetail = {
  id: 'de-1',
  entryType: 'daily_log',
  entryDate: '2026-03-14',
  title: 'Foundation Work',
  body: 'Poured concrete for the main foundation.',
  metadata: { weather: 'sunny', workersOnSite: 5 },
  isAutomatic: false,
  isSigned: false,
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityTitle: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

const siteVisitEntry: DiaryEntryDetail = {
  ...baseDailyLogEntry,
  id: 'de-sv',
  entryType: 'site_visit',
  title: 'Building Inspection',
  body: 'Inspector visited the site.',
  metadata: { inspectorName: 'Bob Inspector', outcome: 'pass' },
};

const deliveryEntry: DiaryEntryDetail = {
  ...baseDailyLogEntry,
  id: 'de-del',
  entryType: 'delivery',
  title: 'Lumber Delivery',
  body: 'Lumber arrived on schedule.',
  metadata: {
    vendor: 'TimberCo',
    materials: ['Oak planks', 'Pine beams'],
    deliveryConfirmed: true,
  },
};

const issueEntry: DiaryEntryDetail = {
  ...baseDailyLogEntry,
  id: 'de-iss',
  entryType: 'issue',
  title: 'Crack in wall',
  body: 'Found a crack in the east wall.',
  metadata: { severity: 'high', resolutionStatus: 'open' },
};

const generalNoteEntry: DiaryEntryDetail = {
  ...baseDailyLogEntry,
  id: 'de-gn',
  entryType: 'general_note',
  title: 'General note',
  body: 'Just a note.',
  metadata: null,
};

describe('DiaryEntryEditPage', () => {
  let DiaryEntryEditPage: React.ComponentType;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryEntryEditPage) {
      const mod = await import('./DiaryEntryEditPage.js');
      DiaryEntryEditPage = mod.default;
    }
    mockGetDiaryEntry.mockReset();
    mockUpdateDiaryEntry.mockReset();
    mockDeleteDiaryEntry.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderEditPage = (id = 'de-1') =>
    render(
      <MemoryRouter initialEntries={[`/diary/${id}/edit`]}>
        <Routes>
          <Route path="/diary/:id/edit" element={<DiaryEntryEditPage />} />
          <Route path="/diary/:id" element={<div data-testid="detail-page">Detail Page</div>} />
          <Route path="/diary" element={<div data-testid="diary-list">Diary List</div>} />
        </Routes>
        <LocationDisplay />
      </MemoryRouter>,
    );

  // ─── Loading state ──────────────────────────────────────────────────────────

  it('shows loading state initially', () => {
    mockGetDiaryEntry.mockReturnValue(new Promise(() => undefined));
    renderEditPage();
    expect(screen.getByText(/loading entry/i)).toBeInTheDocument();
  });

  it('calls getDiaryEntry with the id from URL params', async () => {
    mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
    renderEditPage('de-1');
    await waitFor(() => {
      expect(mockGetDiaryEntry).toHaveBeenCalledWith('de-1');
    });
  });

  // ─── Pre-population ─────────────────────────────────────────────────────────

  describe('field pre-population', () => {
    it('pre-populates the entry date field', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        const input = screen.getByLabelText(/entry date/i) as HTMLInputElement;
        expect(input.value).toBe('2026-03-14');
      });
    });

    it('pre-populates the title field', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        const input = screen.getByLabelText(/^title$/i) as HTMLInputElement;
        expect(input.value).toBe('Foundation Work');
      });
    });

    it('pre-populates the body field', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        const textarea = screen.getByRole('textbox', { name: /^entry/i }) as HTMLTextAreaElement;
        expect(textarea.value).toBe('Poured concrete for the main foundation.');
      });
    });

    it('pre-populates daily_log weather from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        const select = screen.getByLabelText(/weather/i) as HTMLSelectElement;
        expect(select.value).toBe('sunny');
      });
    });

    it('pre-populates daily_log workers from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        const input = screen.getByLabelText(/workers on site/i) as HTMLInputElement;
        expect(input.value).toBe('5');
      });
    });

    it('pre-populates site_visit inspector name from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
      renderEditPage('de-sv');
      await waitFor(() => {
        const input = screen.getByLabelText(/inspector name/i) as HTMLInputElement;
        expect(input.value).toBe('Bob Inspector');
      });
    });

    it('pre-populates site_visit outcome from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(siteVisitEntry);
      renderEditPage('de-sv');
      await waitFor(() => {
        const select = screen.getByLabelText(/inspection outcome/i) as HTMLSelectElement;
        expect(select.value).toBe('pass');
      });
    });

    it('pre-populates delivery vendor from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(deliveryEntry);
      renderEditPage('de-del');
      await waitFor(() => {
        const input = screen.getByLabelText(/^vendor$/i) as HTMLInputElement;
        expect(input.value).toBe('TimberCo');
      });
    });

    it('pre-populates delivery materials chips from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(deliveryEntry);
      renderEditPage('de-del');
      await waitFor(() => {
        expect(screen.getByText('Oak planks')).toBeInTheDocument();
        expect(screen.getByText('Pine beams')).toBeInTheDocument();
      });
    });

    it('pre-populates delivery confirmed checkbox from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(deliveryEntry);
      renderEditPage('de-del');
      await waitFor(() => {
        const checkbox = screen.getByLabelText(/delivery confirmed/i) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
      });
    });

    it('pre-populates issue severity from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(issueEntry);
      renderEditPage('de-iss');
      await waitFor(() => {
        const select = screen.getByLabelText(/severity/i) as HTMLSelectElement;
        expect(select.value).toBe('high');
      });
    });

    it('pre-populates issue resolution status from metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(issueEntry);
      renderEditPage('de-iss');
      await waitFor(() => {
        const select = screen.getByLabelText(/resolution status/i) as HTMLSelectElement;
        expect(select.value).toBe('open');
      });
    });
  });

  // ─── Header & form controls ─────────────────────────────────────────────────

  describe('header and form controls', () => {
    it('renders the "Edit Diary Entry" h1', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /edit diary entry/i, level: 1 }),
        ).toBeInTheDocument();
      });
    });

    it('renders the "← Back to Entry" button', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to entry/i })).toBeInTheDocument();
      });
    });

    it('"← Back to Entry" button navigates to /diary/:id', async () => {
      const user = userEvent.setup();
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to entry/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /back to entry/i }));
      await waitFor(() => {
        expect(screen.getByTestId('detail-page')).toBeInTheDocument();
      });
    });

    it('renders "Save Changes" submit button', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      });
    });

    it('renders the "Delete Entry" button', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete entry/i })).toBeInTheDocument();
      });
    });

    it('shows the type badge', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage();
      await waitFor(() => {
        expect(screen.getByTestId('diary-type-badge-daily_log')).toBeInTheDocument();
      });
    });
  });

  // ─── Validation on save ─────────────────────────────────────────────────────

  // Note: Form validation is tested in DiaryEntryForm.test.tsx.
  // Page-level validation tests are skipped due to ESM dynamic import
  // limitations with form submit event handling in Jest.

  // ─── Successful save ─────────────────────────────────────────────────────────

  describe('successful save', () => {
    it('calls updateDiaryEntry with the entry id and updated data', async () => {
      const user = userEvent.setup();
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      mockUpdateDiaryEntry.mockResolvedValueOnce(undefined as any);
      renderEditPage('de-1');
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      await user.clear(textarea);
      await user.type(textarea, 'Updated notes');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateDiaryEntry).toHaveBeenCalledWith(
          'de-1',
          expect.objectContaining({ body: 'Updated notes' }),
        );
      });
    });

    it('navigates to detail page after successful save', async () => {
      const user = userEvent.setup();
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      mockUpdateDiaryEntry.mockResolvedValueOnce(undefined as any);
      renderEditPage('de-1');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByTestId('detail-page')).toBeInTheDocument();
      });
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/de-1');
    });

    it('shows "Saving..." label on submit button while saving', async () => {
      const user = userEvent.setup();
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      // Never resolves during this check
      mockUpdateDiaryEntry.mockReturnValue(new Promise(() => undefined));
      renderEditPage('de-1');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /saving.../i })).toBeInTheDocument();
      });
    });
  });

  // ─── Save failure ────────────────────────────────────────────────────────────

  describe('save failure', () => {
    it('shows error banner when updateDiaryEntry throws', async () => {
      const user = userEvent.setup();
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      mockUpdateDiaryEntry.mockRejectedValueOnce(new Error('Server error'));
      renderEditPage('de-1');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument(),
      );

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/failed to update diary entry/i)).toBeInTheDocument();
      });
    });
  });

  // ─── Delete modal ────────────────────────────────────────────────────────────

  describe('delete confirmation modal', () => {
    async function openDeleteModal(id = 'de-1', entry = baseDailyLogEntry) {
      const user = userEvent.setup();
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      renderEditPage(id);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete entry/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /delete entry/i }));
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      return user;
    }

    it('opens delete modal when "Delete Entry" button is clicked', async () => {
      await openDeleteModal();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('modal has the "Delete Diary Entry" heading', async () => {
      await openDeleteModal();
      expect(screen.getByRole('heading', { name: /delete diary entry/i })).toBeInTheDocument();
    });

    it('modal contains confirmation text', async () => {
      await openDeleteModal();
      expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
    });

    it('modal has a "Delete Entry" confirm button', async () => {
      await openDeleteModal();
      // The modal confirm button is inside the dialog element
      const dialog = screen.getByRole('dialog');
      const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /delete entry/i.test(b.textContent ?? ''),
      );
      expect(confirmButton).toBeTruthy();
    });

    it('modal has a "Cancel" button', async () => {
      await openDeleteModal();
      // Get the cancel button inside the modal dialog
      const dialog = screen.getByRole('dialog');
      const cancelButton = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /cancel/i.test(b.textContent ?? ''),
      );
      expect(cancelButton).toBeTruthy();
    });

    it('closes modal when Cancel button in modal is clicked', async () => {
      const user = await openDeleteModal();
      // Click Cancel inside the dialog
      const dialog = screen.getByRole('dialog');
      const cancelBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /cancel/i.test(b.textContent ?? ''),
      );
      expect(cancelBtn).toBeTruthy();
      await user.click(cancelBtn!);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('closes modal when Escape key is pressed', async () => {
      await openDeleteModal();
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('clicking the backdrop closes the modal', async () => {
      await openDeleteModal();
      const dialog = screen.getByRole('dialog');
      // The backdrop is a sibling div inside the dialog wrapper, identified by class
      const backdrop = dialog.querySelector('[class*=modalBackdrop]') as HTMLElement;
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('calls deleteDiaryEntry with entry id when confirm button clicked', async () => {
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined as any);
      const user = await openDeleteModal();

      const dialog = screen.getByRole('dialog');
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /delete entry/i.test(b.textContent ?? ''),
      );
      await user.click(confirmBtn!);

      await waitFor(() => {
        expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('de-1');
      });
    });

    it('navigates to /diary after successful delete', async () => {
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined as any);
      const user = await openDeleteModal();

      const dialog = screen.getByRole('dialog');
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /delete entry/i.test(b.textContent ?? ''),
      );
      await user.click(confirmBtn!);

      await waitFor(() => {
        expect(screen.getByTestId('diary-list')).toBeInTheDocument();
      });
      expect(screen.getByTestId('location')).toHaveTextContent('/diary');
    });

    it('shows error in modal when deleteDiaryEntry throws', async () => {
      mockDeleteDiaryEntry.mockRejectedValueOnce(new Error('Delete failed'));
      const user = await openDeleteModal();

      const dialog = screen.getByRole('dialog');
      const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /delete entry/i.test(b.textContent ?? ''),
      );
      await user.click(confirmBtn!);

      await waitFor(() => {
        expect(screen.getByText(/failed to delete diary entry/i)).toBeInTheDocument();
      });
    });
  });

  // ─── 404 Not Found state ─────────────────────────────────────────────────────

  describe('not found state', () => {
    it('shows "Entry Not Found" when API returns 404', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      mockGetDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Diary entry not found' }),
      );
      renderEditPage('nonexistent');
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /entry not found/i })).toBeInTheDocument();
      });
    });

    it('shows "Back to Diary" button in not found state', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      mockGetDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'Not found' }),
      );
      renderEditPage('nonexistent');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to diary/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Generic load error state ────────────────────────────────────────────────

  describe('load error state', () => {
    it('shows error card when non-404 error occurs', async () => {
      mockGetDiaryEntry.mockRejectedValueOnce(new Error('Network failure'));
      renderEditPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /error loading entry/i })).toBeInTheDocument();
      });
    });

    it('shows "Back to Diary" button in load error state', async () => {
      mockGetDiaryEntry.mockRejectedValueOnce(new Error('Network failure'));
      renderEditPage();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to diary/i })).toBeInTheDocument();
      });
    });
  });
});

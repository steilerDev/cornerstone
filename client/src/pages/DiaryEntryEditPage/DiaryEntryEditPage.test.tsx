/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type { DiaryEntryDetail, Photo } from '@cornerstone/shared';
import type React from 'react';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockGetDiaryEntry = jest.fn<typeof DiaryApiTypes.getDiaryEntry>();
const mockUpdateDiaryEntry = jest.fn<typeof DiaryApiTypes.updateDiaryEntry>();
const mockDeleteDiaryEntry = jest.fn<typeof DiaryApiTypes.deleteDiaryEntry>();
const mockPromoteDiaryEntry = jest.fn<typeof DiaryApiTypes.promoteDiaryEntry>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  getDiaryEntry: mockGetDiaryEntry,
  listDiaryEntries: jest.fn(),
  createDiaryEntry: jest.fn(),
  updateDiaryEntry: mockUpdateDiaryEntry,
  deleteDiaryEntry: mockDeleteDiaryEntry,
  promoteDiaryEntry: mockPromoteDiaryEntry,
}));

// ── usePhotos mock ────────────────────────────────────────────────────────────
// Expose a mutable container so the spy inside it can be replaced per-test.
// The factory closes over `photosState` (an object), so reassigning
// `photosState.refresh` in beforeEach updates what usePhotos() returns at
// render time without re-running the factory.
const photosState = { refresh: jest.fn() };

jest.unstable_mockModule('../../hooks/usePhotos.js', () => ({
  usePhotos: () => ({
    photos: [],
    loading: false,
    refresh: () => photosState.refresh(),
    upload: jest.fn(),
    deletePhoto: jest.fn(),
    reorderPhotos: jest.fn(),
    updateCaption: jest.fn(),
  }),
}));

// Mock PhotoUpload to capture its onUpload and onUploadingCountChange props so
// tests can invoke them directly. The real PhotoUpload uses XHR/FormData which
// are not available in jsdom.
let capturedOnUpload: ((photo: Photo) => void) | null = null;
let capturedOnUploadingCountChange: ((count: number) => void) | null = null;

jest.unstable_mockModule('../../components/photos/PhotoUpload.js', () => ({
  PhotoUpload: ({
    onUpload,
    onUploadingCountChange,
  }: {
    onUpload: (photo: Photo) => void;
    onUploadingCountChange?: (count: number) => void;
  }) => {
    capturedOnUpload = onUpload;
    capturedOnUploadingCountChange = onUploadingCountChange ?? null;
    return <div data-testid="photo-upload-mock" />;
  },
}));

// Mock PhotoGrid and PhotoViewer — not under test here, avoid real rendering.
jest.unstable_mockModule('../../components/photos/PhotoGrid.js', () => ({
  PhotoGrid: () => <div data-testid="photo-grid-mock" />,
}));

jest.unstable_mockModule('../../components/photos/PhotoViewer.js', () => ({
  PhotoViewer: () => <div data-testid="photo-viewer-mock" />,
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

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.unstable_mockModule('../../lib/vendorsApi.js', () => ({
  fetchVendors: jest
    .fn<
      (params?: unknown) => Promise<{
        vendors: unknown[];
        pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
      }>
    >()
    .mockResolvedValue({
      vendors: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    }),
  fetchVendor: jest.fn(),
  createVendor: jest.fn(),
  updateVendor: jest.fn(),
  deleteVendor: jest.fn(),
}));

// Mock authApi so the real AuthProvider (used as fallback when the module mock does not
// intercept in this environment) resolves immediately without making network requests.
jest.unstable_mockModule('../../lib/authApi.js', () => ({
  getAuthMe: jest
    .fn<
      () => Promise<{
        user: {
          id: string;
          displayName: string;
          email: string;
          role: string;
          authProvider: string;
          createdAt: string;
        };
        oidcEnabled: boolean;
      }>
    >()
    .mockResolvedValue({
      user: {
        id: 'user-1',
        displayName: 'Alice Builder',
        email: 'alice@example.com',
        role: 'admin',
        authProvider: 'local',
        createdAt: '2026-01-01T00:00:00Z',
      },
      oidcEnabled: false,
    }),
  logout: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
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
  status: 'saved',
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityArea: null,
  sourceEntityTitle: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice Builder' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

const draftGeneralNoteEntry: DiaryEntryDetail = {
  ...baseDailyLogEntry,
  id: 'draft-1',
  entryType: 'general_note',
  status: 'draft',
  title: 'Draft note',
  body: 'Draft content',
  metadata: null,
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
  // Providers are imported dynamically so they share the same module instance as the page
  // component (whether mocked or real), avoiding a dual-React-context mismatch.
  // When jest.unstable_mockModule intercepts (CI), ToastProvider and AuthProvider are
  // passthrough wrappers. Locally, the real providers are used with authApi mocked so
  // AuthProvider resolves immediately without network requests.
  let ToastProvider: React.ComponentType<{ children: React.ReactNode }>;
  let AuthProvider: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryEntryEditPage) {
      const mod = await import('./DiaryEntryEditPage.js');
      DiaryEntryEditPage = mod.default;
      const toastMod = await import('../../components/Toast/ToastContext.js');
      ToastProvider = toastMod.ToastProvider;
      const authMod = await import('../../contexts/AuthContext.js');
      AuthProvider = authMod.AuthProvider;
    }
    mockGetDiaryEntry.mockReset();
    mockUpdateDiaryEntry.mockReset();
    mockDeleteDiaryEntry.mockReset();
    mockPromoteDiaryEntry.mockReset();
    photosState.refresh = jest.fn();
    capturedOnUpload = null;
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderEditPage = (id = 'de-1') =>
    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/diary/${id}/edit`]}>
            <Routes>
              <Route path="/diary/:id/edit" element={<DiaryEntryEditPage />} />
              <Route path="/diary/:id" element={<div data-testid="detail-page">Detail Page</div>} />
              <Route path="/diary" element={<div data-testid="diary-list">Diary List</div>} />
            </Routes>
            <LocationDisplay />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
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
        const input = screen.getByLabelText(/number of workers/i) as HTMLInputElement;
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
      mockUpdateDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
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
      mockUpdateDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
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
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined);
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
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined);
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

  // ─── Draft lifecycle (Story #1426) ───────────────────────────────────────────

  describe('Draft lifecycle (Story #1426)', () => {
    it('Scenario 43: draft entry shows Draft badge', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByTestId('draft-status-badge')).toBeInTheDocument();
      });
    });

    it('Scenario 43: draft entry shows "Save" (promote) button', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      renderEditPage('draft-1');

      await waitFor(() => {
        // The promote button label comes from t('editPage.promoteButton') = "Save"
        const saveBtn = screen
          .getAllByRole('button')
          .find((btn) => /^save$/i.test(btn.textContent ?? ''));
        expect(saveBtn).toBeDefined();
      });
    });

    it('Scenario 43: draft entry shows "Discard Draft" button', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /discard draft/i })).toBeInTheDocument();
      });
    });

    it('Scenario 44: blurring body textarea on draft → triggers updateDiaryEntry (auto-save) after debounce', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockUpdateDiaryEntry.mockResolvedValue({ ...draftGeneralNoteEntry, body: 'updated' });
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
      });

      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      fireEvent.change(textarea, { target: { value: 'updated body' } });
      fireEvent.blur(textarea);

      // Advance past 1000ms debounce
      await jest.advanceTimersByTimeAsync(1100);

      await waitFor(() => {
        expect(mockUpdateDiaryEntry).toHaveBeenCalledWith(
          'draft-1',
          expect.objectContaining({ body: 'updated body' }),
        );
      });

      jest.useRealTimers();
    });

    it('Scenario 44b: uploadingCount change while an autosave is pending cancels the debounced save (scheduleAutoSave.cancel via the uploadingCount-keyed cleanup effect)', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockUpdateDiaryEntry.mockResolvedValue({ ...draftGeneralNoteEntry, body: 'updated' });
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
      });

      // PhotoUpload only renders once `entry` has loaded — by this point it has.
      expect(capturedOnUploadingCountChange).not.toBeNull();

      // NOTE: mounting a draft entry fires one immediate autosave call on its own
      // (pre-existing `skipAutoSaveOnMountRef` behavior in the metadata-change
      // effect, unrelated to this PR's debounce-hook migration — see CODE_BUG
      // note in the PR description). Flush and discard that call so this test
      // isolates the debounce-cancel behavior under test.
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();

      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      fireEvent.change(textarea, { target: { value: 'updated body' } });
      fireEvent.blur(textarea);

      // A debounced autosave (1000ms) is now pending. Advance partway — not
      // enough to fire — then simulate a photo upload starting. The
      // `uploadingCount`-keyed effect's cleanup calls `scheduleAutoSave.cancel()`
      // every time `uploadingCount` changes (not just on unmount), which must
      // cancel the pending debounced save.
      await jest.advanceTimersByTimeAsync(500);
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();

      act(() => {
        capturedOnUploadingCountChange!(1);
      });

      // Advance well past the original 1000ms debounce window — if the pending
      // save were NOT cancelled, updateDiaryEntry would have fired by now.
      await jest.advanceTimersByTimeAsync(1100);

      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    // Regression #1816/#1848: useDebouncedCallback used to return a brand-new
    // `{trigger, cancel}` object on every render. The uploadingCount-keyed cleanup
    // effect (lines ~222-240) depends on that whole object, so its cleanup —
    // `scheduleAutoSave.cancel()` — used to re-run on *every* render, not just when
    // `uploadingCount` actually changed. That silently cancelled any pending
    // debounced autosave the instant an unrelated field caused a re-render. The fix
    // wraps the hook's return value in `useMemo` so the object is referentially
    // stable across renders that don't change `trigger`/`cancel` identity.
    it('Regression #1816/#1848: a pending debounced autosave survives an unrelated re-render and fires after its full delay', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockUpdateDiaryEntry.mockResolvedValue({ ...draftGeneralNoteEntry, body: 'updated' });
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument();
      });

      // Flush and discard the pre-existing spurious mount-time autosave (documented
      // CODE_BUG, unrelated to this regression) so it doesn't muddy the assertion.
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();

      // Blur the body textarea to schedule a debounced autosave (1000ms).
      const textarea = screen.getByRole('textbox', { name: /^entry/i });
      fireEvent.change(textarea, { target: { value: 'updated body' } });
      fireEvent.blur(textarea);

      // Advance partway — not enough to fire yet.
      await jest.advanceTimersByTimeAsync(400);
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();

      // Trigger a re-render that has nothing to do with autosave scheduling: change
      // (not blur) the title field. This calls setTitle, forcing a re-render, but
      // never touches `uploadingCount` or the autosave trigger/cancel path.
      const titleInput = screen.getByLabelText(/^title$/i);
      fireEvent.change(titleInput, { target: { value: 'An unrelated title edit' } });

      // Advance the remaining time past the original 1000ms debounce window. If the
      // unrelated re-render had cancelled the pending save (the pre-fix bug),
      // updateDiaryEntry would never fire.
      await jest.advanceTimersByTimeAsync(700);

      await waitFor(() => {
        expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1);
      });
      expect(mockUpdateDiaryEntry).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({ body: 'updated body' }),
      );

      jest.useRealTimers();
    });

    it('Scenario 46: weather select change on draft → triggers immediate auto-save', async () => {
      jest.useFakeTimers();
      const draftDailyLogEntry: DiaryEntryDetail = {
        ...baseDailyLogEntry,
        id: 'draft-dl',
        status: 'draft',
        metadata: null,
      };
      mockGetDiaryEntry.mockResolvedValueOnce(draftDailyLogEntry);
      mockUpdateDiaryEntry.mockResolvedValue({ ...draftDailyLogEntry });
      renderEditPage('draft-dl');

      await waitFor(() => {
        expect(screen.getByLabelText(/weather/i)).toBeInTheDocument();
      });

      const weatherSelect = screen.getByLabelText(/weather/i);
      fireEvent.change(weatherSelect, { target: { value: 'sunny' } });

      // Immediate save (triggerAutoSave(true)) — no debounce wait needed
      await jest.advanceTimersByTimeAsync(50);

      await waitFor(() => {
        expect(mockUpdateDiaryEntry).toHaveBeenCalledWith('draft-dl', expect.any(Object));
      });

      jest.useRealTimers();
    });

    it('Scenario 47: Save button on draft → calls promoteDiaryEntry, navigates to /diary/:id', async () => {
      const savedEntry: DiaryEntryDetail = { ...draftGeneralNoteEntry, status: 'saved' };
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockPromoteDiaryEntry.mockResolvedValueOnce(savedEntry);
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
      });

      // Click the Save (promote) button
      const saveBtn = screen
        .getAllByRole('button')
        .find((btn) => /^save$/i.test(btn.textContent ?? ''))!;

      await userEvent.setup().click(saveBtn);

      await waitFor(() => {
        expect(mockPromoteDiaryEntry).toHaveBeenCalledWith('draft-1', expect.any(Object));
      });

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1');
      });
    });

    it('Scenario 48: Save with validation error (missing body) → shows error, stays on edit page', async () => {
      const draftNoBody: DiaryEntryDetail = {
        ...draftGeneralNoteEntry,
        body: '',
      };
      mockGetDiaryEntry.mockResolvedValueOnce(draftNoBody);
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
      });

      const saveBtn = screen
        .getAllByRole('button')
        .find((btn) => /^save$/i.test(btn.textContent ?? ''))!;

      await userEvent.setup().click(saveBtn);

      // Validation fires client-side, promoteDiaryEntry should NOT be called
      expect(mockPromoteDiaryEntry).not.toHaveBeenCalled();
      // Still on edit page
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-1/edit');
    });

    it('Scenario 49: Discard Draft → shows modal → confirm → deleteDiaryEntry → navigate to /diary', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined);
      renderEditPage('draft-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /discard draft/i })).toBeInTheDocument();
      });

      await userEvent.setup().click(screen.getByRole('button', { name: /discard draft/i }));

      // Modal should appear — use the dialog role to scope to the modal
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Confirm button inside the modal is also labelled "Discard Draft" — use within(dialog) to
      // avoid matching the trigger button that remains rendered outside the modal.
      const discardDialog = screen.getByRole('dialog');
      await userEvent
        .setup()
        .click(within(discardDialog).getByRole('button', { name: /^discard draft$/i }));

      await waitFor(() => {
        expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('draft-1');
      });

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/diary');
      });
    });

    it('Scenario 50: saved entry shows "Save Changes" button, no "Discard Draft" button', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /discard draft/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('draft-status-badge')).not.toBeInTheDocument();
    });
  });

  // ─── Photo upload refresh (Story #1435) ──────────────────────────────────────

  describe('photo upload refresh (Story #1435)', () => {
    it('Scenario 7: onUpload callback calls photosResult.refresh()', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(generalNoteEntry);
      renderEditPage('de-gn');

      // Wait for the page to load so PhotoUpload is rendered and onUpload is captured
      await waitFor(() => {
        expect(screen.getByTestId('photo-upload-mock')).toBeInTheDocument();
      });

      // capturedOnUpload is set when PhotoUpload mock renders with the onUpload prop
      expect(capturedOnUpload).not.toBeNull();

      // Invoke the onUpload callback (simulates a successful photo upload)
      capturedOnUpload!({
        id: 'photo-1',
        entityType: 'diary_entry',
        entityId: 'de-1',
        originalFilename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 12345,
        width: 1920,
        height: 1080,
        takenAt: null,
        caption: null,
        areaId: null,
        orientationId: null,
        orientation: null,
        sortOrder: 0,
        createdBy: { id: 'user-1', displayName: 'Alice Builder' },
        createdAt: '2026-03-14T09:00:00.000Z',
        updatedAt: '2026-03-14T09:00:00.000Z',
        annotatedAt: null,
        fileUrl: 'https://example.com/photo.jpg',
        thumbnailUrl: 'https://example.com/photo-thumb.jpg',
      });

      expect(photosState.refresh).toHaveBeenCalledTimes(1);
    });
  });
});

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
const photosState = {
  refresh: jest.fn(),
  photos: [] as Photo[],
  deletePhoto: jest.fn(),
  updatePhotoInList: jest.fn(),
};

jest.unstable_mockModule('../../hooks/usePhotos.js', () => ({
  usePhotos: () => ({
    photos: photosState.photos,
    loading: false,
    refresh: () => photosState.refresh(),
    upload: jest.fn(),
    deletePhoto: (...args: unknown[]) => photosState.deletePhoto(...args),
    updatePhotoInList: (...args: unknown[]) => photosState.updatePhotoInList(...args),
    reorderPhotos: jest.fn(),
    updateCaption: jest.fn(),
  }),
}));

// Mock PhotoUpload to capture its onUpload and onUploadingCountChange props so
// tests can invoke them directly. The real PhotoUpload uses XHR/FormData which
// are not available in jsdom.
let capturedOnUpload: ((photo: Photo) => void) | null = null;
let capturedOnUploadingCountChange: ((count: number) => void) | null = null;
let capturedOnUploadError: ((message: string) => void) | null = null;

jest.unstable_mockModule('../../components/photos/PhotoUpload.js', () => ({
  PhotoUpload: ({
    onUpload,
    onUploadingCountChange,
    onError,
  }: {
    onUpload: (photo: Photo) => void;
    onUploadingCountChange?: (count: number) => void;
    onError?: (message: string) => void;
  }) => {
    capturedOnUpload = onUpload;
    capturedOnUploadError = onError ?? null;
    capturedOnUploadingCountChange = onUploadingCountChange ?? null;
    return <div data-testid="photo-upload-mock" />;
  },
}));

// Mock PhotoGrid and PhotoViewer — not under test here, avoid real rendering.
// They expose the `editable` prop as a data attribute so lock behaviour (#2124) is observable.
jest.unstable_mockModule('../../components/photos/PhotoGrid.js', () => ({
  PhotoGrid: ({
    editable,
    photos,
    onPhotoClick,
    onEdit,
    onDelete,
  }: {
    editable?: boolean;
    photos: Photo[];
    onPhotoClick: (photo: Photo) => void;
    onEdit: (photo: Photo) => void;
    onDelete: (photo: Photo) => void;
  }) => (
    <div data-testid="photo-grid-mock" data-editable={String(editable)}>
      <button type="button" onClick={() => onPhotoClick(photos[0]!)}>
        open-photo
      </button>
      <button type="button" onClick={() => onEdit(photos[0]!)}>
        edit-photo
      </button>
      <button type="button" onClick={() => onDelete(photos[0]!)}>
        delete-photo
      </button>
    </div>
  ),
}));

jest.unstable_mockModule('../../components/photos/PhotoViewer.js', () => ({
  PhotoViewer: ({
    editable,
    startInAnnotator,
    onClose,
    onDelete,
    onPhotoChanged,
  }: {
    editable?: boolean;
    startInAnnotator?: boolean;
    onClose: () => void;
    onDelete: (id: string) => void;
    onPhotoChanged: (photo: Photo) => void;
  }) => (
    <div
      data-testid="photo-viewer-mock"
      data-editable={String(editable)}
      data-annotator={String(startInAnnotator)}
    >
      <button type="button" onClick={onClose}>
        close-viewer
      </button>
      <button type="button" onClick={() => onDelete('p1')}>
        delete-in-viewer
      </button>
      <button type="button" onClick={() => onPhotoChanged({ id: 'p1' } as Photo)}>
        change-in-viewer
      </button>
    </div>
  ),
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

const defaultMockUser = {
  id: 'user-1',
  displayName: 'Alice Builder',
  email: 'alice@example.com',
  role: 'admin',
  authProvider: 'local',
  createdAt: '2026-01-01T00:00:00Z',
};
// Mutable so individual tests can vary displayName/email (reset in beforeEach).
let mockUser: typeof defaultMockUser = { ...defaultMockUser };

jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({
    user: mockUser,
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
    vatRate: 0.19,
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
    mockUser = { ...defaultMockUser };
    photosState.refresh = jest.fn();
    photosState.photos = [];
    photosState.deletePhoto = jest.fn();
    photosState.updatePhotoInList = jest.fn();
    capturedOnUploadError = null;
    mockShowToast.mockClear();
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
        expect(screen.getByRole('dialog', { name: 'Delete Diary Entry' })).toBeInTheDocument();
      });
      return user;
    }

    it('opens delete modal when "Delete Entry" button is clicked', async () => {
      await openDeleteModal();
      expect(screen.getByRole('dialog', { name: 'Delete Diary Entry' })).toBeInTheDocument();
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
      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
      const confirmButton = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /delete entry/i.test(b.textContent ?? ''),
      );
      expect(confirmButton).toBeTruthy();
    });

    it('modal has a "Cancel" button', async () => {
      await openDeleteModal();
      // Get the cancel button inside the modal dialog
      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
      const cancelButton = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /cancel/i.test(b.textContent ?? ''),
      );
      expect(cancelButton).toBeTruthy();
    });

    it('closes modal when Cancel button in modal is clicked', async () => {
      const user = await openDeleteModal();
      // Click Cancel inside the dialog
      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
      const cancelBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
        /cancel/i.test(b.textContent ?? ''),
      );
      expect(cancelBtn).toBeTruthy();
      await user.click(cancelBtn!);
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: 'Delete Diary Entry' }),
        ).not.toBeInTheDocument();
      });
    });

    it('closes modal when Escape key is pressed', async () => {
      await openDeleteModal();
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: 'Delete Diary Entry' }),
        ).not.toBeInTheDocument();
      });
    });

    it('clicking the backdrop closes the modal', async () => {
      await openDeleteModal();
      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
      // Shared Modal: the backdrop is the first (role-less) child of the portalled dialog wrapper
      const backdrop = dialog.firstElementChild as HTMLElement;
      expect(backdrop).toBeTruthy();
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(
          screen.queryByRole('dialog', { name: 'Delete Diary Entry' }),
        ).not.toBeInTheDocument();
      });
    });

    it('calls deleteDiaryEntry with entry id when confirm button clicked', async () => {
      mockDeleteDiaryEntry.mockResolvedValueOnce(undefined);
      const user = await openDeleteModal();

      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
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

      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
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

      const dialog = screen.getByRole('dialog', { name: 'Delete Diary Entry' });
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
        expect(screen.getByRole('dialog', { name: 'Discard Draft' })).toBeInTheDocument();
      });

      // Confirm button inside the modal is also labelled "Discard Draft" — use within(dialog) to
      // avoid matching the trigger button that remains rendered outside the modal.
      const discardDialog = screen.getByRole('dialog', { name: 'Discard Draft' });
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

  // ─── Unfinished signatures & API error translation (#2088) ──────────────────

  describe('unfinished signatures and API errors (#2088)', () => {
    const INCOMPLETE_MSG = 'Accept or remove the unfinished signature before saving.';
    const INVALID_METADATA_MSG =
      'Some entry details are invalid or incomplete (for example, an unfinished signature). Please review the entry and try again.';
    const VALIDATION_ERROR_MSG = 'The submitted data is invalid. Please check your input.';

    const draftDailyLog: DiaryEntryDetail = {
      ...baseDailyLogEntry,
      id: 'draft-dl',
      status: 'draft',
      metadata: null,
    };
    const draftSiteVisit: DiaryEntryDetail = {
      ...siteVisitEntry,
      id: 'draft-sv',
      status: 'draft',
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

    beforeEach(() => {
      const ctx = new Proxy(
        {},
        {
          get: (target, prop) =>
            prop in target ? (target as Record<string | symbol, unknown>)[prop] : jest.fn(),
          set: (target, prop, value) => {
            (target as Record<string | symbol, unknown>)[prop] = value;
            return true;
          },
        },
      );
      HTMLCanvasElement.prototype.getContext = jest.fn(
        () => ctx,
      ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toDataURL = jest.fn(
        () => 'data:image/png;base64,MOCKDATA',
      ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 300,
        height: 150,
        top: 0,
        left: 0,
        right: 300,
        bottom: 150,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      })) as unknown as typeof Element.prototype.getBoundingClientRect;
    });

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      jest.useRealTimers();
    });

    const loadDraft = async (entry: DiaryEntryDetail) => {
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      mockUpdateDiaryEntry.mockResolvedValue(entry);
      renderEditPage(entry.id);
      await screen.findByRole('button', { name: /add signature/i });
    };

    const addPendingSignature = async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /add signature/i }));
      await screen.findByLabelText('Signature canvas');
    };

    const clickPromote = async () => {
      const saveBtn = screen
        .getAllByRole('button')
        .find((btn) => /^save$/i.test(btn.textContent ?? ''))!;
      await userEvent.setup().click(saveBtn);
    };

    const lastUpdateMetadata = () => {
      const call = mockUpdateDiaryEntry.mock.calls[mockUpdateDiaryEntry.mock.calls.length - 1];
      expect(call).toBeDefined();
      return (call![1] as { metadata?: Record<string, unknown> | null }).metadata;
    };

    it('falls back to the email as signer name when displayName is blank', async () => {
      mockUser = { ...defaultMockUser, displayName: '   ' };
      await loadDraft(draftDailyLog);
      await addPendingSignature();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    it('uses the display name as signer name when present', async () => {
      await loadDraft(draftDailyLog);
      await addPendingSignature();
      // displayName also appears in the draft header/meta; assert within the signature group
      expect(screen.getAllByText('Alice Builder').length).toBeGreaterThan(0);
      expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument();
    });

    it('blocks promote with an inline alert while a signature is unfinished', async () => {
      await loadDraft(draftDailyLog);
      await addPendingSignature();
      mockPromoteDiaryEntry.mockClear();
      await clickPromote();

      expect(mockPromoteDiaryEntry).not.toHaveBeenCalled();
      const msg = await screen.findByText(INCOMPLETE_MSG);
      expect(msg).toHaveAttribute('role', 'alert');
      expect(msg).toHaveAttribute('id', 'daily-log-signatures-error');
    });

    it('#2088 repro: still blocks promote after switching the pending signature to Vendor', async () => {
      await loadDraft(draftDailyLog);
      await addPendingSignature();
      await userEvent.setup().click(screen.getByRole('radio', { name: 'Vendor' }));
      mockPromoteDiaryEntry.mockClear();
      await clickPromote();

      expect(mockPromoteDiaryEntry).not.toHaveBeenCalled();
      expect(await screen.findByText(INCOMPLETE_MSG)).toHaveAttribute('role', 'alert');
    });

    it('promotes without signatures after the unfinished signature is removed', async () => {
      await loadDraft(draftDailyLog);
      await addPendingSignature();
      await clickPromote();
      await screen.findByText(INCOMPLETE_MSG);

      await userEvent.setup().click(screen.getByRole('button', { name: 'Remove Signature' }));
      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftDailyLog, status: 'saved' });
      await clickPromote();

      await waitFor(() => expect(mockPromoteDiaryEntry).toHaveBeenCalledTimes(1));
      const payload = mockPromoteDiaryEntry.mock.calls[0];
      expect(payload).toBeDefined();
      const metadata = (payload![1] as { metadata?: Record<string, unknown> | null }).metadata;
      expect(metadata ?? {}).not.toHaveProperty('signatures');
    });

    it('promotes with the complete signature after it is accepted', async () => {
      await loadDraft(draftDailyLog);
      await addPendingSignature();
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
      fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      await waitFor(() =>
        expect(screen.queryByLabelText('Signature canvas')).not.toBeInTheDocument(),
      );

      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftDailyLog, status: 'saved' });
      await clickPromote();

      await waitFor(() => expect(mockPromoteDiaryEntry).toHaveBeenCalledTimes(1));
      const payload = mockPromoteDiaryEntry.mock.calls[0];
      expect(payload).toBeDefined();
      const metadata = (payload![1] as { metadata?: { signatures?: unknown[] } }).metadata;
      expect(metadata?.signatures).toEqual([
        expect.objectContaining({
          signerName: 'Alice Builder',
          signerType: 'self',
          signatureDataUrl: 'data:image/png;base64,MOCKDATA',
        }),
      ]);
    });

    it('autosave strips an unfinished signature placeholder from metadata', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(draftDailyLog);
      mockUpdateDiaryEntry.mockResolvedValue(draftDailyLog);
      renderEditPage('draft-dl');
      const addBtn = await screen.findByRole('button', { name: /add signature/i });
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();

      fireEvent.click(addBtn);
      await jest.advanceTimersByTimeAsync(1100);

      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      expect(lastUpdateMetadata() ?? {}).not.toHaveProperty('signatures');
      expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
    });

    it('blocks promote for a site_visit with an unfinished signature', async () => {
      await loadDraft(draftSiteVisit);
      await addPendingSignature();
      mockPromoteDiaryEntry.mockClear();
      await clickPromote();

      expect(mockPromoteDiaryEntry).not.toHaveBeenCalled();
      const msg = await screen.findByText(INCOMPLETE_MSG);
      expect(msg).toHaveAttribute('id', 'site-visit-signatures-error');
      expect(msg).toHaveAttribute('role', 'alert');
    });

    it('promotes a site_visit with only complete signatures', async () => {
      await loadDraft(draftSiteVisit);
      await addPendingSignature();
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
      fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      await waitFor(() =>
        expect(screen.queryByLabelText('Signature canvas')).not.toBeInTheDocument(),
      );

      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftSiteVisit, status: 'saved' });
      await clickPromote();

      await waitFor(() => expect(mockPromoteDiaryEntry).toHaveBeenCalledTimes(1));
      const payload = mockPromoteDiaryEntry.mock.calls[0];
      expect(payload).toBeDefined();
      const metadata = (payload![1] as { metadata?: { signatures?: unknown[] } }).metadata;
      expect(metadata?.signatures).toHaveLength(1);
    });

    it('site_visit autosave strips an unfinished signature placeholder', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(draftSiteVisit);
      mockUpdateDiaryEntry.mockResolvedValue(draftSiteVisit);
      renderEditPage('draft-sv');
      const addBtn = await screen.findByRole('button', { name: /add signature/i });
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();

      fireEvent.click(addBtn);
      await jest.advanceTimersByTimeAsync(1100);

      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      expect(lastUpdateMetadata()).toEqual(
        expect.objectContaining({ inspectorName: 'Bob Inspector', outcome: 'pass' }),
      );
      expect(lastUpdateMetadata() ?? {}).not.toHaveProperty('signatures');
      expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
    });

    it('promote INVALID_METADATA shows the translated message, not the raw server text', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      await loadDraft(draftDailyLog);
      mockPromoteDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'INVALID_METADATA',
          message: 'daily_log signature entry must have non-empty signerName',
        }),
      );
      await clickPromote();

      const banner = await screen.findByText(INVALID_METADATA_MSG);
      expect(banner).toHaveAttribute('role', 'alert');
      expect(screen.queryByText(/non-empty signerName/)).not.toBeInTheDocument();
      expect(screen.queryByText(/failed to update diary entry/i)).not.toBeInTheDocument();
    });

    it('promote VALIDATION_ERROR without fieldErrors shows the translated banner', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      await loadDraft(draftDailyLog);
      mockPromoteDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'bad' }),
      );
      await clickPromote();

      const banner = await screen.findByText(VALIDATION_ERROR_MSG);
      expect(banner).toHaveAttribute('role', 'alert');
    });

    it('promote VALIDATION_ERROR with fieldErrors shows the translated banner and never the raw field text', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      await loadDraft(draftDailyLog);
      mockPromoteDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(400, {
          code: 'VALIDATION_ERROR',
          message: 'bad',
          details: { fieldErrors: { body: 'Server says body is bad' } },
        }),
      );
      await clickPromote();

      const banner = await screen.findByText(VALIDATION_ERROR_MSG);
      expect(banner).toHaveAttribute('role', 'alert');
      expect(screen.queryByText(/Server says body is bad/)).not.toBeInTheDocument();
      expect(document.body.textContent).not.toContain('Server says body is bad');
    });

    it('promote with a non-API error shows the generic update error', async () => {
      await loadDraft(draftDailyLog);
      mockPromoteDiaryEntry.mockRejectedValueOnce(new Error('network down'));
      await clickPromote();

      const banner = await screen.findByText(/failed to update diary entry/i);
      expect(banner).toHaveAttribute('role', 'alert');
    });

    it('saved-entry update INVALID_METADATA shows the translated banner', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      mockUpdateDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(400, { code: 'INVALID_METADATA', message: 'raw server detail' }),
      );
      renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));

      const banner = await screen.findByText(INVALID_METADATA_MSG);
      expect(banner).toHaveAttribute('role', 'alert');
      expect(screen.queryByText(/raw server detail/)).not.toBeInTheDocument();
    });

    it('blocks saving a saved daily_log entry whose state holds an unfinished signature', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /add signature/i }));
      await userEvent.setup().click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText(INCOMPLETE_MSG)).toBeInTheDocument();
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
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

  // ─── Signature lock (#2124) ─────────────────────────────────────────────────

  describe('signature lock on the edit page (#2124)', () => {
    const sig = {
      signerName: 'Alice Builder',
      signerType: 'self' as const,
      signatureDataUrl: 'data:image/png;base64,SIGDATA',
      signedAt: '2026-03-14T10:00:00.000Z',
    };
    const signedDraft: DiaryEntryDetail = {
      ...baseDailyLogEntry,
      id: 'signed-draft',
      status: 'draft',
      isSigned: true,
      metadata: { weather: 'sunny', signatures: [sig] },
    };
    const signedSaved: DiaryEntryDetail = {
      ...baseDailyLogEntry,
      id: 'signed-saved',
      status: 'saved',
      isSigned: true,
      metadata: { weather: 'sunny', signatures: [sig] },
    };

    afterEach(() => {
      jest.useRealTimers();
    });

    it('a signed draft loads into the form: no redirect, no toast (mutation: redirect on raw isSigned)', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(signedDraft);
      renderEditPage('signed-draft');

      await screen.findByLabelText(/^title$/i);
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/signed-draft/edit');
      expect(screen.queryByTestId('detail-page')).not.toBeInTheDocument();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('a signed saved entry redirects to the detail page with the info toast', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(signedSaved);
      renderEditPage('signed-saved');

      await screen.findByTestId('detail-page');
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/signed-saved');
      expect(mockShowToast).toHaveBeenCalledWith('info', 'Signed entries cannot be edited');
    });

    it('an unsigned saved entry is not redirected', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      await screen.findByLabelText(/^title$/i);
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('autosave on a signed draft sends the existing signatures intact', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(signedDraft);
      mockUpdateDiaryEntry.mockResolvedValue(signedDraft);
      renderEditPage('signed-draft');
      const weather = await screen.findByLabelText(/weather/i);
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();

      fireEvent.change(weather, { target: { value: 'cloudy' } });
      await jest.advanceTimersByTimeAsync(1100);

      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      const call = mockUpdateDiaryEntry.mock.calls[mockUpdateDiaryEntry.mock.calls.length - 1]!;
      const payload = call[1] as {
        metadata?: { weather?: string; signatures?: unknown[] };
      };
      expect(payload.metadata?.weather).toBe('cloudy');
      expect(payload.metadata?.signatures).toEqual([sig]);
    });

    it('photos are editable on a signed draft', async () => {
      photosState.photos = [{ id: 'p1' } as Photo];
      mockGetDiaryEntry.mockResolvedValueOnce(signedDraft);
      renderEditPage('signed-draft');

      expect(await screen.findByTestId('photo-grid-mock')).toHaveAttribute('data-editable', 'true');
      await userEvent.setup().click(screen.getByText('open-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-editable',
        'true',
      );
    });

    it('photos are editable on an unsigned saved entry', async () => {
      photosState.photos = [{ id: 'p1' } as Photo];
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      expect(await screen.findByTestId('photo-grid-mock')).toHaveAttribute('data-editable', 'true');
    });
  });

  describe('load error fallback text', () => {
    it('shows the translated loadError when there is no entry and no error message', async () => {
      // The locked-entry redirect leaves entry null and error empty. Registering the page on
      // the detail path too keeps it mounted after navigate(), exposing the fallback branch.
      mockGetDiaryEntry.mockResolvedValueOnce({
        ...baseDailyLogEntry,
        isSigned: true,
        status: 'saved',
      });
      render(
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/diary/de-1/edit']}>
              <Routes>
                <Route path="/diary/:id/edit" element={<DiaryEntryEditPage />} />
                <Route path="/diary/:id" element={<DiaryEntryEditPage />} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </ToastProvider>,
      );

      expect(
        await screen.findByText('Failed to load diary entry. Please try again.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('An unexpected error occurred.')).not.toBeInTheDocument();
    });
  });

  // ─── Issue signatures (#2125) ───────────────────────────────────────────────

  describe('issue signatures (#2125)', () => {
    const ISSUE_INCOMPLETE = 'Accept or remove the unfinished signature before saving.';
    const sig = {
      signerName: 'Alice Builder',
      signerType: 'self' as const,
      signatureDataUrl: 'data:image/png;base64,ISSUESIG',
      signedAt: '2026-03-14T10:00:00.000Z',
    };
    const draftIssue: DiaryEntryDetail = {
      ...issueEntry,
      id: 'draft-iss',
      status: 'draft',
      metadata: { severity: 'high', resolutionStatus: 'open' },
    };

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

    beforeEach(() => {
      const ctx = new Proxy(
        {},
        {
          get: (target, prop) =>
            prop in target ? (target as Record<string | symbol, unknown>)[prop] : jest.fn(),
          set: (target, prop, value) => {
            (target as Record<string | symbol, unknown>)[prop] = value;
            return true;
          },
        },
      );
      HTMLCanvasElement.prototype.getContext = jest.fn(
        () => ctx,
      ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.toDataURL = jest.fn(
        () => 'data:image/png;base64,MOCKDATA',
      ) as unknown as typeof HTMLCanvasElement.prototype.toDataURL;
      Element.prototype.getBoundingClientRect = jest.fn(() => ({
        width: 300,
        height: 150,
        top: 0,
        left: 0,
        right: 300,
        bottom: 150,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      })) as unknown as typeof Element.prototype.getBoundingClientRect;
    });

    afterEach(() => {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      jest.useRealTimers();
    });

    const loadIssue = async (entry: DiaryEntryDetail) => {
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      mockUpdateDiaryEntry.mockResolvedValue(entry);
      renderEditPage(entry.id);
      await screen.findByRole('button', { name: /add signature/i });
    };

    const addPendingSignature = async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: /add signature/i }));
      await screen.findByLabelText('Signature canvas');
    };

    const clickPromote = async () => {
      const saveBtn = screen
        .getAllByRole('button')
        .find((btn) => /^save$/i.test(btn.textContent ?? ''))!;
      await userEvent.setup().click(saveBtn);
    };

    it('populates existing issue signatures from metadata', async () => {
      await loadIssue({
        ...draftIssue,
        isSigned: true,
        metadata: { severity: 'high', resolutionStatus: 'open', signatures: [sig] },
      });
      expect(screen.getByAltText('Signature of Alice Builder')).toBeInTheDocument();
    });

    it('"+ Add Signature" renders the capture UI (mutation: onIssueSignaturesChange prop removed)', async () => {
      await loadIssue(draftIssue);
      expect(screen.queryByLabelText('Signature canvas')).not.toBeInTheDocument();
      await addPendingSignature();
      expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
    });

    it('a pending signature blocks promote with #issue-signatures-error', async () => {
      await loadIssue(draftIssue);
      await addPendingSignature();
      mockPromoteDiaryEntry.mockClear();
      await clickPromote();

      expect(mockPromoteDiaryEntry).not.toHaveBeenCalled();
      const msg = await screen.findByText(ISSUE_INCOMPLETE);
      expect(msg).toHaveAttribute('id', 'issue-signatures-error');
      expect(msg).toHaveAttribute('role', 'alert');
    });

    it('autosave strips the incomplete signature from the issue metadata', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(draftIssue);
      mockUpdateDiaryEntry.mockResolvedValue(draftIssue);
      renderEditPage('draft-iss');
      const addBtn = await screen.findByRole('button', { name: /add signature/i });
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();

      fireEvent.click(addBtn);
      await jest.advanceTimersByTimeAsync(1100);

      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      const call = mockUpdateDiaryEntry.mock.calls[mockUpdateDiaryEntry.mock.calls.length - 1]!;
      const metadata = (call[1] as { metadata?: Record<string, unknown> | null }).metadata;
      expect(metadata).toEqual(expect.objectContaining({ severity: 'high' }));
      expect(metadata ?? {}).not.toHaveProperty('signatures');
      expect(screen.getByLabelText('Signature canvas')).toBeInTheDocument();
    });

    it('promote payload includes the accepted signature', async () => {
      await loadIssue(draftIssue);
      await addPendingSignature();
      const canvas = screen.getByLabelText('Signature canvas');
      fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
      fireEvent.mouseMove(canvas, { clientX: 20, clientY: 20 });
      fireEvent.click(screen.getByRole('button', { name: 'Accept Signature' }));
      await waitFor(() =>
        expect(screen.queryByLabelText('Signature canvas')).not.toBeInTheDocument(),
      );

      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftIssue, status: 'saved' });
      await clickPromote();

      await waitFor(() => expect(mockPromoteDiaryEntry).toHaveBeenCalledTimes(1));
      const metadata = (
        mockPromoteDiaryEntry.mock.calls[0]![1] as { metadata?: { signatures?: unknown[] } }
      ).metadata;
      expect(metadata?.signatures).toEqual([
        expect.objectContaining({
          signerName: 'Alice Builder',
          signerType: 'self',
          signatureDataUrl: 'data:image/png;base64,MOCKDATA',
        }),
      ]);
    });

    it('promoting an issue without signatures omits the signatures key', async () => {
      await loadIssue(draftIssue);
      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftIssue, status: 'saved' });
      await clickPromote();
      await waitFor(() => expect(mockPromoteDiaryEntry).toHaveBeenCalledTimes(1));
      const metadata = (
        mockPromoteDiaryEntry.mock.calls[0]![1] as { metadata?: Record<string, unknown> | null }
      ).metadata;
      expect(metadata ?? {}).not.toHaveProperty('signatures');
    });
  });

  // ─── Shared Modal dialogs (D2) ──────────────────────────────────────────────

  describe('delete and discard dialogs use the shared Modal', () => {
    const DELETE = { name: 'Delete Diary Entry' };
    const DISCARD = { name: 'Discard Draft' };

    const openDelete = async (entry = baseDailyLogEntry) => {
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      renderEditPage(entry.id);
      await userEvent.setup().click(await screen.findByRole('button', { name: /^delete entry$/i }));
      return screen.findByRole('dialog', DELETE);
    };

    const openDiscard = async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      renderEditPage('draft-1');
      await userEvent
        .setup()
        .click(await screen.findByRole('button', { name: /^discard draft$/i }));
      return screen.findByRole('dialog', DISCARD);
    };

    it('portals the delete dialog to document.body and drops the fixed title id', async () => {
      const dialog = await openDelete();
      expect(dialog.parentElement).toBe(document.body);
      expect(document.getElementById('delete-modal-title')).toBeNull();
    });

    it('portals the discard dialog to document.body and drops the fixed title id', async () => {
      const dialog = await openDiscard();
      expect(dialog.parentElement).toBe(document.body);
      expect(document.getElementById('discard-modal-title')).toBeNull();
    });

    it.each([
      ['Escape', async () => fireEvent.keyDown(document, { key: 'Escape' })],
      [
        'the close button',
        async () => userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' })),
      ],
    ])('delete dialog closes via %s', async (_label, close) => {
      await openDelete();
      await close();
      await waitFor(() => expect(screen.queryByRole('dialog', DELETE)).not.toBeInTheDocument());
    });

    it.each([
      ['Escape', async () => fireEvent.keyDown(document, { key: 'Escape' })],
      [
        'the close button',
        async () => userEvent.setup().click(screen.getByRole('button', { name: 'Close dialog' })),
      ],
      [
        'the backdrop',
        async () =>
          fireEvent.click(screen.getByRole('dialog', DISCARD).firstElementChild as HTMLElement),
      ],
    ])('discard dialog closes via %s', async (_label, close) => {
      await openDiscard();
      await close();
      await waitFor(() => expect(screen.queryByRole('dialog', DISCARD)).not.toBeInTheDocument());
    });

    it('Escape does not close the delete dialog while the delete is in flight', async () => {
      let resolveDelete: () => void = () => undefined;
      mockDeleteDiaryEntry.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
      );
      const dialog = await openDelete();
      await userEvent
        .setup()
        .click(within(dialog).getByRole('button', { name: /^delete entry$/i }));
      await within(dialog).findByRole('button', { name: /deleting/i });

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog', DELETE)).toBeInTheDocument();

      await act(async () => {
        resolveDelete();
      });
    });

    it('Escape does not close the discard dialog while the discard is in flight', async () => {
      let resolveDelete: () => void = () => undefined;
      mockDeleteDiaryEntry.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
      );
      const dialog = await openDiscard();
      await userEvent
        .setup()
        .click(within(dialog).getByRole('button', { name: /^discard draft$/i }));
      await within(dialog).findByRole('button', { name: /discarding/i });

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByRole('dialog', DISCARD)).toBeInTheDocument();

      await act(async () => {
        resolveDelete();
      });
    });

    it('a delete failure shows the FormError inside the dialog and hides the confirm button', async () => {
      mockDeleteDiaryEntry.mockRejectedValueOnce(new Error('boom'));
      const dialog = await openDelete();
      await userEvent
        .setup()
        .click(within(dialog).getByRole('button', { name: /^delete entry$/i }));

      const alert = await within(dialog).findByText(/failed to delete diary entry/i);
      expect(dialog).toContainElement(alert);
      expect(within(dialog).queryByRole('button', { name: /^delete entry$/i })).toBeNull();
      expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  // ─── Whole-file coverage ────────────────────────────────────────────────────

  describe('route guard', () => {
    it('shows "Entry Not Found" when the route has no id param', async () => {
      render(
        <ToastProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/diary/edit']}>
              <Routes>
                <Route path="/diary/edit" element={<DiaryEntryEditPage />} />
                <Route path="/diary" element={<div data-testid="diary-list">Diary List</div>} />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </ToastProvider>,
      );
      expect(await screen.findByRole('heading', { name: /entry not found/i })).toBeInTheDocument();
      expect(mockGetDiaryEntry).not.toHaveBeenCalled();
      await userEvent.setup().click(screen.getByRole('button', { name: /back to diary/i }));
      expect(await screen.findByTestId('diary-list')).toBeInTheDocument();
    });

    it('the load-error card "Back to Diary" button navigates to /diary', async () => {
      mockGetDiaryEntry.mockRejectedValueOnce(new Error('Network failure'));
      renderEditPage();
      await userEvent.setup().click(await screen.findByRole('button', { name: /back to diary/i }));
      expect(await screen.findByTestId('diary-list')).toBeInTheDocument();
    });
  });

  describe('metadata round trip on save (populateForm + buildMetadata)', () => {
    const saveAndGetPayload = async (entry: DiaryEntryDetail) => {
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      mockUpdateDiaryEntry.mockResolvedValue(entry);
      renderEditPage(entry.id);
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1));
      expect(mockUpdateDiaryEntry.mock.calls[0]![0]).toBe(entry.id);
      return mockUpdateDiaryEntry.mock.calls[0]![1] as { metadata: unknown };
    };

    it('daily_log: sends every populated field, without the derived vendorName', async () => {
      const payload = await saveAndGetPayload({
        ...baseDailyLogEntry,
        id: 'rt-dl',
        metadata: {
          weather: 'rainy',
          temperatureCelsius: 18,
          workersOnSite: 4,
          vendorId: 'v-1',
          vendorName: 'Acme',
          workStart: '07:00',
          workEnd: '16:00',
        },
      });
      expect(payload.metadata).toEqual({
        weather: 'rainy',
        temperatureCelsius: 18,
        workersOnSite: 4,
        vendorId: 'v-1',
        workStart: '07:00',
        workEnd: '16:00',
      });
    });

    it('site_visit: sends inspector and outcome', async () => {
      const payload = await saveAndGetPayload({ ...siteVisitEntry, id: 'rt-sv' });
      expect(payload.metadata).toEqual({ inspectorName: 'Bob Inspector', outcome: 'pass' });
    });

    it('delivery: sends vendor and materials', async () => {
      const payload = await saveAndGetPayload({ ...deliveryEntry, id: 'rt-del' });
      expect(payload.metadata).toEqual({
        vendor: 'TimberCo',
        materials: ['Oak planks', 'Pine beams'],
      });
    });

    it('delivery: an empty materials list is omitted', async () => {
      const payload = await saveAndGetPayload({
        ...deliveryEntry,
        id: 'rt-del2',
        metadata: { vendor: 'TimberCo', materials: [] },
      });
      expect(payload.metadata).toEqual({ vendor: 'TimberCo' });
    });

    it('issue: sends severity and resolution status', async () => {
      const payload = await saveAndGetPayload({ ...issueEntry, id: 'rt-iss' });
      expect(payload.metadata).toEqual({ severity: 'high', resolutionStatus: 'open' });
    });

    it.each([
      ['daily_log', baseDailyLogEntry],
      ['delivery', deliveryEntry],
    ] as const)('%s with an empty metadata object sends metadata null', async (_t, base) => {
      const payload = await saveAndGetPayload({ ...base, id: 'rt-empty', metadata: {} });
      expect(payload.metadata).toBeNull();
    });

    it('general_note sends metadata null', async () => {
      const payload = await saveAndGetPayload({ ...generalNoteEntry, id: 'rt-gn' });
      expect(payload.metadata).toBeNull();
    });
  });

  describe('save-time validation', () => {
    const trySave = async (entry: DiaryEntryDetail) => {
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      renderEditPage(entry.id);
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));
    };

    it('site_visit requires inspector name and outcome', async () => {
      await trySave({ ...siteVisitEntry, id: 'v-sv', metadata: {} });
      expect(await screen.findByText('Inspector name is required')).toBeInTheDocument();
      expect(screen.getByText('Inspection outcome is required')).toBeInTheDocument();
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
    });

    it('issue requires severity and resolution status', async () => {
      await trySave({ ...issueEntry, id: 'v-iss', metadata: {} });
      expect(await screen.findByText('Severity is required')).toBeInTheDocument();
      expect(screen.getByText('Resolution status is required')).toBeInTheDocument();
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
    });

    it('daily_log rejects a work end that is not after the work start', async () => {
      await trySave({
        ...baseDailyLogEntry,
        id: 'v-dl',
        metadata: { workStart: '16:00', workEnd: '07:00' },
      });
      expect(await screen.findByText('End time must be after start time')).toBeInTheDocument();
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
    });

    it('daily_log accepts a work end after the work start', async () => {
      mockUpdateDiaryEntry.mockResolvedValue(baseDailyLogEntry);
      await trySave({
        ...baseDailyLogEntry,
        id: 'v-dl2',
        metadata: { workStart: '07:00', workEnd: '16:00' },
      });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
    });

    it('rejects an empty body and an empty entry date', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({ ...generalNoteEntry, id: 'v-gn' });
      renderEditPage('v-gn');
      const user = userEvent.setup();
      fireEvent.change(await screen.findByLabelText(/entry date/i), { target: { value: '' } });
      fireEvent.change(screen.getByRole('textbox', { name: /^entry/i }), { target: { value: '' } });
      await user.click(screen.getByRole('button', { name: /save changes/i }));
      expect(await screen.findByText('Entry text is required')).toBeInTheDocument();
      expect(screen.getByText('Entry date is required')).toBeInTheDocument();
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
    });

    it('site_visit signature placeholders also block saving', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({ ...siteVisitEntry, id: 'v-sv2' });
      renderEditPage('v-sv2');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /add signature/i }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));
      expect(await screen.findByText(/unfinished signature/i)).toHaveAttribute(
        'id',
        'site-visit-signatures-error',
      );
    });
  });

  describe('promote and update error handling', () => {
    it('a non-validation ApiClientError on a saved update shows the translated message', async () => {
      const { ApiClientError } = await import('../../lib/apiClient.js');
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      mockUpdateDiaryEntry.mockRejectedValueOnce(
        new ApiClientError(403, { code: 'IMMUTABLE_ENTRY', message: 'raw' }),
      );
      renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));
      expect(await screen.findByText('This diary entry cannot be modified.')).toHaveAttribute(
        'role',
        'alert',
      );
    });

    it('a non-API error on a saved update shows the generic update error and re-enables Save', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      mockUpdateDiaryEntry.mockRejectedValueOnce(new Error('offline'));
      renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));
      expect(await screen.findByText(/failed to update diary entry/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    });

    it('a promote success shows the success toast and navigates to the detail page', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftGeneralNoteEntry, status: 'saved' });
      renderEditPage('draft-1');
      const saveBtn = (await screen.findAllByRole('button')).find((b) =>
        /^save$/i.test(b.textContent ?? ''),
      )!;
      await userEvent.setup().click(saveBtn);
      await screen.findByTestId('detail-page');
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.any(String));
    });
  });

  describe('navigation buttons', () => {
    it('draft: Back and Cancel go to /diary', async () => {
      mockGetDiaryEntry.mockResolvedValue(draftGeneralNoteEntry);
      const { unmount } = renderEditPage('draft-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /back to entry/i }));
      expect(await screen.findByTestId('diary-list')).toBeInTheDocument();
      unmount();

      renderEditPage('draft-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /^cancel$/i }));
      expect(await screen.findByTestId('diary-list')).toBeInTheDocument();
    });

    it('saved: Back and Cancel go to the detail page', async () => {
      mockGetDiaryEntry.mockResolvedValue(baseDailyLogEntry);
      const { unmount } = renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /back to entry/i }));
      expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
      unmount();

      renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /^cancel$/i }));
      expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
    });
  });

  describe('discard failure', () => {
    it('keeps the dialog open and re-enables its buttons when the discard fails', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(draftGeneralNoteEntry);
      mockDeleteDiaryEntry.mockRejectedValueOnce(new Error('boom'));
      renderEditPage('draft-1');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /^discard draft$/i }));
      const dialog = await screen.findByRole('dialog', { name: 'Discard Draft' });
      await user.click(within(dialog).getByRole('button', { name: /^discard draft$/i }));

      await waitFor(() => expect(mockDeleteDiaryEntry).toHaveBeenCalledWith('draft-1'));
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: /^discard draft$/i })).toBeEnabled(),
      );
      expect(screen.getByRole('dialog', { name: 'Discard Draft' })).toBeInTheDocument();
      expect(screen.queryByTestId('diary-list')).not.toBeInTheDocument();

      // The failure is shown inside the dialog itself
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Failed to delete diary entry. Please try again.',
      );

      // Keep Draft closes it; reopening starts clean (stale error cleared)
      await user.click(within(dialog).getByRole('button', { name: /^keep draft$/i }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Discard Draft' })).not.toBeInTheDocument(),
      );
      await user.click(screen.getByRole('button', { name: /^discard draft$/i }));
      const reopened = await screen.findByRole('dialog', { name: 'Discard Draft' });
      expect(within(reopened).queryByRole('alert')).toBeNull();
    });
  });

  describe('photos wiring', () => {
    const load = async () => {
      photosState.photos = [{ id: 'p1' } as Photo];
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      await screen.findByTestId('photo-grid-mock');
    };

    it('opening a photo shows the viewer outside annotator mode; edit opens annotator mode', async () => {
      await load();
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-annotator',
        'false',
      );
      await user.click(screen.getByText('close-viewer'));
      await user.click(screen.getByText('edit-photo'));
      expect(await screen.findByTestId('photo-viewer-mock')).toHaveAttribute(
        'data-annotator',
        'true',
      );
    });

    it('deleting from the grid deletes that photo', async () => {
      await load();
      await userEvent.setup().click(screen.getByText('delete-photo'));
      expect(photosState.deletePhoto).toHaveBeenCalledWith('p1');
    });

    it('deleting from the viewer deletes the photo and closes the viewer', async () => {
      await load();
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      await user.click(await screen.findByText('delete-in-viewer'));
      expect(photosState.deletePhoto).toHaveBeenCalledWith('p1');
      expect(screen.queryByTestId('photo-viewer-mock')).not.toBeInTheDocument();
    });

    it('photo changes from the viewer are forwarded to the photo list', async () => {
      await load();
      const user = userEvent.setup();
      await user.click(screen.getByText('open-photo'));
      await user.click(await screen.findByText('change-in-viewer'));
      expect(photosState.updatePhotoInList).toHaveBeenCalledWith({ id: 'p1' });
    });

    it('an upload error is surfaced as an error toast', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      await screen.findByTestId('photo-upload-mock');
      act(() => capturedOnUploadError!('Upload failed'));
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Upload failed');
    });

    it('navigating away mid-upload is guarded by beforeunload; idle is not', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      await screen.findByTestId('photo-upload-mock');

      const idle = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(idle);
      expect(idle.defaultPrevented).toBe(false);

      act(() => capturedOnUploadingCountChange!(1));
      const busy = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(busy);
      expect(busy.defaultPrevented).toBe(true);
    });
  });

  describe('draft autosave status and field handling', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const loadDraftFake = async (entry: DiaryEntryDetail) => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      renderEditPage(entry.id);
      const weather = await screen.findByLabelText(/weather/i);
      await jest.advanceTimersByTimeAsync(50);
      mockUpdateDiaryEntry.mockClear();
      return weather;
    };

    const draftDl: DiaryEntryDetail = {
      ...baseDailyLogEntry,
      id: 'as-dl',
      status: 'draft',
      title: '',
      body: '',
      metadata: null,
    };

    it('shows Saving then Saved, then hides the status after three seconds', async () => {
      let resolveSave: (e: DiaryEntryDetail) => void = () => undefined;
      mockUpdateDiaryEntry.mockReturnValueOnce(
        new Promise<DiaryEntryDetail>((resolve) => {
          resolveSave = resolve;
        }),
      );
      const weather = await loadDraftFake(draftDl);
      mockUpdateDiaryEntry.mockReturnValueOnce(
        new Promise<DiaryEntryDetail>((resolve) => {
          resolveSave = resolve;
        }),
      );
      fireEvent.change(weather, { target: { value: 'cloudy' } });
      expect(await screen.findByTestId('autosave-status')).toHaveTextContent(/saving/i);

      await act(async () => {
        resolveSave(draftDl);
      });
      expect(screen.getByTestId('autosave-status')).toHaveTextContent(/saved/i);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(3100);
      });
      expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument();
    });

    it('shows an error status when autosave fails', async () => {
      const weather = await loadDraftFake(draftDl);
      mockUpdateDiaryEntry.mockRejectedValueOnce(new Error('offline'));
      fireEvent.change(weather, { target: { value: 'cloudy' } });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10);
      });
      expect(screen.getByTestId('autosave-status')).toHaveTextContent(
        /couldn.t save|error|failed/i,
      );
    });

    it('autosave omits an empty title and body and sends null title', async () => {
      const weather = await loadDraftFake(draftDl);
      mockUpdateDiaryEntry.mockResolvedValue(draftDl);
      fireEvent.change(weather, { target: { value: 'cloudy' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      const payload = mockUpdateDiaryEntry.mock.calls[0]![1] as {
        title: unknown;
        body: unknown;
        entryDate: unknown;
      };
      expect(payload.title).toBeNull();
      expect(payload.body).toBeUndefined();
      expect(payload.entryDate).toBe('2026-03-14');
    });

    it('blurring a field schedules a debounced autosave on a draft', async () => {
      await loadDraftFake(draftDl);
      mockUpdateDiaryEntry.mockResolvedValue(draftDl);
      fireEvent.blur(screen.getByLabelText(/^title$/i));
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1100);
      });
      expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1);
    });

    it('a second autosave aborts the first in-flight one', async () => {
      const weather = await loadDraftFake(draftDl);
      mockUpdateDiaryEntry.mockResolvedValue(draftDl);
      fireEvent.change(weather, { target: { value: 'cloudy' } });
      fireEvent.change(weather, { target: { value: 'rainy' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(2));
      const last = mockUpdateDiaryEntry.mock.calls[1]![1] as {
        metadata: { weather: string };
      };
      expect(last.metadata.weather).toBe('rainy');
    });

    it('saved entries never autosave or show a status', async () => {
      jest.useFakeTimers();
      mockGetDiaryEntry.mockResolvedValueOnce(baseDailyLogEntry);
      renderEditPage('de-1');
      const weather = await screen.findByLabelText(/weather/i);
      await jest.advanceTimersByTimeAsync(50);
      fireEvent.change(weather, { target: { value: 'cloudy' } });
      fireEvent.blur(screen.getByLabelText(/^title$/i));
      await jest.advanceTimersByTimeAsync(1500);
      expect(mockUpdateDiaryEntry).not.toHaveBeenCalled();
      expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument();
    });
  });

  describe('user without a profile', () => {
    it('adds signatures with an empty signer name when no user is available', async () => {
      mockUser = null as never;
      mockGetDiaryEntry.mockResolvedValueOnce({ ...draftGeneralNoteEntry, entryType: 'daily_log' });
      mockUpdateDiaryEntry.mockResolvedValue(draftGeneralNoteEntry);
      renderEditPage('draft-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /add signature/i }));
      expect(await screen.findByLabelText('Signature canvas')).toBeInTheDocument();
    });
  });

  describe('autosave with partially cleared metadata', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    const lastMetadata = () =>
      (
        mockUpdateDiaryEntry.mock.calls[mockUpdateDiaryEntry.mock.calls.length - 1]![1] as {
          metadata: unknown;
        }
      ).metadata;

    const loadDraft = async (entry: DiaryEntryDetail, firstControl: RegExp) => {
      mockGetDiaryEntry.mockResolvedValueOnce(entry);
      mockUpdateDiaryEntry.mockResolvedValue(entry);
      renderEditPage(entry.id);
      await screen.findByLabelText(firstControl);
      await waitFor(() => expect(screen.getByLabelText(firstControl)).toBeInTheDocument());
      mockUpdateDiaryEntry.mockClear();
    };

    it('site_visit: clearing the inspector keeps the outcome, then clearing both sends null', async () => {
      await loadDraft({ ...siteVisitEntry, id: 'ap-sv', status: 'draft' }, /inspector name/i);
      fireEvent.change(screen.getByLabelText(/inspector name/i), { target: { value: '' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1));
      expect(lastMetadata()).toEqual({ outcome: 'pass' });

      fireEvent.change(screen.getByLabelText(/inspection outcome/i), { target: { value: '' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(2));
      expect(lastMetadata()).toBeNull();
    });

    it('site_visit: clearing the outcome keeps the inspector', async () => {
      await loadDraft({ ...siteVisitEntry, id: 'ap-sv2', status: 'draft' }, /inspector name/i);
      fireEvent.change(screen.getByLabelText(/inspection outcome/i), { target: { value: '' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1));
      expect(lastMetadata()).toEqual({ inspectorName: 'Bob Inspector' });
    });

    it('issue: clearing severity keeps the resolution, then clearing both sends null', async () => {
      await loadDraft({ ...issueEntry, id: 'ap-iss', status: 'draft' }, /severity/i);
      fireEvent.change(screen.getByLabelText(/severity/i), { target: { value: '' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1));
      expect(lastMetadata()).toEqual({ resolutionStatus: 'open' });

      fireEvent.change(screen.getByLabelText(/resolution status/i), { target: { value: '' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(2));
      expect(lastMetadata()).toBeNull();
    });

    it('issue: clearing the resolution keeps the severity', async () => {
      await loadDraft({ ...issueEntry, id: 'ap-iss2', status: 'draft' }, /severity/i);
      fireEvent.change(screen.getByLabelText(/resolution status/i), { target: { value: '' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalledTimes(1));
      expect(lastMetadata()).toEqual({ severity: 'high' });
    });

    it('a cleared entry date is omitted from the autosave payload', async () => {
      await loadDraft({ ...siteVisitEntry, id: 'ap-date', status: 'draft' }, /inspector name/i);
      fireEvent.change(screen.getByLabelText(/entry date/i), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText(/inspection outcome/i), { target: { value: 'fail' } });
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      const payload = mockUpdateDiaryEntry.mock.calls[0]![1] as { entryDate: unknown };
      expect(payload.entryDate).toBeUndefined();
    });
  });

  describe('blank titles and unknown metadata shapes', () => {
    it('promote sends a null title when the title is blank', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({ ...draftGeneralNoteEntry, title: '   ' });
      mockPromoteDiaryEntry.mockResolvedValueOnce({ ...draftGeneralNoteEntry, status: 'saved' });
      renderEditPage('draft-1');
      const saveBtn = (await screen.findAllByRole('button')).find((b) =>
        /^save$/i.test(b.textContent ?? ''),
      )!;
      await userEvent.setup().click(saveBtn);
      await waitFor(() => expect(mockPromoteDiaryEntry).toHaveBeenCalled());
      expect((mockPromoteDiaryEntry.mock.calls[0]![1] as { title: unknown }).title).toBeNull();
    });

    it('saved update sends a null title when the title is blank', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({ ...baseDailyLogEntry, title: '' });
      mockUpdateDiaryEntry.mockResolvedValue(baseDailyLogEntry);
      renderEditPage('de-1');
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      expect((mockUpdateDiaryEntry.mock.calls[0]![1] as { title: unknown }).title).toBeNull();
    });

    it('a general_note with an empty metadata object loads and saves null metadata', async () => {
      mockGetDiaryEntry.mockResolvedValueOnce({ ...generalNoteEntry, metadata: {} });
      mockUpdateDiaryEntry.mockResolvedValue(generalNoteEntry);
      renderEditPage('de-gn');
      await userEvent.setup().click(await screen.findByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(mockUpdateDiaryEntry).toHaveBeenCalled());
      expect((mockUpdateDiaryEntry.mock.calls[0]![1] as { metadata: unknown }).metadata).toBeNull();
    });
  });
});

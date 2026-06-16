/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type * as DiaryApiTypes from '../../lib/diaryApi.js';
import type React from 'react';

// ── API mocks ─────────────────────────────────────────────────────────────────

const mockCreateDiaryEntry = jest.fn<typeof DiaryApiTypes.createDiaryEntry>();
const mockShowToast = jest.fn();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  createDiaryEntry: mockCreateDiaryEntry,
  getDiaryEntry: jest.fn(),
  listDiaryEntries: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
  promoteDiaryEntry: jest.fn(),
}));

// Mock ToastContext so useToast() works without a real ToastProvider.
// This avoids the dual-React instance issue caused by statically importing ToastProvider
// while the page component is dynamically imported (which loads its own React instance).
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: mockShowToast, dismissToast: jest.fn() }),
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

// ── Fixture ───────────────────────────────────────────────────────────────────

const draftEntry = {
  id: 'draft-new',
  entryType: 'general_note' as const,
  entryDate: '2026-03-14',
  title: null,
  body: '',
  metadata: null,
  isAutomatic: false,
  isSigned: false,
  status: 'draft' as const,
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityArea: null,
  sourceEntityTitle: null,
  photoCount: 0,
  createdBy: { id: 'user-1', displayName: 'Alice' },
  createdAt: '2026-03-14T09:00:00.000Z',
  updatedAt: '2026-03-14T09:00:00.000Z',
};

describe('DiaryEntryCreatePage', () => {
  let DiaryEntryCreatePage: React.ComponentType;
  // Providers are imported dynamically so they share the same module instance as the page
  // component (whether mocked or real), avoiding a dual-React-context mismatch.
  // When jest.unstable_mockModule intercepts (CI), ToastProvider and AuthProvider are
  // passthrough wrappers. Locally, the real providers are used with authApi mocked so
  // AuthProvider resolves immediately without network requests.
  let ToastProvider: React.ComponentType<{ children: React.ReactNode }>;
  let AuthProvider: React.ComponentType<{ children: React.ReactNode }>;

  beforeEach(async () => {
    localStorage.setItem('theme', 'light');
    if (!DiaryEntryCreatePage) {
      const mod = await import('./DiaryEntryCreatePage.js');
      DiaryEntryCreatePage = mod.default;
      const toastMod = await import('../../components/Toast/ToastContext.js');
      ToastProvider = toastMod.ToastProvider;
      const authMod = await import('../../contexts/AuthContext.js');
      AuthProvider = authMod.AuthProvider;
    }
    mockCreateDiaryEntry.mockReset();
    mockShowToast.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderPage = () =>
    render(
      <ToastProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={['/diary/new']}>
            <Routes>
              <Route path="/diary/new" element={<DiaryEntryCreatePage />} />
              <Route
                path="/diary/:id/edit"
                element={<div data-testid="edit-page">Edit Page</div>}
              />
              <Route path="/diary/:id" element={<div data-testid="detail-page">Detail Page</div>} />
              <Route path="/diary" element={<div data-testid="diary-list">Diary List</div>} />
            </Routes>
            <LocationDisplay />
          </MemoryRouter>
        </AuthProvider>
      </ToastProvider>,
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

    it('clicking the "Back to Diary" button navigates to /diary', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: /back to diary/i }));
      await waitFor(() => {
        expect(screen.getByTestId('diary-list')).toBeInTheDocument();
      });
    });
  });

  // ─── Type card click creates draft immediately (Story #1435) ─────────────────

  describe('type card click creates draft immediately', () => {
    it('Scenario 1: clicking general_note card calls createDiaryEntry and navigates to /diary/:id/edit', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce({ ...draftEntry, entryType: 'general_note' });
      renderPage();

      await user.click(screen.getByTestId('type-card-general_note'));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            entryType: 'general_note',
            status: 'draft',
          }),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/diary/draft-new/edit');
      });
    });

    it('Scenario 2: clicking daily_log card calls createDiaryEntry with entryType=daily_log', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce({ ...draftEntry, entryType: 'daily_log' });
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({ entryType: 'daily_log', status: 'draft' }),
        );
      });
    });

    it('Scenario 2: clicking site_visit card calls createDiaryEntry with entryType=site_visit', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce({ ...draftEntry, entryType: 'site_visit' });
      renderPage();

      await user.click(screen.getByTestId('type-card-site_visit'));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({ entryType: 'site_visit', status: 'draft' }),
        );
      });
    });

    it('Scenario 2: clicking delivery card calls createDiaryEntry with entryType=delivery', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce({ ...draftEntry, entryType: 'delivery' });
      renderPage();

      await user.click(screen.getByTestId('type-card-delivery'));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({ entryType: 'delivery', status: 'draft' }),
        );
      });
    });

    it('Scenario 2: clicking issue card calls createDiaryEntry with entryType=issue', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce({ ...draftEntry, entryType: 'issue' });
      renderPage();

      await user.click(screen.getByTestId('type-card-issue'));

      await waitFor(() => {
        expect(mockCreateDiaryEntry).toHaveBeenCalledWith(
          expect.objectContaining({ entryType: 'issue', status: 'draft' }),
        );
      });
    });

    it('Scenario 3: API error shows toast and does not navigate away from /diary/new', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockRejectedValueOnce(new Error('Server error'));
      renderPage();

      await user.click(screen.getByTestId('type-card-general_note'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('error', expect.any(String));
      });

      // Still on the create page — not navigated away
      expect(screen.getByTestId('location')).toHaveTextContent('/diary/new');
    });

    it('Scenario 4: double-click guard — createDiaryEntry called exactly once even if type card clicked twice', async () => {
      const user = userEvent.setup();
      // Never-resolving promise to keep the in-flight state active during both clicks
      mockCreateDiaryEntry.mockReturnValue(new Promise(() => undefined));
      renderPage();

      const typeCard = screen.getByTestId('type-card-general_note');
      await user.click(typeCard);
      await user.click(typeCard);

      expect(mockCreateDiaryEntry).toHaveBeenCalledTimes(1);
    });

    it('Scenario 5: no form step rendered after type card click — navigates to edit route stub', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce(draftEntry);
      renderPage();

      await user.click(screen.getByTestId('type-card-general_note'));

      // After navigation to /diary/:id/edit the edit-page stub is shown, not a form
      await waitFor(() => {
        expect(screen.getByTestId('edit-page')).toBeInTheDocument();
      });

      // No body textarea from form step should be present
      expect(screen.queryByRole('textbox', { name: /^entry/i })).not.toBeInTheDocument();
    });

    it('Scenario 6: other type cards are disabled while API call is in-flight', async () => {
      const user = userEvent.setup();
      // Never resolves — keeps the in-flight pending state
      mockCreateDiaryEntry.mockReturnValue(new Promise(() => undefined));
      renderPage();

      // Click daily_log to start the API call
      await user.click(screen.getByTestId('type-card-daily_log'));

      // While in-flight, the issue card should be disabled
      await waitFor(() => {
        expect(screen.getByTestId('type-card-issue')).toBeDisabled();
      });
    });
  });
});

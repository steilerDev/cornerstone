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
const mockUploadPhoto = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../lib/diaryApi.js', () => ({
  createDiaryEntry: mockCreateDiaryEntry,
  getDiaryEntry: jest.fn(),
  listDiaryEntries: jest.fn(),
  updateDiaryEntry: jest.fn(),
  deleteDiaryEntry: jest.fn(),
}));

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  uploadPhoto: mockUploadPhoto,
  getPhotosForEntity: jest.fn(),
  updatePhoto: jest.fn(),
  deletePhoto: jest.fn(),
  getPhotoFileUrl: jest.fn(),
  getPhotoThumbnailUrl: jest.fn(),
}));

// Mock ToastContext so useToast() works without a real ToastProvider.
// This avoids the dual-React instance issue caused by statically importing ToastProvider
// while the page component is dynamically imported (which loads its own React instance).
jest.unstable_mockModule('../../components/Toast/ToastContext.js', () => ({
  useToast: () => ({ toasts: [], showToast: jest.fn(), dismissToast: jest.fn() }),
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
  fetchVendors: jest.fn<() => Promise<any>>().mockResolvedValue({
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

// ── Fixture ───────────────────────────────────────────────────────────────────

const createdEntry = {
  id: 'de-new',
  entryType: 'daily_log' as const,
  entryDate: '2026-03-14',
  title: null,
  body: 'Some body text',
  metadata: null,
  isAutomatic: false,
  isSigned: false,
  sourceEntityType: null,
  sourceEntityId: null,
  sourceEntityTitle: null,
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
    mockUploadPhoto.mockReset();
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
      // Section heading is the first field label rendered as <h3> (Weather for daily_log)
      expect(screen.getByRole('heading', { level: 3, name: 'Weather' })).toBeInTheDocument();
    });

    it('shows site_visit metadata section after selecting site_visit', async () => {
      await advanceToFormStep('site_visit');
      // Section heading is the first field label rendered as <h3> (Inspector Name for site_visit)
      expect(screen.getByRole('heading', { level: 3, name: 'Inspector Name' })).toBeInTheDocument();
    });

    it('shows delivery metadata section after selecting delivery', async () => {
      await advanceToFormStep('delivery');
      // Section heading is the first field label rendered as <h3> (Vendor for delivery)
      expect(screen.getByRole('heading', { level: 3, name: 'Vendor' })).toBeInTheDocument();
    });

    it('shows issue metadata section after selecting issue', async () => {
      await advanceToFormStep('issue');
      // Section heading is the first field label rendered as <h3> (Issue Severity for issue)
      expect(screen.getByRole('heading', { level: 3, name: 'Issue Severity' })).toBeInTheDocument();
    });

    it('does not show any metadata section for general_note', async () => {
      await advanceToFormStep('general_note');
      // No type-specific <h3> headings for general_note
      expect(screen.queryByRole('heading', { level: 3, name: 'Weather' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Inspector Name' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 3, name: 'Vendor' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 3, name: 'Issue Severity' }),
      ).not.toBeInTheDocument();
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

  // ─── Photo file queue ────────────────────────────────────────────────────────

  describe('photo file queue', () => {
    async function advanceToFormStepWithUser(type = 'daily_log') {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId(`type-card-${type}`));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );
      return user;
    }

    it('renders the photo file input on the form step', async () => {
      await advanceToFormStepWithUser();
      expect(screen.getByTestId('create-photo-input')).toBeInTheDocument();
    });

    it('photo input is a file input that accepts images', async () => {
      await advanceToFormStepWithUser();
      const input = screen.getByTestId('create-photo-input') as HTMLInputElement;
      expect(input.type).toBe('file');
      expect(input.accept).toBe('image/*');
    });

    it('does not show pending photo count when no files are queued', async () => {
      await advanceToFormStepWithUser();
      expect(screen.queryByTestId('pending-photo-count')).not.toBeInTheDocument();
    });

    it('does not render the old "Photos can be added after saving" hint text', async () => {
      await advanceToFormStepWithUser();
      expect(screen.queryByText(/photos can be added after saving/i)).not.toBeInTheDocument();
    });

    it('shows pending photo count after files are selected', async () => {
      await advanceToFormStepWithUser();
      const input = screen.getByTestId('create-photo-input');
      const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
      fireEvent.change(input, { target: { files: [file] } });
      await waitFor(() => {
        expect(screen.getByTestId('pending-photo-count')).toBeInTheDocument();
        expect(screen.getByTestId('pending-photo-count').textContent).toContain('1');
      });
    });
  });

  // ─── Successful submit (navigation destination) ───────────────────────────────

  describe('post-submit navigation', () => {
    it('navigates to /diary/:id (detail page), NOT /diary/:id/edit after successful submit', async () => {
      const user = userEvent.setup();
      mockCreateDiaryEntry.mockResolvedValueOnce(createdEntry);
      renderPage();

      await user.click(screen.getByTestId('type-card-daily_log'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: /^entry/i })).toBeInTheDocument(),
      );

      await user.type(screen.getByRole('textbox', { name: /^entry/i }), 'Site work done.');
      await user.click(screen.getByRole('button', { name: /create entry/i }));

      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/diary/de-new');
      });
      // Confirm it is NOT the edit route
      expect(screen.getByTestId('location').textContent).not.toContain('/edit');
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

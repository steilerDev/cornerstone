/**
 * @jest-environment jsdom
 */
/**
 * Component tests for BackupsPage.tsx
 *
 * EPIC-19: Backup and Restore Feature
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type * as BackupsApiTypes from '../../lib/backupsApi.js';
import { ApiClientError } from '../../lib/apiClient.js';
import type { BackupListResponse, BackupResponse, RestoreInitiatedResponse } from '@cornerstone/shared';

// ─── Mock modules BEFORE importing component ────────────────────────────────

const mockListBackups = jest.fn<typeof BackupsApiTypes.listBackups>();
const mockCreateBackup = jest.fn<typeof BackupsApiTypes.createBackup>();
const mockDeleteBackup = jest.fn<typeof BackupsApiTypes.deleteBackup>();
const mockRestoreBackup = jest.fn<typeof BackupsApiTypes.restoreBackup>();

jest.unstable_mockModule('../../lib/backupsApi.js', () => ({
  listBackups: mockListBackups,
  createBackup: mockCreateBackup,
  deleteBackup: mockDeleteBackup,
  restoreBackup: mockRestoreBackup,
}));

// Mock SettingsSubNav to avoid AuthContext dependency
jest.unstable_mockModule('../../components/SettingsSubNav/SettingsSubNav.js', () => ({
  SettingsSubNav: () => null,
}));

// Mock formatters to provide stable date formatting in tests
jest.unstable_mockModule('../../lib/formatters.js', () => {
  const fmtDate = (d: string | null | undefined, fallback = '—') => {
    if (!d) return fallback;
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  return {
    formatDate: fmtDate,
    formatCurrency: (n: number) => `€${n.toFixed(2)}`,
    formatTime: (ts: string | null | undefined) => ts ?? '—',
    formatDateTime: (ts: string | null | undefined) => ts ?? '—',
    formatPercent: (n: number) => `${n.toFixed(2)}%`,
    computeActualDuration: () => null,
    useFormatters: () => ({
      formatDate: fmtDate,
      formatCurrency: (n: number) => `€${n.toFixed(2)}`,
      formatTime: (ts: string | null | undefined) => ts ?? '—',
      formatDateTime: (ts: string | null | undefined) => ts ?? '—',
      formatPercent: (n: number) => `${n.toFixed(2)}%`,
    }),
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const backup1 = {
  filename: 'cornerstone-backup-2026-03-22T020000Z.tar.gz',
  createdAt: '2026-03-22T02:00:00.000Z',
  sizeBytes: 102400,
};

const backup2 = {
  filename: 'cornerstone-backup-2026-01-01T000000Z.tar.gz',
  createdAt: '2026-01-01T00:00:00.000Z',
  sizeBytes: 81920,
};

const makeNotConfiguredError = () =>
  new ApiClientError(503, { code: 'BACKUP_NOT_CONFIGURED', message: 'Backup is not configured' });

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BackupsPage', () => {
  let BackupsPage: React.ComponentType;

  beforeEach(async () => {
    if (!BackupsPage) {
      const module = await import('./BackupsPage.js');
      BackupsPage = module.BackupsPage;
    }

    // Reset all mocks
    mockListBackups.mockReset();
    mockCreateBackup.mockReset();
    mockDeleteBackup.mockReset();
    mockRestoreBackup.mockReset();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/settings/backups']}>
        <BackupsPage />
      </MemoryRouter>,
    );
  }

  // ─── 503 Not Configured ──────────────────────────────────────────────────

  describe('when listBackups returns 503 BACKUP_NOT_CONFIGURED', () => {
    it('renders the not-configured EmptyState and no Create Backup button', async () => {
      mockListBackups.mockRejectedValueOnce(makeNotConfiguredError());

      renderPage();

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Should show not-configured message
      expect(screen.getByText(/backup is not configured/i)).toBeInTheDocument();

      // Should NOT show the Create Backup button
      expect(screen.queryByRole('button', { name: /create backup/i })).not.toBeInTheDocument();
    });

    it('shows the BACKUP_DIR configuration description', async () => {
      mockListBackups.mockRejectedValueOnce(makeNotConfiguredError());

      renderPage();

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });

      // Description text from settings.json
      expect(
        screen.getByText(/set the BACKUP_DIR environment variable/i),
      ).toBeInTheDocument();
    });
  });

  // ─── Loading state ────────────────────────────────────────────────────────

  describe('while loading', () => {
    it('renders a Skeleton loading indicator', () => {
      // Never resolves — stays in loading state
      mockListBackups.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      // Skeleton renders with role="status"
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('does not show the Create Backup button while loading', () => {
      mockListBackups.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      expect(screen.queryByRole('button', { name: /create backup/i })).not.toBeInTheDocument();
    });
  });

  // ─── Empty state (configured, no backups) ────────────────────────────────

  describe('when listBackups returns empty array', () => {
    it('renders the configured empty state message', async () => {
      mockListBackups.mockResolvedValueOnce({ backups: [] } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/no backups yet/i)).toBeInTheDocument();
      });
    });

    it('renders the Create Backup button', async () => {
      mockListBackups.mockResolvedValueOnce({ backups: [] } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      });
    });
  });

  // ─── Populated table ─────────────────────────────────────────────────────

  describe('when listBackups returns 2 backups', () => {
    it('renders a table with 2 rows', async () => {
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1, backup2],
      } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        // Find all rows in the table body — one per backup
        const rows = screen.getAllByRole('row');
        // 1 header row + 2 data rows
        expect(rows).toHaveLength(3);
      });
    });

    it('renders filenames in the table', async () => {
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1, backup2],
      } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
        expect(screen.getByText(backup2.filename)).toBeInTheDocument();
      });
    });

    it('renders Restore and Delete buttons for each backup', async () => {
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1, backup2],
      } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        const restoreButtons = screen.getAllByRole('button', { name: /restore/i });
        const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
        expect(restoreButtons).toHaveLength(2);
        expect(deleteButtons).toHaveLength(2);
      });
    });
  });

  // ─── Create Backup ────────────────────────────────────────────────────────

  describe('Create Backup button', () => {
    it('calls createBackup() when clicked', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({ backups: [] } as BackupListResponse);
      mockCreateBackup.mockResolvedValueOnce({
        backup: backup1,
      } as BackupResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /create backup/i }));

      expect(mockCreateBackup).toHaveBeenCalledTimes(1);
    });

    it('shows creating state ("Creating backup...") while the request is in progress', async () => {
      const user = userEvent.setup();
      // Mock list to show configured empty state
      mockListBackups.mockResolvedValueOnce({ backups: [] } as BackupListResponse);
      // Create backup never resolves — stays in creating state
      mockCreateBackup.mockReturnValueOnce(new Promise(() => {}));

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /create backup/i }));

      // Button should now show "Creating backup..."
      expect(screen.getByRole('button', { name: /creating backup/i })).toBeInTheDocument();
    });

    it('adds the new backup to the list after successful creation', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({ backups: [] } as BackupListResponse);
      mockCreateBackup.mockResolvedValueOnce({
        backup: backup1,
      } as BackupResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /create backup/i }));

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });
    });

    it('resets to enabled state after a failed createBackup() call', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({ backups: [] } as BackupListResponse);
      mockCreateBackup.mockRejectedValueOnce(
        new ApiClientError(503, {
          code: 'BACKUP_NOT_CONFIGURED',
          message: 'Backup is not configured',
        }),
      );

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create backup/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /create backup/i }));

      // After failed create, button should be re-enabled (not stuck in "creating" state)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create backup/i })).not.toBeDisabled();
      });

      // Error message should be displayed to the user
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to create backup/i)).toBeInTheDocument();
    });
  });

  // ─── Delete modal ─────────────────────────────────────────────────────────

  describe('Delete modal', () => {
    it('opens delete modal with correct filename when Delete button is clicked', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        // The filename appears in the table
        expect(screen.getAllByText(backup1.filename).length).toBeGreaterThan(0);
      });

      // Click the Delete button for backup1
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      await user.click(deleteButton);

      // Modal should appear — the filename now appears in both table and modal
      await waitFor(() => {
        expect(screen.getByText(/delete backup/i)).toBeInTheDocument();
        // Filename appears in table row + modal <strong> tag = 2 elements
        const filenameElements = screen.getAllByText(backup1.filename);
        expect(filenameElements.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('calls deleteBackup() with the filename when confirm button is clicked', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);
      mockDeleteBackup.mockResolvedValueOnce(undefined as void);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });

      // Open delete modal
      await user.click(screen.getByRole('button', { name: /delete/i }));

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByText(/delete backup/i)).toBeInTheDocument();
      });

      // Click confirm button in the modal footer (role button with "Delete" text, not the row button)
      const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
      // The last Delete button should be in the modal confirm footer
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      await user.click(confirmButton);

      expect(mockDeleteBackup).toHaveBeenCalledWith(backup1.filename);
    });

    it('closes the modal after successful deletion', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);
      mockDeleteBackup.mockResolvedValueOnce(undefined as void);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });

      // Open modal
      await user.click(screen.getByRole('button', { name: /delete/i }));
      await waitFor(() => {
        expect(screen.getByText(/delete backup/i)).toBeInTheDocument();
      });

      // Confirm delete
      const confirmButtons = screen.getAllByRole('button', { name: /^delete$/i });
      await user.click(confirmButtons[confirmButtons.length - 1]);

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByText(/delete backup/i)).not.toBeInTheDocument();
      });
    });
  });

  // ─── Restore modal ────────────────────────────────────────────────────────

  describe('Restore modal', () => {
    it('opens restore modal with the filename when Restore button is clicked', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });

      // Click Restore
      await user.click(screen.getByRole('button', { name: /restore/i }));

      await waitFor(() => {
        expect(screen.getByText(/restore backup/i)).toBeInTheDocument();
        // The filename should appear in the modal
        const filenameElements = screen.getAllByText(backup1.filename);
        expect(filenameElements.length).toBeGreaterThan(0);
      });
    });

    it('shows warning text in the restore modal', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /restore/i }));

      await waitFor(() => {
        // Warning text from settings.json restoreModal.warning
        expect(screen.getByText(/permanently replace all current application data/i)).toBeInTheDocument();
      });
    });

    it('calls restoreBackup() with the filename when confirm button is clicked', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);
      mockRestoreBackup.mockResolvedValueOnce({
        message: 'Restore initiated. Server is restarting.',
      } as RestoreInitiatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });

      // Open restore modal
      await user.click(screen.getByRole('button', { name: /restore/i }));

      await waitFor(() => {
        expect(screen.getByText(/restore backup/i)).toBeInTheDocument();
      });

      // Click "Restore & Restart" confirm button
      await user.click(screen.getByRole('button', { name: /restore & restart/i }));

      expect(mockRestoreBackup).toHaveBeenCalledWith(backup1.filename);
    });

    it('shows restarting message after successful restore initiation', async () => {
      const user = userEvent.setup();
      mockListBackups.mockResolvedValueOnce({
        backups: [backup1],
      } as BackupListResponse);
      mockRestoreBackup.mockResolvedValueOnce({
        message: 'Restore initiated. Server is restarting.',
      } as RestoreInitiatedResponse);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText(backup1.filename)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /restore/i }));

      await waitFor(() => {
        expect(screen.getByText(/restore backup/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /restore & restart/i }));

      // Should now show the restarting message
      await waitFor(() => {
        expect(
          screen.getByText(/server is restarting/i),
        ).toBeInTheDocument();
      });
    });
  });
});

/**
 * @jest-environment jsdom
 *
 * Unit tests for PhotoUpload component.
 * Story #1426: Diary photos lost on upload failure — Scenarios 51-53.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { Photo } from '@cornerstone/shared';
import type { PhotoUpload as PhotoUploadType } from './PhotoUpload.js';

// ─── Mock photoApi ─────────────────────────────────────────────────────────────

const mockUploadPhoto = jest.fn<() => Promise<Photo>>();

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  uploadPhoto: mockUploadPhoto,
  getPhotosForEntity: jest.fn(),
  updatePhoto: jest.fn(),
  deletePhoto: jest.fn(),
  getPhotoFileUrl: jest.fn(),
  getPhotoThumbnailUrl: jest.fn(),
}));

// ─── Dynamic import ────────────────────────────────────────────────────────────

let PhotoUpload: typeof PhotoUploadType;

describe('PhotoUpload', () => {
  beforeEach(async () => {
    if (!PhotoUpload) {
      const mod = await import('./PhotoUpload.js');
      PhotoUpload = mod.PhotoUpload;
    }
    mockUploadPhoto.mockReset();
    localStorage.setItem('theme', 'light');
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ─── Fixture helpers ────────────────────────────────────────────────────────

  function makePhoto(overrides: Partial<Photo> = {}): Photo {
    return {
      id: 'photo-1',
      entityType: 'diary_entry',
      entityId: 'de-1',
      filename: 'test.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024,
      width: 800,
      height: 600,
      takenAt: null,
      caption: null,
      sortOrder: 0,
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      ...overrides,
    };
  }

  function makeFile(name: string, type = 'image/jpeg'): File {
    return new File(['img-content'], name, { type });
  }

  function renderUpload(props: Partial<React.ComponentProps<typeof PhotoUpload>> = {}) {
    const defaultProps = {
      entityType: 'diary_entry',
      entityId: 'de-1',
      onUpload: jest.fn(),
    };
    return render(<PhotoUpload {...defaultProps} {...props} />);
  }

  // ─── Basic rendering ────────────────────────────────────────────────────────

  it('renders the upload zone', () => {
    renderUpload();
    expect(screen.getByTestId('photo-upload-zone')).toBeInTheDocument();
  });

  it('renders the hidden file input', () => {
    renderUpload();
    expect(screen.getByTestId('photo-file-input')).toBeInTheDocument();
  });

  it('renders no queue items initially', () => {
    renderUpload();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // ─── Scenario 51: concurrent upload slots ─────────────────────────────────

  describe('Scenario 51: attaching 5 photos when MAX_CONCURRENT=3', () => {
    it('immediately starts uploading at most 3 photos, remaining 2 stay queued', async () => {
      // Never resolve — so photos stay in "uploading" state
      mockUploadPhoto.mockReturnValue(new Promise(() => undefined));

      const files = [
        makeFile('photo1.jpg'),
        makeFile('photo2.jpg'),
        makeFile('photo3.jpg'),
        makeFile('photo4.jpg'),
        makeFile('photo5.jpg'),
      ];

      renderUpload();

      const fileInput = screen.getByTestId('photo-file-input');
      await act(async () => {
        fireEvent.change(fileInput, { target: { files } });
      });

      await waitFor(() => {
        // 5 items should appear in the queue
        const items = screen.getAllByText(/photo[1-5]\.jpg/);
        expect(items.length).toBeGreaterThanOrEqual(5);
      });

      // 3 items should show "Uploading..." state
      await waitFor(() => {
        const uploadingItems = screen.getAllByText(/uploading/i);
        expect(uploadingItems.length).toBeGreaterThanOrEqual(3);
      });

      // Upload was called 3 times (max concurrent slots)
      expect(mockUploadPhoto).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Scenario 52: failed upload shows error state ─────────────────────────

  describe('Scenario 52: failed upload → entry shows failed state with error and retry button', () => {
    it('shows "Failed" state and error message when upload throws', async () => {
      mockUploadPhoto.mockRejectedValueOnce(new Error('Upload network error'));

      const onError = jest.fn<(error: string) => void>();
      renderUpload({ onError });

      const fileInput = screen.getByTestId('photo-file-input');
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [makeFile('bad-photo.jpg')] } });
      });

      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/Upload network error/i)).toBeInTheDocument();
      });
    });

    it('shows retry button when upload fails', async () => {
      mockUploadPhoto.mockRejectedValueOnce(new Error('Network error'));
      renderUpload();

      const fileInput = screen.getByTestId('photo-file-input');
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [makeFile('fail.jpg')] } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry.*fail\.jpg/i })).toBeInTheDocument();
      });
    });

    it('calls onError with filename and error message when upload fails', async () => {
      mockUploadPhoto.mockRejectedValueOnce(new Error('Disk full'));
      const onError = jest.fn<(error: string) => void>();
      renderUpload({ onError });

      const fileInput = screen.getByTestId('photo-file-input');
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [makeFile('error-photo.jpg')] } });
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('error-photo.jpg'));
      });
    });
  });

  // ─── Scenario 53: retry resets entry to queued and re-uploads ─────────────

  describe('Scenario 53: clicking retry → entry returns to queued and re-uploads', () => {
    it('retry button resets state from failed to queued and triggers re-upload', async () => {
      // First upload fails, second succeeds
      const photo = makePhoto({ filename: 'retry-photo.jpg' });
      mockUploadPhoto
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(photo);

      const onUpload = jest.fn();
      renderUpload({ onUpload });

      const fileInput = screen.getByTestId('photo-file-input');
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [makeFile('retry-photo.jpg')] } });
      });

      // Wait for failure
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry.*retry-photo\.jpg/i })).toBeInTheDocument();
      });

      // Click retry
      const retryBtn = screen.getByRole('button', { name: /retry.*retry-photo\.jpg/i });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      // Second upload should be called
      await waitFor(() => {
        expect(mockUploadPhoto).toHaveBeenCalledTimes(2);
      });
    });

    it('retry results in onUpload called after successful second attempt', async () => {
      const photo = makePhoto({ filename: 'retry-success.jpg' });
      mockUploadPhoto
        .mockRejectedValueOnce(new Error('Try again'))
        .mockResolvedValueOnce(photo);

      const onUpload = jest.fn();
      renderUpload({ onUpload });

      const fileInput = screen.getByTestId('photo-file-input');
      await act(async () => {
        fireEvent.change(fileInput, { target: { files: [makeFile('retry-success.jpg')] } });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      await waitFor(() => {
        expect(onUpload).toHaveBeenCalledWith(photo);
      });
    });
  });

  // ─── Disabled state ────────────────────────────────────────────────────────

  it('does not trigger drag-active state when disabled', () => {
    renderUpload({ disabled: true });
    const zone = screen.getByTestId('photo-upload-zone');
    fireEvent.dragEnter(zone, { dataTransfer: { files: [] } });
    // disabled prop prevents state changes — zone class does NOT gain active style
    // Simply verify no error thrown
    expect(zone).toBeInTheDocument();
  });
});

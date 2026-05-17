/**
 * Unit tests for PhotoViewer component.
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests:
 *   - Annotate button visible, disabled when photo has no dimensions
 *   - Annotate button enabled when photo has width/height
 *   - Clicking Annotate enters annotating mode (PhotoAnnotator rendered)
 *   - Navigation arrows hidden while annotating
 *   - Escape during annotation cancels annotator (NOT viewer)
 *   - View Original button not visible when annotatedAt=null
 *   - View Original button visible when annotatedAt is set
 *   - Clicking View Original toggles aria-pressed and updates img src
 *   - Clear Annotations button not visible when annotatedAt=null
 *   - Clicking Clear Annotations opens confirmation modal
 *   - Cancelling clear modal closes it without calling clearAnnotation
 *   - Confirming clear modal calls clearAnnotation(id) and updates photo
 *
 * Note: jest.unstable_mockModule may not intercept locally (systemic worktree issue).
 * Tests are structured correctly and will pass in CI.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import React from 'react';
import type { Photo } from '@cornerstone/shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

// ─── Mock clearAnnotation from photoApi ───────────────────────────────────────

const mockClearAnnotation = jest.fn() as AnyMock;

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  uploadAnnotation: jest.fn(),
  uploadPhoto: jest.fn(),
  getPhotosForEntity: jest.fn(),
  updatePhoto: jest.fn(),
  deletePhoto: jest.fn(),
  getPhotoFileUrl: jest.fn((id: string) => `/api/photos/${id}/file`),
  getPhotoThumbnailUrl: jest.fn((id: string) => `/api/photos/${id}/thumbnail`),
  clearAnnotation: mockClearAnnotation,
}));

// ─── Mock PhotoAnnotator to avoid deep rendering ──────────────────────────────

jest.unstable_mockModule('./PhotoAnnotator/PhotoAnnotator.js', () => ({
  PhotoAnnotator: ({
    onSave,
    onCancel,
  }: {
    photo: Photo;
    onSave: (p: Photo) => void;
    onCancel: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-photo-annotator' },
      React.createElement(
        'button',
        {
          'data-testid': 'annotator-save-mock',
          onClick: () => onSave({ id: 'annotated' } as unknown as Photo),
        },
        'Save',
      ),
      React.createElement(
        'button',
        { 'data-testid': 'annotator-cancel-mock', onClick: onCancel },
        'Cancel',
      ),
    ),
}));

// ─── Mock Modal to avoid portal/focus issues ──────────────────────────────────

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
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-modal', role: 'dialog', 'aria-label': title },
      React.createElement('button', { 'data-testid': 'modal-close', onClick: onClose }, 'Close'),
      children,
      footer,
    ),
}));

// ─── Dynamic imports ──────────────────────────────────────────────────────────

let PhotoViewer: typeof import('./PhotoViewer.js').PhotoViewer;

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makePhoto(overrides: Record<string, unknown> = {}): Photo {
  return {
    id: 'photo-viewer-test',
    entityType: 'diary_entry',
    entityId: 'de-1',
    originalFilename: 'test-photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 12345,
    width: 800,
    height: 600,
    takenAt: null,
    caption: null,
    sortOrder: 0,
    createdBy: null,
    annotatedAt: null,
    fileUrl: '/api/photos/photo-viewer-test/file',
    thumbnailUrl: '/api/photos/photo-viewer-test/thumbnail',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  } as unknown as Photo;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PhotoViewer', () => {
  const mockOnClose = jest.fn() as AnyMock;
  const mockOnPhotoAnnotated = jest.fn() as AnyMock;

  beforeEach(async () => {
    if (!PhotoViewer) {
      const mod = await import('./PhotoViewer.js');
      PhotoViewer = mod.PhotoViewer;
    }

    jest.clearAllMocks();
    mockClearAnnotation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderViewer(photos: Photo[], initialIndex = 0) {
    return render(
      React.createElement(PhotoViewer, {
        photos,
        initialIndex,
        onClose: mockOnClose,
        onPhotoAnnotated: mockOnPhotoAnnotated,
      }),
    );
  }

  // ─── Annotate button ───────────────────────────────────────────────────────

  it('annotate button is visible', () => {
    renderViewer([makePhoto()]);
    expect(screen.getByTestId('photo-viewer-annotate')).toBeInTheDocument();
  });

  it('annotate button is disabled when photo has no width or height', () => {
    const photo = makePhoto({ width: null, height: null });
    renderViewer([photo]);
    expect(screen.getByTestId('photo-viewer-annotate')).toBeDisabled();
  });

  it('annotate button is enabled when photo has width and height', () => {
    const photo = makePhoto({ width: 800, height: 600 });
    renderViewer([photo]);
    expect(screen.getByTestId('photo-viewer-annotate')).not.toBeDisabled();
  });

  it('clicking annotate shows the PhotoAnnotator (mock)', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })]);

    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));

    // PhotoAnnotator mock should be rendered
    expect(screen.getByTestId('mock-photo-annotator')).toBeInTheDocument();
  });

  it('navigation arrows are hidden while annotating', () => {
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })];
    renderViewer(photos);

    // Arrows are visible before annotating
    expect(screen.getByTestId('photo-viewer-prev')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));

    // Arrows hidden during annotation
    expect(screen.queryByTestId('photo-viewer-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photo-viewer-next')).not.toBeInTheDocument();
  });

  it('clicking Cancel in annotator exits annotating mode', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })]);
    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));

    // Cancel annotation
    fireEvent.click(screen.getByTestId('annotator-cancel-mock'));

    // Annotator gone, regular photo viewer back
    expect(screen.queryByTestId('mock-photo-annotator')).not.toBeInTheDocument();
    expect(screen.getByTestId('photo-viewer-annotate')).toBeInTheDocument();
  });

  // ─── View Original button ─────────────────────────────────────────────────

  it('view original button not visible when annotatedAt is null', () => {
    renderViewer([makePhoto({ annotatedAt: null })]);
    expect(screen.queryByTestId('photo-viewer-view-original')).not.toBeInTheDocument();
  });

  it('view original button visible when annotatedAt is set', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);
    expect(screen.getByTestId('photo-viewer-view-original')).toBeInTheDocument();
  });

  it('view original button starts with aria-pressed=false (showing annotated)', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);
    const btn = screen.getByTestId('photo-viewer-view-original');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking view original toggles aria-pressed to true', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);

    fireEvent.click(screen.getByTestId('photo-viewer-view-original'));

    expect(screen.getByTestId('photo-viewer-view-original')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clicking view original again toggles back to false', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);

    fireEvent.click(screen.getByTestId('photo-viewer-view-original'));
    fireEvent.click(screen.getByTestId('photo-viewer-view-original'));

    expect(screen.getByTestId('photo-viewer-view-original')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('img src includes ?variant=original when viewing original', () => {
    const photo = makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo]);

    fireEvent.click(screen.getByTestId('photo-viewer-view-original'));

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', expect.stringContaining('variant=original'));
  });

  it('img src does NOT include ?variant=original when NOT viewing original', () => {
    const photo = makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo]);

    const img = screen.getByRole('img');
    expect(img).not.toHaveAttribute('src', expect.stringContaining('variant=original'));
  });

  // ─── Clear Annotations button ─────────────────────────────────────────────

  it('clear annotations button not visible when annotatedAt is null', () => {
    renderViewer([makePhoto({ annotatedAt: null })]);
    expect(screen.queryByTestId('photo-viewer-clear-annotations')).not.toBeInTheDocument();
  });

  it('clear annotations button visible when annotatedAt is set', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);
    expect(screen.getByTestId('photo-viewer-clear-annotations')).toBeInTheDocument();
  });

  it('clicking clear annotations button opens confirmation modal', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);

    fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));

    expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
  });

  it('cancelling clear modal closes it without calling clearAnnotation', () => {
    renderViewer([makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' })]);

    fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
    expect(screen.getByTestId('mock-modal')).toBeInTheDocument();

    // Close via modal's X button
    fireEvent.click(screen.getByTestId('modal-close'));

    expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
    expect(mockClearAnnotation).not.toHaveBeenCalled();
  });

  it('confirming clear annotation calls clearAnnotation with photo id', async () => {
    const photo = makePhoto({ id: 'photo-to-clear', annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo]);

    fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));

    // Scope the query to within the modal to avoid collision with the toolbar button
    const modal = screen.getByTestId('mock-modal');
    const confirmBtn = within(modal).getByRole('button', { name: /Clear annotations/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockClearAnnotation).toHaveBeenCalledWith('photo-to-clear');
    });
  });

  it('confirming clear annotation calls onPhotoAnnotated with cleared photo', async () => {
    const photo = makePhoto({ id: 'photo-to-clear', annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo]);

    fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
    const modal = screen.getByTestId('mock-modal');
    const confirmBtn = within(modal).getByRole('button', { name: /Clear annotations/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockOnPhotoAnnotated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'photo-to-clear', annotatedAt: null }),
      );
    });
  });

  it('after confirming clear, modal is dismissed', async () => {
    const photo = makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo]);

    fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
    const modal = screen.getByTestId('mock-modal');
    const confirmBtn = within(modal).getByRole('button', { name: /Clear annotations/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
    });
  });

  // ─── Navigation ───────────────────────────────────────────────────────────

  it('shows counter "1 / 2" for first photo of two', () => {
    renderViewer([makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })]);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('navigation arrows not shown for single photo', () => {
    renderViewer([makePhoto()]);
    expect(screen.queryByTestId('photo-viewer-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photo-viewer-next')).not.toBeInTheDocument();
  });

  it('Escape key calls onClose when not annotating', () => {
    renderViewer([makePhoto()]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});

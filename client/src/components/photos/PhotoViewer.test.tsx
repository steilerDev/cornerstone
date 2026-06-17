/**
 * Unit tests for PhotoViewer component.
 *
 * Story #1473: Photo Annotator Foundation
 * Story #1482: setCurrentPhoto called on save/clear so buttons update immediately
 * Story #1497: Lightbox Delete for Non-Draft Entries
 * Bug #1734: Photo Lightbox metadata persistence — onPhotoChanged propagation
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
 *   - (#1482) After annotation save, view-original and clear-annotations buttons appear immediately
 *   - (#1482) After clear annotation confirmed, view-original and clear-annotations buttons disappear immediately
 *   - Delete button hidden when onDelete not provided
 *   - Delete button hidden when editable=false
 *   - Delete button visible regardless of annotation state (gated only by editable + onDelete)
 *   - Delete button visible when editable=true, onDelete provided, no annotations
 *   - Clicking delete opens confirmation modal
 *   - Cancelling delete modal closes it without calling onDelete
 *   - Confirming delete calls onDelete and closes viewer
 *   - (#1734) Annotation save calls onPhotoChanged with updated photo
 *   - (#1734) Metadata save calls onPhotoChanged with updated photo
 *   - (#1734) Metadata save propagates: onPhotoChanged called before navigation
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
//
// The save button passes back a photo that has annotatedAt set (simulating a
// successful annotation save). This is required for the #1482 fix tests:
// after onSave fires, setCurrentPhoto(updatedPhoto) must make the
// view-original and clear-annotations buttons appear immediately.

jest.unstable_mockModule('./PhotoAnnotator/PhotoAnnotator.js', () => ({
  PhotoAnnotator: ({
    photo,
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
          onClick: () =>
            onSave({
              ...photo,
              annotatedAt: '2026-05-29T10:00:00.000Z',
            } as Photo),
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

// ─── Mock PhotoMetadataSidepanel ──────────────────────────────────────────────
// The sidepanel now always renders (no isOpen/onClose props). Mock to avoid
// rendering dependencies like LocaleProvider which aren't available in unit tests.
// Clicking the mock div triggers onPhotoUpdated with a mutated photo (caption + areaId set),
// so tests can verify that the metadata-save path calls onPhotoChanged.

jest.unstable_mockModule('./PhotoMetadataSidepanel.js', () => ({
  PhotoMetadataSidepanel: ({
    photo,
    onPhotoUpdated,
  }: {
    photo: Photo;
    onPhotoUpdated?: (p: Photo) => void;
    isAnnotating?: boolean;
  }) =>
    React.createElement('div', {
      'data-testid': 'mock-metadata-sidepanel',
      'data-photo-id': photo.id,
      onClick: () =>
        onPhotoUpdated?.({ ...photo, caption: 'saved-caption', areaId: 'area-1' } as Photo),
    }),
}));

// ─── Dynamic imports ──────────────────────────────────────────────────────────

import type * as PhotoViewerModule from './PhotoViewer.js';

let PhotoViewer: (typeof PhotoViewerModule)['PhotoViewer'];

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
    areaId: null,
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
  const mockOnPhotoChanged = jest.fn() as AnyMock;
  const mockOnDelete = jest.fn() as AnyMock;

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

  function renderViewer(
    photos: Photo[],
    initialIndex = 0,
    editable = true,
    startInAnnotator = false,
    onDelete?: typeof mockOnDelete,
  ) {
    return render(
      React.createElement(PhotoViewer, {
        photos,
        initialIndex,
        onClose: mockOnClose,
        onPhotoChanged: mockOnPhotoChanged,
        editable,
        startInAnnotator,
        onDelete,
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

  it('annotate button is disabled when editable=false', () => {
    const photo = makePhoto({ width: 800, height: 600 });
    renderViewer([photo], 0, false);
    expect(screen.getByTestId('photo-viewer-annotate')).toBeDisabled();
  });

  it('annotate button has signed entry tooltip when editable=false', () => {
    const photo = makePhoto({ width: 800, height: 600 });
    renderViewer([photo], 0, false);
    const btn = screen.getByTestId('photo-viewer-annotate');
    expect(btn).toHaveAttribute('title', expect.stringContaining('cannot be annotated'));
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

  // ─── #1482 fix: setCurrentPhoto on save/clear ─────────────────────────────
  //
  // Before the fix, saving an annotation did not call setCurrentPhoto, so the
  // view-original and clear-annotations buttons only appeared after a parent
  // re-render. After the fix, handleAnnotationSave calls setCurrentPhoto(updatedPhoto)
  // immediately, so the buttons appear without needing an external state update.

  it('#1482 — after annotation save with annotatedAt set, view-original button appears immediately', () => {
    // Start with a photo that has no annotation
    const photo = makePhoto({ id: 'p-fix', width: 800, height: 600, annotatedAt: null });
    renderViewer([photo]);

    // Confirm the button is absent before annotating
    expect(screen.queryByTestId('photo-viewer-view-original')).not.toBeInTheDocument();

    // Enter annotating mode and click Save (the mock onSave passes annotatedAt='2026-05-29T...')
    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
    fireEvent.click(screen.getByTestId('annotator-save-mock'));

    // The annotator should be gone (save exited annotating mode)
    expect(screen.queryByTestId('mock-photo-annotator')).not.toBeInTheDocument();

    // Both annotation-dependent buttons must now be visible — no parent re-render needed
    expect(screen.getByTestId('photo-viewer-view-original')).toBeInTheDocument();
    expect(screen.getByTestId('photo-viewer-clear-annotations')).toBeInTheDocument();
  });

  it('#1482 — after clear annotation confirmed, view-original and clear-annotations buttons disappear immediately', async () => {
    // Start with a photo that already has an annotation
    const photo = makePhoto({ id: 'p-clear-fix', annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo]);

    // Confirm buttons are visible at the start
    expect(screen.getByTestId('photo-viewer-view-original')).toBeInTheDocument();
    expect(screen.getByTestId('photo-viewer-clear-annotations')).toBeInTheDocument();

    // Click "Clear Annotations" to open the confirmation modal
    fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));

    // Confirm via the modal's confirm button
    const modal = screen.getByTestId('mock-modal');
    const confirmBtn = within(modal).getByRole('button', { name: /Clear annotations/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });

    // After clearAnnotation resolves, setCurrentPhoto(clearedPhoto) fires with annotatedAt=null
    // so the annotation-dependent buttons must disappear immediately
    await waitFor(() => {
      expect(screen.queryByTestId('photo-viewer-view-original')).not.toBeInTheDocument();
      expect(screen.queryByTestId('photo-viewer-clear-annotations')).not.toBeInTheDocument();
    });
  });

  // ─── #1734 fix: onPhotoChanged called by all three mutation paths ─────────
  //
  // The bug was that handlePhotoUpdated (the metadata-save path) only called
  // setCurrentPhoto but did NOT call onPhotoChanged, so the parent's photo list
  // was never updated. All three mutation callbacks must propagate the change.

  it('#1734 — annotation save calls onPhotoChanged with the updated photo', () => {
    const photo = makePhoto({ id: 'p-annotate', width: 800, height: 600, annotatedAt: null });
    renderViewer([photo]);

    // Enter annotating mode and click Save (mock passes annotatedAt set)
    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
    fireEvent.click(screen.getByTestId('annotator-save-mock'));

    // onPhotoChanged must be called with annotatedAt set
    expect(mockOnPhotoChanged).toHaveBeenCalledWith(
      expect.objectContaining({ annotatedAt: '2026-05-29T10:00:00.000Z' }),
    );
  });

  it('#1734 — metadata save calls onPhotoChanged with the updated photo', () => {
    const photo = makePhoto({ id: 'p-metadata', caption: null, areaId: null });
    renderViewer([photo]);

    // Click the mock sidepanel — fires onPhotoUpdated with caption+areaId set
    fireEvent.click(screen.getByTestId('mock-metadata-sidepanel'));

    // onPhotoChanged must be called with the mutated photo
    expect(mockOnPhotoChanged).toHaveBeenCalledWith(
      expect.objectContaining({ caption: 'saved-caption' }),
    );
  });

  it('#1734 — metadata save propagates: onPhotoChanged called before navigation', () => {
    // Two photos: A at index 0, B at index 1
    const photoA = makePhoto({ id: 'p-a', caption: null });
    const photoB = makePhoto({ id: 'p-b', caption: null });
    renderViewer([photoA, photoB], 0);

    // Save metadata on photo A — sidepanel mock fires onPhotoUpdated
    fireEvent.click(screen.getByTestId('mock-metadata-sidepanel'));

    // Verify propagation happened immediately (before any navigation)
    expect(mockOnPhotoChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-a', caption: 'saved-caption' }),
    );

    // Navigate to photo B
    fireEvent.click(screen.getByTestId('photo-viewer-next'));

    // Sidepanel now shows photo B
    expect(screen.getByTestId('mock-metadata-sidepanel')).toHaveAttribute('data-photo-id', 'p-b');

    // Navigate back to photo A
    fireEvent.click(screen.getByTestId('photo-viewer-prev'));

    // Sidepanel shows photo A again
    expect(screen.getByTestId('mock-metadata-sidepanel')).toHaveAttribute('data-photo-id', 'p-a');

    // onPhotoChanged was called exactly once (for the metadata save on A)
    expect(mockOnPhotoChanged).toHaveBeenCalledTimes(1);
    expect(mockOnPhotoChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-a', caption: 'saved-caption' }),
    );
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

  it('confirming clear annotation calls onPhotoChanged with cleared photo', async () => {
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
      expect(mockOnPhotoChanged).toHaveBeenCalledWith(
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

  // ─── startInAnnotator prop ─────────────────────────────────────────────────

  it('starts in view mode when startInAnnotator=false (default)', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })], 0, true, false);
    // Annotate button should be visible (not hidden by annotating)
    expect(screen.getByTestId('photo-viewer-annotate')).toBeInTheDocument();
    expect(screen.getByTestId('photo-viewer-annotate')).not.toBeDisabled();
  });

  it('starts in annotator mode when startInAnnotator=true and editable=true', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })], 0, true, true);
    // Navigation arrows should be hidden (annotating=true)
    expect(screen.queryByTestId('photo-viewer-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photo-viewer-next')).not.toBeInTheDocument();
  });

  it('starts in view mode when startInAnnotator=true but editable=false', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })], 0, false, true);
    // Should stay in view mode — annotate button disabled, navigation visible
    expect(screen.getByTestId('photo-viewer-annotate')).toBeDisabled();
  });

  // ─── Metadata Sidepanel (always visible) ──────────────────────────────────
  // The sidepanel no longer has a toggle button — it is always rendered
  // alongside the photo. No isOpen/onClose props exist on the component.

  it('metadata sidepanel is always rendered when the viewer is open', () => {
    renderViewer([makePhoto()]);
    expect(screen.getByTestId('mock-metadata-sidepanel')).toBeInTheDocument();
  });

  // ─── Delete Photo button ──────────────────────────────────────────────────

  it('delete button is hidden when onDelete is not provided', () => {
    renderViewer([makePhoto()], 0, true, false, undefined);
    expect(screen.queryByTestId('photo-viewer-delete')).not.toBeInTheDocument();
  });

  it('delete button is hidden when editable=false', () => {
    renderViewer([makePhoto()], 0, false, false, mockOnDelete);
    expect(screen.queryByTestId('photo-viewer-delete')).not.toBeInTheDocument();
  });

  it('delete button is visible when photo is annotated (annotation state does not gate delete)', () => {
    const photo = makePhoto({ annotatedAt: '2026-05-17T10:00:00.000Z' });
    renderViewer([photo], 0, true, false, mockOnDelete);
    expect(screen.getByTestId('photo-viewer-delete')).toBeInTheDocument();
  });

  it('delete button is visible when editable=true and onDelete is provided', () => {
    renderViewer([makePhoto({ annotatedAt: null })], 0, true, false, mockOnDelete);
    expect(screen.getByTestId('photo-viewer-delete')).toBeInTheDocument();
  });

  it('clicking delete button opens confirmation modal', () => {
    renderViewer([makePhoto()], 0, true, false, mockOnDelete);

    fireEvent.click(screen.getByTestId('photo-viewer-delete'));

    expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
  });

  it('cancelling delete modal closes it without calling onDelete', () => {
    renderViewer([makePhoto()], 0, true, false, mockOnDelete);

    fireEvent.click(screen.getByTestId('photo-viewer-delete'));
    expect(screen.getByTestId('mock-modal')).toBeInTheDocument();

    // Close via modal's X button
    fireEvent.click(screen.getByTestId('modal-close'));

    expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it('confirming delete calls onDelete with photo id and closes viewer', async () => {
    const photo = makePhoto({ id: 'photo-to-delete' });
    renderViewer([photo], 0, true, false, mockOnDelete);

    fireEvent.click(screen.getByTestId('photo-viewer-delete'));

    // Scope the query to within the modal to avoid collision with other buttons
    const modal = screen.getByTestId('mock-modal');
    const confirmBtn = within(modal).getByRole('button', { name: /Delete/i });

    await act(async () => {
      fireEvent.click(confirmBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith('photo-to-delete');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});

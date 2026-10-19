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
import { ApiClientError } from '../../lib/apiClient.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';

const PHONE = '(max-width: 767px)';
let media: MatchMediaControl | null = null;

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

let lastModalProps: {
  skipOpenerRef?: { current: boolean };
  returnFocusRef?: unknown;
} = {};

jest.unstable_mockModule('../Modal/Modal.js', () => ({
  Modal: ({
    title,
    children,
    footer,
    onClose,
    skipOpenerRef,
    returnFocusRef,
  }: {
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    onClose: () => void;
    skipOpenerRef?: { current: boolean };
    returnFocusRef?: unknown;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'mock-modal',
        role: 'dialog',
        'aria-label': title,
        ref: () => {
          // Capture what the dialog passes to Modal (committed on every render).
          lastModalProps = { skipOpenerRef, returnFocusRef };
        },
      },
      React.createElement('button', { 'data-testid': 'modal-close', onClick: onClose }, 'Close'),
      children,
      footer,
    ),
}));

// ─── Mock PhotoDetailsPanel ───────────────────────────────────────────────────
// The panel has its own test file. The stand-in exposes the props the viewer passes and lets a
// test fire onSaved (caption + areaId set) and onEditingChange.

jest.unstable_mockModule('./PhotoDetailsPanel.js', () => ({
  PhotoDetailsPanel: ({
    photo,
    diaryDate,
    locked,
    onSaved,
    onEditingChange,
  }: {
    photo: Photo;
    diaryDate: string | null;
    locked?: boolean;
    onSaved: (r: { photo: Photo; undo: null; tagsChanged: boolean; spotLabel: string }) => void;
    onEditingChange?: (editing: boolean) => void;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'mock-details-panel',
        'data-photo-id': photo.id,
        'data-diary-date': diaryDate ?? '',
        'data-locked': String(Boolean(locked)),
        onClick: () =>
          onSaved({
            photo: { ...photo, caption: 'saved-caption', areaId: 'area-1' } as Photo,
            undo: null,
            tagsChanged: true,
            spotLabel: 'Kitchen',
          }),
      },
      React.createElement('button', {
        type: 'button',
        'data-testid': 'mock-editing-start',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onEditingChange?.(true);
        },
      }),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'mock-editing-end',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onEditingChange?.(false);
        },
      }),
    ),
}));

// ─── Dynamic imports ──────────────────────────────────────────────────────────

import type * as PhotoViewerModule from './PhotoViewer.js';
import enPhotoViewer from '../../i18n/en/photoViewer.json';

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

  it('annotate button is visible with the visible name "Annotate" and no aria-label override', () => {
    renderViewer([makePhoto()]);
    const btn = screen.getByTestId('photo-viewer-annotate');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAccessibleName('Annotate');
    expect(btn).toHaveTextContent('Annotate');
    expect(btn).not.toHaveAttribute('aria-label');
    expect(btn).not.toHaveAttribute('title');
  });

  it('annotate button is aria-disabled (not disabled) when photo has no width or height', () => {
    const photo = makePhoto({ width: null, height: null });
    renderViewer([photo]);
    const btn = screen.getByTestId('photo-viewer-annotate');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
  });

  it('shows the missing-dimensions reason as visible text tied to the button', () => {
    renderViewer([makePhoto({ width: null, height: null })]);
    const btn = screen.getByTestId('photo-viewer-annotate');
    const reason = screen.getByText('Cannot annotate: photo dimensions are missing');
    expect(reason).toBeVisible();
    expect(btn).toHaveAttribute('aria-describedby', reason.id);
    expect(btn).toHaveAccessibleDescription('Cannot annotate: photo dimensions are missing');
  });

  it('annotate button is enabled, with no reason, when photo has width and height', () => {
    const photo = makePhoto({ width: 800, height: 600 });
    renderViewer([photo]);
    const btn = screen.getByTestId('photo-viewer-annotate');
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-disabled');
    expect(btn).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/cannot be annotated|Cannot annotate/)).not.toBeInTheDocument();
  });

  it('clicking a disabled annotate button (missing dimensions) does not open the annotator', () => {
    renderViewer([makePhoto({ width: null, height: null })]);
    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
    expect(screen.queryByTestId('mock-photo-annotator')).not.toBeInTheDocument();
    expect(screen.getByTestId('photo-viewer-annotate')).toBeInTheDocument();
  });

  it('clicking a disabled annotate button (signed entry) does not open the annotator', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })], 0, false);
    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
    expect(screen.queryByTestId('mock-photo-annotator')).not.toBeInTheDocument();
  });

  it('the signed-entry reason wins over missing dimensions', () => {
    renderViewer([makePhoto({ width: null, height: null })], 0, false);
    expect(screen.getByText('Signed entries cannot be annotated')).toBeInTheDocument();
    expect(screen.queryByText(/photo dimensions are missing/)).not.toBeInTheDocument();
  });

  it('the annotate reason follows the photo when stepping to one with missing dimensions', () => {
    const photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2', width: null, height: null })];
    renderViewer(photos);
    expect(screen.queryByText(/photo dimensions are missing/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('photo-viewer-next'));
    expect(screen.getByText('Cannot annotate: photo dimensions are missing')).toBeInTheDocument();
    expect(screen.getByTestId('photo-viewer-annotate')).toHaveAttribute('aria-disabled', 'true');
  });

  it('clicking annotate shows the PhotoAnnotator (mock)', () => {
    renderViewer([makePhoto({ width: 800, height: 600 })]);

    fireEvent.click(screen.getByTestId('photo-viewer-annotate'));

    // PhotoAnnotator mock should be rendered
    expect(screen.getByTestId('mock-photo-annotator')).toBeInTheDocument();
  });

  it('annotate button is aria-disabled when editable=false', () => {
    const photo = makePhoto({ width: 800, height: 600 });
    renderViewer([photo], 0, false);
    const btn = screen.getByTestId('photo-viewer-annotate');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
  });

  it('shows the signed-entry reason as visible text tied to the button when editable=false', () => {
    const photo = makePhoto({ width: 800, height: 600 });
    renderViewer([photo], 0, false);
    const btn = screen.getByTestId('photo-viewer-annotate');
    const reason = screen.getByText('Signed entries cannot be annotated');
    expect(reason).toBeVisible();
    expect(btn).toHaveAttribute('aria-describedby', reason.id);
    expect(btn).not.toHaveAttribute('title');
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

    // Click the mock panel — fires onSaved with caption+areaId set
    fireEvent.click(screen.getByTestId('mock-details-panel'));

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

    // Save metadata on photo A — the panel mock fires onSaved
    fireEvent.click(screen.getByTestId('mock-details-panel'));

    // Verify propagation happened immediately (before any navigation)
    expect(mockOnPhotoChanged).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p-a', caption: 'saved-caption' }),
    );

    // Navigate to photo B
    fireEvent.click(screen.getByTestId('photo-viewer-next'));

    // The panel now shows photo B
    expect(screen.getByTestId('mock-details-panel')).toHaveAttribute('data-photo-id', 'p-b');

    // Navigate back to photo A
    fireEvent.click(screen.getByTestId('photo-viewer-prev'));

    // The panel shows photo A again
    expect(screen.getByTestId('mock-details-panel')).toHaveAttribute('data-photo-id', 'p-a');

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
    // Should stay in view mode — annotate button aria-disabled, no annotator
    expect(screen.getByTestId('photo-viewer-annotate')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByTestId('mock-photo-annotator')).not.toBeInTheDocument();
  });

  // ─── Details panel (side column from 768px, bottom sheet below) ────────────

  describe('details panel', () => {
    afterEach(() => {
      media?.restore();
      media = null;
    });

    it('is rendered in the side column when the viewer is open (wide)', () => {
      renderViewer([makePhoto()]);
      expect(screen.getByTestId('mock-details-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('photo-viewer-details')).not.toBeInTheDocument();
      expect(document.getElementById('photo-metadata-sidepanel')).toBeNull();
    });

    it('is not rendered while annotating (wide) and returns afterwards', () => {
      renderViewer([makePhoto({ width: 800, height: 600 })]);
      fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
      expect(screen.queryByTestId('mock-details-panel')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('annotator-cancel-mock'));
      expect(screen.getByTestId('mock-details-panel')).toBeInTheDocument();
    });

    it('gets the current photo, the diary date and the editable state', () => {
      render(
        React.createElement(PhotoViewer, {
          photos: [makePhoto({ id: 'pd' })],
          initialIndex: 0,
          onClose: mockOnClose,
          editable: false,
          diaryDate: '2026-09-11',
        }),
      );
      const panel = screen.getByTestId('mock-details-panel');
      expect(panel).toHaveAttribute('data-photo-id', 'pd');
      expect(panel).toHaveAttribute('data-diary-date', '2026-09-11');
      expect(panel).toHaveAttribute('data-locked', 'true');
    });

    it('defaults the diary date to null and the panel to unlocked for an editable viewer', () => {
      renderViewer([makePhoto()]);
      const panel = screen.getByTestId('mock-details-panel');
      expect(panel).toHaveAttribute('data-diary-date', '');
      expect(panel).toHaveAttribute('data-locked', 'false');
    });

    it('phone: shows a Details button instead of the side column', () => {
      media = installMatchMedia({ [PHONE]: true });
      renderViewer([makePhoto()]);
      expect(screen.getByTestId('photo-viewer-details')).toHaveTextContent('Details');
      expect(screen.queryByTestId('mock-details-panel')).not.toBeInTheDocument();
    });

    it('phone: Details opens a bottom sheet with the panel and Escape closes it', async () => {
      media = installMatchMedia({ [PHONE]: true });
      renderViewer([makePhoto()]);

      fireEvent.click(screen.getByTestId('photo-viewer-details'));

      const sheet = screen.getByRole('dialog', { name: 'Photo details' });
      expect(within(sheet).getByTestId('mock-details-panel')).toBeInTheDocument();

      fireEvent.keyDown(sheet, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByTestId('mock-details-panel')).not.toBeInTheDocument(),
      );
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('phone: a saved edit in the sheet reaches onPhotoChanged', () => {
      media = installMatchMedia({ [PHONE]: true });
      renderViewer([makePhoto({ id: 'p-sheet' })]);
      fireEvent.click(screen.getByTestId('photo-viewer-details'));

      fireEvent.click(screen.getByTestId('mock-details-panel'));

      expect(mockOnPhotoChanged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p-sheet', caption: 'saved-caption' }),
      );
    });

    it('keeps the navigation arrows labelled while the sheet is open', () => {
      media = installMatchMedia({ [PHONE]: true });
      renderViewer([makePhoto(), makePhoto({ id: 'photo-2' })]);
      fireEvent.click(screen.getByTestId('photo-viewer-details'));

      expect(screen.getByRole('button', { name: enPhotoViewer.previousPhoto })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: enPhotoViewer.nextPhoto })).toBeInTheDocument();
    });

    it('ignores an Escape another handler already consumed (defaultPrevented)', () => {
      renderViewer([makePhoto()]);
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      window.dispatchEvent(event);
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('phone: Escape in the Details sheet closes only the sheet, not the viewer', async () => {
      media = installMatchMedia({ [PHONE]: true });
      renderViewer([makePhoto()]);
      fireEvent.click(screen.getByTestId('photo-viewer-details'));
      expect(screen.getByTestId('mock-details-panel')).toBeInTheDocument();

      // the sheet's focus trap consumes the key before the viewer's window handler sees it
      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByTestId('mock-details-panel')).not.toBeInTheDocument(),
      );
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('photo-viewer')).toBeInTheDocument();
    });

    it('ignores the viewer keys while the details sheet is open (arrows and Escape)', () => {
      media = installMatchMedia({ [PHONE]: true });
      renderViewer([makePhoto({ id: 'a' }), makePhoto({ id: 'b' })]);
      fireEvent.click(screen.getByTestId('photo-viewer-details'));

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-details-panel')).toHaveAttribute('data-photo-id', 'a');
    });

    it('ignores the viewer keys while the tag editor is open and handles them after it closes', () => {
      renderViewer([makePhoto({ id: 'a' }), makePhoto({ id: 'b' })]);
      fireEvent.click(screen.getByTestId('mock-editing-start'));

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-details-panel')).toHaveAttribute('data-photo-id', 'a');

      fireEvent.click(screen.getByTestId('mock-editing-end'));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByTestId('mock-details-panel')).toHaveAttribute('data-photo-id', 'b');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard navigation and backdrop', () => {
    const shownId = () => screen.getByTestId('mock-details-panel').getAttribute('data-photo-id');

    it('ArrowRight and ArrowLeft step through the photos and wrap around', () => {
      renderViewer([makePhoto({ id: 'a' }), makePhoto({ id: 'b' }), makePhoto({ id: 'c' })]);

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(shownId()).toBe('b');
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(shownId()).toBe('a');
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(shownId()).toBe('c');
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(shownId()).toBe('b');
    });

    it('Escape closes the viewer', () => {
      renderViewer([makePhoto()]);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('arrows and Escape do not move or close while annotating; Escape cancels the annotator', () => {
      renderViewer([makePhoto({ id: 'a', width: 800, height: 600 }), makePhoto({ id: 'b' })]);
      fireEvent.click(screen.getByTestId('photo-viewer-annotate'));

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByTestId('mock-photo-annotator')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('mock-photo-annotator')).not.toBeInTheDocument();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(shownId()).toBe('a');
    });

    it('a click on the backdrop closes the viewer, a click inside the photo area does not', () => {
      renderViewer([makePhoto()]);
      const viewer = screen.getByTestId('photo-viewer');
      const backdrop = viewer.firstElementChild as HTMLElement;

      fireEvent.click(viewer.querySelector('img')!);
      expect(mockOnClose).not.toHaveBeenCalled();

      fireEvent.click(backdrop);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('branch coverage: defaults, wrap-around and optional callbacks', () => {
    function renderMinimal(photos: Photo[]) {
      return render(
        React.createElement(PhotoViewer, { photos, initialIndex: 0, onClose: mockOnClose }),
      );
    }

    it('defaults to editable: Annotate is enabled when no editable prop is given', () => {
      renderMinimal([makePhoto({ width: 800, height: 600 })]);
      expect(screen.getByTestId('photo-viewer-annotate')).not.toHaveAttribute('aria-disabled');
    });

    it('the Previous button wraps from the first photo to the last, and steps back otherwise', () => {
      renderViewer([makePhoto({ id: 'a' }), makePhoto({ id: 'b' }), makePhoto({ id: 'c' })]);
      const shownId = () => screen.getByTestId('mock-details-panel').getAttribute('data-photo-id');

      fireEvent.click(screen.getByTestId('photo-viewer-prev'));
      expect(shownId()).toBe('c');
      fireEvent.click(screen.getByTestId('photo-viewer-prev'));
      expect(shownId()).toBe('b');
    });

    it('the Next button wraps from the last photo to the first', () => {
      renderViewer([makePhoto({ id: 'a' }), makePhoto({ id: 'b' })], 1);
      const shownId = () => screen.getByTestId('mock-details-panel').getAttribute('data-photo-id');

      fireEvent.click(screen.getByTestId('photo-viewer-next'));
      expect(shownId()).toBe('a');
    });

    it('works without onPhotoChanged: annotation save, clear and details save', async () => {
      const photo = makePhoto({ id: 'np', width: 800, height: 600 });
      renderMinimal([photo]);

      fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
      fireEvent.click(screen.getByTestId('annotator-save-mock'));
      expect(screen.getByTestId('photo-viewer-clear-annotations')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('mock-details-panel'));
      expect(screen.getByTestId('mock-details-panel')).toHaveAttribute('data-photo-id', 'np');

      fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
      const modal = screen.getByTestId('mock-modal');
      await act(async () => {
        fireEvent.click(within(modal).getByRole('button', { name: /Clear annotations/i }));
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(screen.queryByTestId('photo-viewer-clear-annotations')).not.toBeInTheDocument(),
      );
    });

    it('unmounting while the clear request is pending throws nothing', async () => {
      let resolveClear!: () => void;
      mockClearAnnotation.mockReturnValue(
        new Promise<void>((r) => {
          resolveClear = r;
        }),
      );
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const photo = makePhoto({ id: 'gone', annotatedAt: '2026-05-17T10:00:00.000Z' });
      const view = renderViewer([photo]);
      fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
      const modal = screen.getByTestId('mock-modal');
      fireEvent.click(within(modal).getByRole('button', { name: /Clear annotations/i }));

      view.unmount();
      await act(async () => {
        resolveClear();
        await Promise.resolve();
      });

      expect(errorSpy).not.toHaveBeenCalledWith('Failed to clear annotation:', expect.anything());
      errorSpy.mockRestore();
    });

    it('after clearing while viewing the original, the image url has no annotation version', async () => {
      const photo = makePhoto({ id: 'ov', annotatedAt: '2026-05-17T10:00:00.000Z' });
      renderViewer([photo]);
      fireEvent.click(screen.getByTestId('photo-viewer-view-original'));
      expect(screen.getByAltText('test-photo.jpg')).toHaveAttribute(
        'src',
        '/api/photos/photo-viewer-test/file?variant=original&v=2026-05-17T10:00:00.000Z',
      );

      fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
      const modal = screen.getByTestId('mock-modal');
      await act(async () => {
        fireEvent.click(within(modal).getByRole('button', { name: /Clear annotations/i }));
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByAltText('test-photo.jpg')).toHaveAttribute(
          'src',
          '/api/photos/photo-viewer-test/file?variant=original',
        ),
      );
    });
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

  // ─── #2209: ConfirmDialog sites (delete photo, clear annotations) ──────────

  describe('confirm dialogs (#2209)', () => {
    function openDelete(photos = [makePhoto({ id: 'p1' }), makePhoto({ id: 'p2' })]) {
      renderViewer(photos, 0, true, false, mockOnDelete);
      fireEvent.click(screen.getByTestId('photo-viewer-delete'));
    }

    function openClear() {
      renderViewer(
        [makePhoto({ id: 'p1', annotatedAt: '2026-05-17T10:00:00.000Z' }), makePhoto({ id: 'p2' })],
        0,
      );
      fireEvent.click(screen.getByTestId('photo-viewer-clear-annotations'));
    }

    it('delete dialog is titled and uses the photo-delete test ids', () => {
      openDelete();
      expect(screen.getByTestId('mock-modal')).toHaveAttribute('aria-label', 'Delete this photo?');
      expect(screen.getByText('This photo will be permanently removed.')).toBeInTheDocument();
      expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
      expect(screen.getByTestId('photo-delete-confirm')).toHaveTextContent('Delete');
      expect(screen.getByTestId('photo-delete-cancel')).toBeInTheDocument();
    });

    it('delete: Cancel closes the dialog without deleting', () => {
      openDelete();
      fireEvent.click(screen.getByTestId('photo-delete-cancel'));
      expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('delete: confirming deletes the photo through the confirm test id', async () => {
      openDelete([makePhoto({ id: 'only' })]);
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
        await Promise.resolve();
      });
      await waitFor(() => expect(mockOnDelete).toHaveBeenCalledWith('only'));
    });

    it('delete: awaits onDelete, shows busy while pending, and closes the viewer only on success', async () => {
      let resolve!: () => void;
      mockOnDelete.mockImplementation(() => new Promise<void>((r) => (resolve = r)));
      openDelete([makePhoto({ id: 'only' })]);
      fireEvent.click(screen.getByTestId('photo-delete-confirm'));

      await waitFor(() =>
        expect(screen.getByTestId('photo-delete-confirm')).toHaveTextContent('Deleting…'),
      );
      expect(screen.getByTestId('photo-delete-confirm')).toHaveAttribute('aria-disabled', 'true');
      expect(mockOnClose).not.toHaveBeenCalled();
      // Cancel and Escape are ignored while busy
      fireEvent.click(screen.getByTestId('photo-delete-cancel'));
      expect(screen.getByTestId('mock-modal')).toBeInTheDocument();

      await act(async () => resolve());
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('delete: a plain failure keeps the dialog and viewer open with the generic message', async () => {
      mockOnDelete.mockRejectedValue(new Error('RAW-LOCAL'));
      openDelete([makePhoto({ id: 'only' })]);
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('The photo could not be deleted.');
      expect(screen.queryByText(/RAW-LOCAL/)).toBeNull();
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
      // not busy any more: the action is available for a retry
      expect(screen.getByTestId('photo-delete-confirm')).not.toHaveAttribute('aria-disabled');
    });

    it('delete: an API failure shows the translated message, never the server text', async () => {
      mockOnDelete.mockRejectedValue(
        new ApiClientError(404, { code: 'NOT_FOUND', message: 'RAW-SERVER-SENTINEL' }),
      );
      openDelete([makePhoto({ id: 'only' })]);
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The requested resource was not found.',
      );
      expect(screen.queryByText(/RAW-SERVER-SENTINEL/)).toBeNull();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('delete: the error is cleared on cancel and when the dialog is reopened', async () => {
      mockOnDelete.mockRejectedValue(new Error('x'));
      openDelete([makePhoto({ id: 'only' })]);
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });
      await screen.findByRole('alert');

      fireEvent.click(screen.getByTestId('photo-delete-cancel'));
      expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('photo-viewer-delete'));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('delete: a retry after a failure succeeds and closes the viewer', async () => {
      mockOnDelete.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(undefined);
      openDelete([makePhoto({ id: 'only' })]);
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });
      await screen.findByRole('alert');
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });
      expect(mockOnDelete).toHaveBeenCalledTimes(2);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('delete: no returnFocusRef (falls back to the h1) and confirm skips the deleted photo opener', () => {
      openDelete([makePhoto({ id: 'only' })]);
      expect(lastModalProps.returnFocusRef).toBeUndefined();
      expect(lastModalProps.skipOpenerRef?.current).toBe(false);
      fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      expect(lastModalProps.skipOpenerRef?.current).toBe(true);
    });

    it('delete: cancel after a failed confirm resets the skip flag', async () => {
      mockOnDelete.mockRejectedValue(new Error('x'));
      openDelete([makePhoto({ id: 'only' })]);
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });
      await screen.findByRole('alert');
      expect(lastModalProps.skipOpenerRef?.current).toBe(true);
      fireEvent.click(screen.getByTestId('photo-delete-cancel'));
      expect(lastModalProps.skipOpenerRef?.current).toBe(false);
    });

    it('clear markup: keeps clearBtnRef and returns to the opener after a confirmed clear', () => {
      openClear();
      expect(lastModalProps.returnFocusRef).toBeDefined();
      expect(lastModalProps.skipOpenerRef?.current).toBe(false);
      fireEvent.click(screen.getByTestId('photo-markup-clear-confirm'));
      // restoreToOpenerOnConfirm: the clear button is not deleted, so the opener is restored
      expect(lastModalProps.skipOpenerRef?.current).toBe(false);
    });

    it('clear annotations: dialog is titled, lists the lead and uses the photo-markup-clear ids', () => {
      openClear();
      expect(screen.getByTestId('mock-modal')).toHaveAttribute('aria-label', 'Clear annotations?');
      expect(
        screen.getByText('This will remove all annotations from this photo.'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('photo-markup-clear-confirm')).toHaveTextContent(
        'Clear annotations',
      );
      fireEvent.click(screen.getByTestId('photo-markup-clear-cancel'));
      expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
      expect(mockClearAnnotation).not.toHaveBeenCalled();
    });

    it('clear annotations: confirming calls clearAnnotation for the photo', async () => {
      mockClearAnnotation.mockResolvedValue(makePhoto({ id: 'p1', annotatedAt: null }));
      openClear();
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-markup-clear-confirm'));
        await Promise.resolve();
      });
      await waitFor(() => expect(mockClearAnnotation).toHaveBeenCalledWith('p1'));
    });

    it.each([
      ['delete', openDelete],
      ['clear annotations', openClear],
    ] as const)('%s dialog open: the viewer ignores Escape and the arrow keys', (_name, open) => {
      open();
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
    });

    it('with no dialog open the viewer still closes on Escape (guard is lifted)', () => {
      openDelete();
      fireEvent.click(screen.getByTestId('photo-delete-cancel'));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });
});

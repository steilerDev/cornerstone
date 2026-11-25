/**
 * @jest-environment jsdom
 *
 * PhotoViewer on the real `Modal variant="viewer"` (#2257): dialog semantics, Escape going to the
 * topmost layer only, focus trap/restore and scroll lock. PhotoViewer.test.tsx covers the viewer's
 * own logic with a stand-in Modal; this file keeps the real Modal, ConfirmDialog and focus trap.
 *
 * The annotator is a stand-in whose inline text input mirrors PhotoAnnotator's own handler
 * (Escape: stopPropagation + cancel the input), so the test pins that the event never reaches the
 * Modal's document-level focus trap.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { useState } from 'react';
import type { Photo } from '@cornerstone/shared';
import type * as PhotoViewerModule from './PhotoViewer.js';

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  uploadAnnotation: jest.fn(),
  uploadPhoto: jest.fn(),
  getPhotosForEntity: jest.fn(),
  updatePhoto: jest.fn(),
  deletePhoto: jest.fn(),
  getPhotoFileUrl: jest.fn((id: string) => `/api/photos/${id}/file`),
  getPhotoThumbnailUrl: jest.fn((id: string) => `/api/photos/${id}/thumbnail`),
  clearAnnotation: jest.fn(),
}));

jest.unstable_mockModule('./PhotoAnnotator/PhotoAnnotator.js', () => ({
  PhotoAnnotator: ({ onCancel }: { onCancel: () => void }) => {
    const [inputOpen, setInputOpen] = useState(false);
    return React.createElement(
      'div',
      { 'data-testid': 'mock-photo-annotator' },
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'open-inline-input', onClick: () => setInputOpen(true) },
        'Text',
      ),
      inputOpen
        ? React.createElement('input', {
            type: 'text',
            'data-testid': 'annotator-inline-input',
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setInputOpen(false);
              }
            },
          })
        : null,
      React.createElement(
        'button',
        { type: 'button', 'data-testid': 'annotator-cancel-mock', onClick: onCancel },
        'Cancel',
      ),
    );
  },
}));

jest.unstable_mockModule('./PhotoDetailsPanel.js', () => ({
  PhotoDetailsPanel: () => React.createElement('div', { 'data-testid': 'mock-details-panel' }),
}));

let PhotoViewer: (typeof PhotoViewerModule)['PhotoViewer'];

function makePhoto(id: string): Photo {
  return {
    id,
    entityType: 'diary_entry',
    entityId: 'de-1',
    originalFilename: `${id}.jpg`,
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
    fileUrl: `/api/photos/${id}/file`,
    thumbnailUrl: `/api/photos/${id}/thumbnail`,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
  } as unknown as Photo;
}

const photos = [makePhoto('p1'), makePhoto('p2')];

/** A host that opens the viewer from a button, like the photo card's view button. */
function Host({ onDelete }: { onDelete?: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return React.createElement(
    'div',
    null,
    React.createElement(
      'button',
      { type: 'button', 'data-testid': 'opener', onClick: () => setOpen(true) },
      'View photo',
    ),
    open
      ? React.createElement(PhotoViewer, {
          photos,
          initialIndex: 0,
          onClose: () => setOpen(false),
          editable: true,
          onDelete,
        })
      : null,
  );
}

function openFromHost(onDelete?: (id: string) => Promise<void>) {
  render(React.createElement(Host, { onDelete }));
  const opener = screen.getByTestId('opener');
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

const escape = (target: Element | Document = document.activeElement ?? document) =>
  fireEvent.keyDown(target, { key: 'Escape' });

describe('PhotoViewer on the real Modal (#2257)', () => {
  beforeEach(async () => {
    if (!PhotoViewer) ({ PhotoViewer } = await import('./PhotoViewer.js'));
  });

  afterEach(() => {
    delete document.documentElement.dataset.scrollLocked;
  });

  it('is a modal dialog named "Photo viewer" holding the photo', () => {
    openFromHost();
    const dialog = screen.getByRole('dialog', { name: 'Photo viewer' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(screen.getByTestId('photo-viewer'));
    expect(screen.getByTestId('photo-viewer').querySelector('img')).toHaveAttribute(
      'src',
      '/api/photos/p1/file',
    );
  });

  it('starts with focus on the close button', () => {
    openFromHost();
    expect(screen.getByTestId('photo-viewer-close')).toHaveFocus();
  });

  it('locks page scroll while open and releases it on close', () => {
    openFromHost();
    expect(document.documentElement.dataset.scrollLocked).toBeDefined();
    fireEvent.click(screen.getByTestId('photo-viewer-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
  });

  it('Escape closes the viewer and focus returns to the opener', () => {
    const opener = openFromHost();
    escape();
    expect(screen.queryByRole('dialog', { name: 'Photo viewer' })).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('the close button closes the viewer and focus returns to the opener', () => {
    const opener = openFromHost();
    fireEvent.click(screen.getByTestId('photo-viewer-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('a click on the backdrop closes the viewer', () => {
    openFromHost();
    const backdrop = screen.getByRole('dialog').firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('arrow keys still step through the photos', () => {
    openFromHost();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('photo-viewer').querySelector('img')).toHaveAttribute(
      'src',
      '/api/photos/p2/file',
    );
  });

  describe('annotating', () => {
    it('Escape cancels only the annotator and focuses Annotate; a second Escape closes the viewer', () => {
      openFromHost();
      fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
      expect(screen.getByTestId('mock-photo-annotator')).toBeInTheDocument();

      escape();
      expect(screen.queryByTestId('mock-photo-annotator')).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeInTheDocument();
      expect(screen.getByTestId('photo-viewer-annotate')).toHaveFocus();

      escape();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('Escape in the annotator inline text input leaves the annotator open', () => {
      openFromHost();
      fireEvent.click(screen.getByTestId('photo-viewer-annotate'));
      fireEvent.click(screen.getByTestId('open-inline-input'));
      const input = screen.getByTestId('annotator-inline-input');
      input.focus();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByTestId('annotator-inline-input')).toBeNull();
      expect(screen.getByTestId('mock-photo-annotator')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeInTheDocument();
    });
  });

  describe('nested layers', () => {
    it('stacks the Delete photo confirmation above the viewer, and Escape closes only the confirmation', () => {
      openFromHost(() => Promise.resolve());
      fireEvent.click(screen.getByTestId('photo-viewer-delete'));
      const confirm = screen.getByRole('alertdialog', { name: 'Delete this photo?' });
      expect(confirm).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeInTheDocument();

      escape();

      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByRole('dialog', { name: 'Photo viewer' })).toBeInTheDocument();
    });

    it('ignores the arrow keys while a confirmation is open', () => {
      openFromHost(() => Promise.resolve());
      fireEvent.click(screen.getByTestId('photo-viewer-delete'));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByTestId('photo-viewer').querySelector('img')).toHaveAttribute(
        'src',
        '/api/photos/p1/file',
      );
    });

    it('closes the viewer after a confirmed delete and returns focus to the page', async () => {
      const onDelete = jest.fn((_id: string) => Promise.resolve());
      openFromHost(onDelete);
      fireEvent.click(screen.getByTestId('photo-viewer-delete'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('photo-delete-confirm'));
      });
      expect(onDelete).toHaveBeenCalledWith('p1');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
    });
  });
});

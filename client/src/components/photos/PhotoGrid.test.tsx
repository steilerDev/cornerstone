/**
 * Unit tests for PhotoGrid: cards, loading skeletons, empty state, click and edit wiring, and the
 * #2257 AC4 guarantee that the grid offers no delete (button or Delete key).
 */

import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Photo } from '@cornerstone/shared';
import { PhotoGrid } from './PhotoGrid.js';

function makePhoto(id: string, caption: string | null): Photo {
  return {
    id,
    entityType: 'diary_entry',
    entityId: 'diary-1',
    caption,
    originalFilename: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 50000,
    fileUrl: `/api/photos/${id}/file`,
    thumbnailUrl: `/api/photos/${id}/thumbnail`,
    width: 1024,
    height: 768,
    takenAt: null,
    areaId: null,
    orientationId: null,
    orientation: null,
    sortOrder: 0,
    createdBy: null,
    annotatedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const photos = [makePhoto('p1', 'Sample Wall'), makePhoto('p2', null)];

describe('PhotoGrid', () => {
  it('renders one card per photo in a labelled list', () => {
    render(<PhotoGrid photos={photos} onPhotoClick={jest.fn()} />);
    expect(screen.getByRole('list', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('photo-card-p1')).toBeInTheDocument();
    expect(screen.getByTestId('photo-card-p2')).toBeInTheDocument();
  });

  it('renders six skeleton placeholders while loading, ignoring the photos', () => {
    render(<PhotoGrid photos={photos} onPhotoClick={jest.fn()} loading />);
    expect(screen.getByRole('list', { name: 'Loading photos' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByTestId('photo-card-p1')).toBeNull();
  });

  it('renders nothing when there are no photos', () => {
    const { container } = render(<PhotoGrid photos={[]} onPhotoClick={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports the clicked photo', () => {
    const onPhotoClick = jest.fn();
    render(<PhotoGrid photos={photos} onPhotoClick={onPhotoClick} />);
    fireEvent.click(screen.getByRole('button', { name: /View photo: Sample Wall/ }));
    expect(onPhotoClick).toHaveBeenCalledWith(photos[0]);
  });

  it('wires the annotate button to onEdit for that photo', () => {
    const onEdit = jest.fn();
    render(<PhotoGrid photos={photos} onPhotoClick={jest.fn()} onEdit={onEdit} />);
    fireEvent.mouseEnter(screen.getByTestId('photo-card-p2'));
    fireEvent.click(screen.getByRole('button', { name: /Annotate photo: p2\.jpg/ }));
    expect(onEdit).toHaveBeenCalledWith(photos[1]);
  });

  it('offers no annotate button when onEdit is missing or editable is false', () => {
    const { rerender } = render(<PhotoGrid photos={photos} onPhotoClick={jest.fn()} />);
    fireEvent.mouseEnter(screen.getByTestId('photo-card-p1'));
    expect(screen.queryByRole('button', { name: /Annotate photo/ })).toBeNull();
    rerender(
      <PhotoGrid photos={photos} onPhotoClick={jest.fn()} onEdit={jest.fn()} editable={false} />,
    );
    fireEvent.mouseEnter(screen.getByTestId('photo-card-p1'));
    expect(screen.queryByRole('button', { name: /Annotate photo/ })).toBeNull();
  });

  it('has no delete button and the Delete key changes nothing', () => {
    const onPhotoClick = jest.fn();
    render(<PhotoGrid photos={photos} onPhotoClick={onPhotoClick} onEdit={jest.fn()} />);
    const card = screen.getByTestId('photo-card-p1');
    fireEvent.mouseEnter(card);
    fireEvent.keyDown(card, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    expect(onPhotoClick).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

/**
 * Unit tests for PhotoCard component.
 *
 * Tests:
 *   - Edit button renders when onEdit is provided and editable=true
 *   - Edit button does NOT render when editable=false (even if onEdit is provided)
 *   - Clicking Edit button calls onEdit
 *   - Image renders with caption and originalFilename
 *   - The view label is translated and names the photo
 *   - Keyboard navigation: Enter/Space clicks the card; the Delete key does nothing (#2257 AC4)
 */

import { jest, describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Photo } from '@cornerstone/shared';
import { PhotoCard } from './PhotoCard.js';

// Mock i18next
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => {
      const translations: Record<string, string> = {
        annotate: 'Annotate photo',
        viewPhoto: `View photo: ${options?.name ?? ''}`,
      };
      return translations[key] || key;
    },
  }),
}));

const mockPhoto: Photo = {
  id: 'photo-1',
  entityType: 'diary_entry',
  entityId: 'diary-1',
  caption: 'Test Caption',
  originalFilename: 'test.jpg',
  mimeType: 'image/jpeg',
  fileSize: 50000,
  fileUrl: '/api/photos/photo-1/file',
  thumbnailUrl: '/api/photos/photo-1/thumbnail',
  width: 1024,
  height: 768,
  takenAt: null,
  areaId: null,
  orientationId: null,
  orientation: null,
  sortOrder: 0,
  createdBy: null,
  annotatedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('PhotoCard', () => {
  it('renders the image with caption', () => {
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} />);
    const img = screen.getByAltText('Test Caption');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/api/photos/photo-1/thumbnail');
  });

  it('renders the caption overlay', () => {
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} />);
    expect(screen.getByText('Test Caption')).toBeInTheDocument();
  });

  it('renders the click area button', () => {
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} />);
    const clickButton = screen.getByRole('button', { name: /View photo/ });
    expect(clickButton).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const mockClick = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={mockClick} />);
    const clickButton = screen.getByRole('button', { name: /View photo/ });
    fireEvent.click(clickButton);
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('renders Edit button when onEdit is provided and editable=true', () => {
    const mockEdit = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={mockEdit} editable={true} />);
    // Hover to show action buttons
    const card = screen.getByRole('listitem');
    fireEvent.mouseEnter(card);

    const editButton = screen.getByRole('button', { name: /Annotate photo/ });
    expect(editButton).toBeInTheDocument();
  });

  it('does NOT render Edit button when editable=false (even if onEdit is provided)', () => {
    const mockEdit = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={mockEdit} editable={false} />);
    // Hover to show action buttons
    const card = screen.getByRole('listitem');
    fireEvent.mouseEnter(card);

    const editButton = screen.queryByRole('button', { name: /Annotate photo/ });
    expect(editButton).not.toBeInTheDocument();
  });

  it('calls onEdit when Edit button is clicked', () => {
    const mockEdit = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={mockEdit} editable={true} />);
    // Hover to show action buttons
    const card = screen.getByRole('listitem');
    fireEvent.mouseEnter(card);

    const editButton = screen.getByRole('button', { name: /Annotate photo/ });
    fireEvent.click(editButton);
    expect(mockEdit).toHaveBeenCalledTimes(1);
  });

  it('names the click area after the caption, falling back to the filename', () => {
    const { rerender } = render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'View photo: Test Caption' })).toBeInTheDocument();
    rerender(<PhotoCard photo={{ ...mockPhoto, caption: null }} onClick={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'View photo: test.jpg' })).toBeInTheDocument();
  });

  it('renders no delete button, even while hovered', () => {
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={jest.fn()} />);
    fireEvent.mouseEnter(screen.getByRole('listitem'));
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('calls onClick when Enter key is pressed', () => {
    const mockClick = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={mockClick} />);
    const card = screen.getByRole('listitem');
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', () => {
    const mockClick = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={mockClick} />);
    const card = screen.getByRole('listitem');
    fireEvent.keyDown(card, { key: ' ' });
    expect(mockClick).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the Delete or Backspace key is pressed', () => {
    const mockClick = jest.fn();
    const mockEdit = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={mockClick} onEdit={mockEdit} />);
    const card = screen.getByRole('listitem');
    fireEvent.keyDown(card, { key: 'Delete' });
    fireEvent.keyDown(card, { key: 'Backspace' });
    expect(mockClick).not.toHaveBeenCalled();
    expect(mockEdit).not.toHaveBeenCalled();
  });

  it('hides action buttons on blur', () => {
    const mockEdit = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={mockEdit} editable={true} />);
    const card = screen.getByRole('listitem');

    // Hover to show buttons
    fireEvent.mouseEnter(card);
    const editButtonShown = screen.getByRole('button', { name: /Annotate photo/ });
    expect(editButtonShown).toBeInTheDocument();

    // Leave hover to hide buttons
    fireEvent.mouseLeave(card);
    const editButtonHidden = screen.queryByRole('button', { name: /Annotate photo/ });
    expect(editButtonHidden).not.toBeInTheDocument();
  });

  it('defaults editable to true when not provided', () => {
    const mockEdit = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={mockEdit} />);
    // Hover to show action buttons
    const card = screen.getByRole('listitem');
    fireEvent.mouseEnter(card);

    const editButton = screen.getByRole('button', { name: /Annotate photo/ });
    expect(editButton).toBeInTheDocument();
  });

  it('shows the action buttons while a control inside the card has focus, hides them on blur', () => {
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onEdit={jest.fn()} />);
    const viewButton = screen.getByRole('button', { name: /View photo/ });
    fireEvent.focus(viewButton);
    expect(screen.getByRole('button', { name: /Annotate photo/ })).toBeInTheDocument();
    fireEvent.blur(viewButton);
    expect(screen.queryByRole('button', { name: /Annotate photo/ })).not.toBeInTheDocument();
  });
});

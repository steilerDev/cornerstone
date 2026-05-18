/**
 * Unit tests for PhotoCard component.
 *
 * Tests:
 *   - Edit button renders when onEdit is provided and editable=true
 *   - Edit button does NOT render when editable=false (even if onEdit is provided)
 *   - Delete button renders when onDelete is provided
 *   - Clicking Edit button calls onEdit
 *   - Clicking Delete button calls onDelete
 *   - Image renders with caption and originalFilename
 *   - Keyboard navigation: Enter/Space clicks the card, Delete key calls onDelete
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Photo } from '@cornerstone/shared';
import { PhotoCard } from './PhotoCard.js';

// Mock i18next
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        annotate: 'Annotate photo',
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

  it('renders Delete button when onDelete is provided', () => {
    const mockDelete = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onDelete={mockDelete} />);
    // Hover to show action buttons
    const card = screen.getByRole('listitem');
    fireEvent.mouseEnter(card);

    const deleteButton = screen.getByRole('button', { name: /Delete photo/ });
    expect(deleteButton).toBeInTheDocument();
  });

  it('calls onDelete when Delete button is clicked', () => {
    const mockDelete = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onDelete={mockDelete} />);
    // Hover to show action buttons
    const card = screen.getByRole('listitem');
    fireEvent.mouseEnter(card);

    const deleteButton = screen.getByRole('button', { name: /Delete photo/ });
    fireEvent.click(deleteButton);
    expect(mockDelete).toHaveBeenCalledTimes(1);
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

  it('calls onDelete when Delete key is pressed', () => {
    const mockDelete = jest.fn();
    render(<PhotoCard photo={mockPhoto} onClick={jest.fn()} onDelete={mockDelete} />);
    const card = screen.getByRole('listitem');
    fireEvent.keyDown(card, { key: 'Delete' });
    expect(mockDelete).toHaveBeenCalledTimes(1);
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
});

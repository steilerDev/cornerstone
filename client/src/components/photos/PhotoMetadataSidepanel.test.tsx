/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Photo, AreaResponse } from '@cornerstone/shared';
import { PhotoMetadataSidepanel } from './PhotoMetadataSidepanel.js';
import * as photoApi from '../../lib/photoApi.js';
import * as areasApi from '../../lib/areasApi.js';

// Mock the APIs using jest.mock (not unstable_mockModule)
jest.mock('../../lib/photoApi.js');
jest.mock('../../lib/areasApi.js');

const mockPhotoApi = photoApi as jest.Mocked<typeof photoApi>;
const mockAreasApi = areasApi as jest.Mocked<typeof areasApi>;

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock useFormatters
jest.mock('../../lib/formatters.js', () => ({
  useFormatters: () => ({
    formatDate: (date: string) => `formatted-${date}`,
  }),
}));

const mockPhoto: Photo = {
  id: 'photo-1',
  entityType: 'diary_entry',
  entityId: 'entry-1',
  originalFilename: 'test.jpg',
  mimeType: 'image/jpeg',
  fileSize: 1024,
  width: 800,
  height: 600,
  takenAt: null,
  caption: 'Test caption',
  areaId: 'area-1',
  sortOrder: 0,
  createdBy: null,
  createdAt: '2026-05-19T10:00:00Z',
  updatedAt: '2026-05-19T10:00:00Z',
  annotatedAt: null,
  fileUrl: 'http://test.com/photo.jpg',
  thumbnailUrl: 'http://test.com/thumb.jpg',
};

const mockAreas: AreaResponse[] = [
  {
    id: 'area-1',
    name: 'Kitchen',
    parentId: null,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'area-2',
    name: 'Bedroom',
    parentId: null,
    color: null,
    description: null,
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('PhotoMetadataSidepanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAreasApi.fetchAreas.mockResolvedValue({ areas: mockAreas });
  });

  it('renders the sidepanel when isOpen is true', async () => {
    render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('metadataTitle')).toBeInTheDocument();
    });
  });

  it('hides the sidepanel when isOpen is false', () => {
    const { container } = render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={false}
        onClose={jest.fn()}
      />,
    );

    const sidepanel = container.querySelector('.sidepanel');
    expect(sidepanel).toHaveClass('hidden');
  });

  it('renders upload date formatted', async () => {
    render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('formatted-2026-05-19T10:00:00Z')).toBeInTheDocument();
    });
  });

  it('renders description textarea with current caption', async () => {
    render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    const textarea = screen.getByDisplayValue('Test caption');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('id', 'photo-caption');
  });

  it('renders save button when photo has caption', () => {
    // Photo with caption should not show save button unless edited
    render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    // Save button should NOT be visible because no changes were made
    const saveButtons = screen.queryAllByRole('button', { name: 'saveButton' });
    expect(saveButtons.length).toBe(0);
  });

  it('loads areas on mount', async () => {
    render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockAreasApi.fetchAreas).toHaveBeenCalled();
    });
  });

  it('resets form when photo changes', async () => {
    const { rerender } = render(
      <PhotoMetadataSidepanel
        photo={mockPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    const newPhoto: Photo = { ...mockPhoto, caption: 'Different caption' };

    rerender(
      <PhotoMetadataSidepanel
        photo={newPhoto}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Different caption')).toBeInTheDocument();
    });
  });

  it('handles photo with null caption', () => {
    const photo: Photo = { ...mockPhoto, caption: null };

    render(
      <PhotoMetadataSidepanel
        photo={photo}
        isOpen={true}
        onClose={jest.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText('descriptionPlaceholder');
    expect(textarea).toHaveValue('');
  });

});

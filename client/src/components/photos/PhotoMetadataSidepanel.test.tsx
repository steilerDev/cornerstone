/**
 * @jest-environment jsdom
 *
 * Unit tests for PhotoMetadataSidepanel component.
 *
 * Mock strategy:
 * - jest.unstable_mockModule is used for CI (where it intercepts ESM modules correctly).
 * - In this worktree jest.unstable_mockModule doesn't intercept locally (systemic issue),
 *   so assertions use real translated text values from the en/photoViewer.json locale file.
 * - LocaleProvider wraps renders to supply the locale context required by useFormatters().
 *   configApi and preferencesApi are mocked to prevent network calls from the real provider.
 * - fetchAreas/updatePhoto assertions (toHaveBeenCalled) depend on the areasApi/photoApi
 *   module mocks intercepting — these tests are marked to pass in CI only.
 *
 * Translation values (en/photoViewer.json):
 *   metadataTitle        → "Photo Metadata"
 *   uploadDate           → "Upload Date"
 *   description          → "Description"
 *   descriptionPlaceholder → "Add a description..."
 *   areaPlaceholder      → "Select an area..."
 *   saveButton           → "Save"
 *   saving               → "Saving..."
 *   noArea               → "(no area)"
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { Photo, AreaResponse } from '@cornerstone/shared';

// ─── ESM-compatible mocks (must be before dynamic imports) ────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetchAreas = jest.fn<(...args: any[]) => any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUpdatePhoto = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  fetchAreas: mockFetchAreas,
}));

jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  uploadAnnotation: jest.fn(),
  uploadPhoto: jest.fn(),
  getPhotosForEntity: jest.fn(),
  updatePhoto: mockUpdatePhoto,
  deletePhoto: jest.fn(),
  getPhotoFileUrl: jest.fn((id: string) => `/api/photos/${id}/file`),
  getPhotoThumbnailUrl: jest.fn((id: string) => `/api/photos/${id}/thumbnail`),
  clearAnnotation: jest.fn(),
}));

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock LocaleContext directly so useFormatters() gets locale without a real provider.
// This is the canonical approach used in CalendarView.test.tsx and other tests that
// use useLocale() directly or indirectly via useFormatters().
jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock configApi and preferencesApi to prevent network calls from the real LocaleProvider
// when jest.unstable_mockModule doesn't intercept (local worktree environment).
jest.unstable_mockModule('../../lib/configApi.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchConfig: jest.fn<(...args: any[]) => any>().mockResolvedValue({ currency: 'EUR' }),
}));

jest.unstable_mockModule('../../lib/preferencesApi.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listPreferences: jest.fn<(...args: any[]) => any>().mockResolvedValue([]),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertPreference: jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
}));

// ─── Dynamic imports (after mocks) ────────────────────────────────────────────

import type * as PhotoMetadataSidepanelModule from './PhotoMetadataSidepanel.js';

let PhotoMetadataSidepanel: (typeof PhotoMetadataSidepanelModule)['PhotoMetadataSidepanel'];
let LocaleProvider: (props: { children: React.ReactNode }) => React.ReactElement;

// ─── Test fixtures ────────────────────────────────────────────────────────────

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

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PhotoMetadataSidepanel', () => {
  beforeEach(async () => {
    if (!PhotoMetadataSidepanel) {
      const mod = await import('./PhotoMetadataSidepanel.js');
      PhotoMetadataSidepanel = mod.PhotoMetadataSidepanel;
    }
    if (!LocaleProvider) {
      const localeMod = await import('../../contexts/LocaleContext.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      LocaleProvider = (localeMod as any).LocaleProvider;
    }

    jest.clearAllMocks();
    mockFetchAreas.mockResolvedValue({ areas: mockAreas });
  });

  /**
   * Render helper: wraps the component in LocaleProvider so useFormatters() has
   * locale context. In CI the LocaleProvider mock is a passthrough; locally it's
   * the real provider (with configApi/preferencesApi mocked to avoid network calls).
   */
  function renderSidepanel(props: {
    photo: Photo;
    onPhotoUpdated?: (photo: Photo) => void;
    isAnnotating?: boolean;
  }) {
    return render(
      React.createElement(LocaleProvider, {
        children: React.createElement(PhotoMetadataSidepanel, props),
      }),
    );
  }

  it('renders upload date formatted', async () => {
    renderSidepanel({
      photo: mockPhoto,
    });

    // formatDate('2026-05-19T10:00:00Z', 'en-US') = "May 19, 2026"
    await waitFor(() => {
      expect(screen.getByText('May 19, 2026')).toBeInTheDocument();
    });
  });

  it('renders description textarea with current caption', async () => {
    renderSidepanel({
      photo: mockPhoto,
    });

    const textarea = screen.getByDisplayValue('Test caption');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute('id', 'photo-caption');
  });

  it('does not show save button when no changes have been made', async () => {
    renderSidepanel({
      photo: mockPhoto,
    });

    // Wait for the component to settle (areas load, etc.) then assert no Save button.
    // Save button text: "Save" (real i18n) or "saveButton" (CI mock).
    await waitFor(() => {
      const heading = screen.queryByText('metadataTitle') ?? screen.queryByText('Photo Metadata');
      expect(heading).toBeInTheDocument();
    });
    const saveBtnByKey = screen.queryByRole('button', { name: 'saveButton' });
    const saveBtnByText = screen.queryByRole('button', { name: 'Save' });
    expect(saveBtnByKey ?? saveBtnByText).toBeNull();
  });

  it('loads areas on mount (CI only — areasApi mock must intercept)', async () => {
    renderSidepanel({
      photo: mockPhoto,
    });

    // fetchAreas is called by the component's mount effect.
    // This assertion depends on jest.unstable_mockModule intercepting — passes in CI.
    // Locally, the real fetchAreas runs (network call fails silently) and the mock is not called.
    await waitFor(
      () => {
        expect(mockFetchAreas).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
  });

  it('resets form when photo changes', async () => {
    const { rerender } = renderSidepanel({
      photo: mockPhoto,
    });

    const newPhoto: Photo = { ...mockPhoto, caption: 'Different caption' };

    rerender(
      React.createElement(LocaleProvider, {
        children: React.createElement(PhotoMetadataSidepanel, {
          photo: newPhoto,
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Different caption')).toBeInTheDocument();
    });
  });

  it('handles photo with null caption', async () => {
    const photo: Photo = { ...mockPhoto, caption: null };

    renderSidepanel({
      photo,
    });

    // Placeholder: "Add a description..." (real i18n) or "descriptionPlaceholder" (CI mock).
    await waitFor(() => {
      const byKey = screen.queryByPlaceholderText('descriptionPlaceholder');
      const byText = screen.queryByPlaceholderText('Add a description...');
      const textarea = byKey ?? byText;
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveValue('');
    });
  });
});

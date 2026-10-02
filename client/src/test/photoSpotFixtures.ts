import type {
  AreaResponse,
  OrientationResponse,
  PhotoSpotPhoto,
  PhotoSpotSummary,
} from '@cornerstone/shared';

const TS = '2026-01-01T00:00:00.000Z';

export function makeArea(
  id: string,
  name: string,
  opts: { parentId?: string | null; color?: string | null; sortOrder?: number } = {},
): AreaResponse {
  return {
    id,
    name,
    parentId: opts.parentId ?? null,
    color: opts.color === undefined ? '#aa0000' : opts.color,
    description: null,
    sortOrder: opts.sortOrder ?? 0,
    createdAt: TS,
    updatedAt: TS,
  };
}

export function makeOrientation(id: string, name: string, sortOrder = 0): OrientationResponse {
  return { id, name, description: null, sortOrder, createdAt: TS, updatedAt: TS };
}

export function makeSpot(
  areaId: string | null,
  orientationId: string | null,
  opts: Partial<PhotoSpotSummary> = {},
): PhotoSpotSummary {
  const key = `${areaId ?? 'none'}-${orientationId ?? 'none'}`;
  return {
    areaId,
    orientationId,
    photoCount: 1,
    latestEntryDate: '2026-09-11',
    latestPhotoId: `photo-${key}`,
    latestThumbnailUrl: `/api/photos/photo-${key}/thumbnail?v=1`,
    ...opts,
  };
}

/** Mutable locale for tests that mock `contexts/LocaleContext.js` (see makeLocaleContextMock). */
export const localeState: { resolvedLocale: 'en' | 'de' } = { resolvedLocale: 'en' };

/**
 * Factory for `jest.unstable_mockModule('<rel>/contexts/LocaleContext.js', ...)`: supplies a
 * locale context to useFormatters() without a LocaleProvider (which would need network mocks).
 */
export function makeLocaleContextMock() {
  return {
    // eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- must match the mocked export name
    useLocale: () => ({
      locale: localeState.resolvedLocale,
      resolvedLocale: localeState.resolvedLocale,
      currency: 'EUR',
      vatRate: 0.19,
      setLocale: () => {},
      syncWithServer: async () => {},
    }),
    LocaleProvider: ({ children }: { children: unknown }) => children,
  };
}

export function makeSpotPhoto(id: string, opts: Partial<PhotoSpotPhoto> = {}): PhotoSpotPhoto {
  return {
    id,
    caption: null,
    width: 800,
    height: 600,
    fileUrl: `/api/photos/${id}/file?v=1`,
    thumbnailUrl: `/api/photos/${id}/thumbnail?v=1`,
    diaryEntry: {
      id: `entry-${id}`,
      entryType: 'daily_log',
      title: null,
      entryDate: '2026-09-11',
    },
    ...opts,
  };
}

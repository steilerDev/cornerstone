/**
 * Paperless-ngx route mock for the Documents page (#2252, EPIC-21 P5.8).
 *
 * The E2E container runs with Paperless off, so the page is exercised with `/api/paperless/*`
 * answered in the browser. Everything else stays real: `/api/document-links*` (links, the
 * reverse lookup, linked ids) and `/api/undo` work without Paperless.
 *
 * - A synthetic corpus of 12 documents with distinct sort values, one document with four tags
 *   ("+1" in the row), three document types of which one ("Manual") is on no document (AC1.1:
 *   the Type options come from `document-types`, not from the loaded rows).
 * - The list route honours `query`, `tags` (every listed id), `documentType`, `excludeLinked`
 *   (against the REAL linked ids, read per request, so the count stays exact after a link),
 *   `sortBy`/`sortOrder`, `page` and `pageSize`, and records every request.
 * - The list route matches the exact pathname `/api/paperless/documents`, the detail route
 *   `/api/paperless/documents/<id>`; an id outside the corpus answers 404.
 * - Document ids start at a per-test random base (`baseId`), so parallel workers never share
 *   the Paperless ids they link (the linked-ids set is global to the database).
 */

import type { Page, Route } from '@playwright/test';
import type {
  AllLinkedDocumentIdsResponse,
  PaperlessDocument,
  PaperlessDocumentDetailResponse,
  PaperlessDocumentListResponse,
  PaperlessDocumentSearchResult,
  PaperlessDocumentType,
  PaperlessDocumentTypeListResponse,
  PaperlessStatusResponse,
  PaperlessTag,
  PaperlessTagListResponse,
} from '@cornerstone/shared';

export const LIBRARY_PAPERLESS_URL = 'http://paperless.example.test:8000';

export const LIBRARY_STATUS_CONFIGURED: PaperlessStatusResponse = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: LIBRARY_PAPERLESS_URL,
  filterTag: null,
};

export const LIBRARY_STATUS_UNREACHABLE: PaperlessStatusResponse = {
  configured: true,
  reachable: false,
  error: 'Connection refused',
  paperlessUrl: LIBRARY_PAPERLESS_URL,
  filterTag: null,
};

export const LIBRARY_TAGS: readonly PaperlessTag[] = [
  { id: 1, name: 'Invoice', color: null, documentCount: 4 },
  { id: 2, name: 'Contract', color: null, documentCount: 4 },
  { id: 3, name: 'Receipt', color: null, documentCount: 4 },
  { id: 4, name: 'Warranty', color: null, documentCount: 2 },
  { id: 5, name: 'Plans', color: null, documentCount: 2 },
];

/** "Manual" (3) is on no document: it only exists in `document-types`. */
export const LIBRARY_TYPES: readonly PaperlessDocumentType[] = [
  { id: 1, name: 'Bill' },
  { id: 2, name: 'Letter' },
  { id: 3, name: 'Manual' },
];

export type LibrarySortBy = 'added' | 'created' | 'modified' | 'title' | 'archive_serial_number';

export interface LibraryDoc extends PaperlessDocument {
  /** The tag ids behind `tags`. */
  tagIds: number[];
  typeId: number | null;
}

interface CorpusRow {
  /** Short key the tests use (`mock.doc('Alpha')`). */
  key: string;
  words: string;
  typeId: number | null;
  tagIds: number[];
  created: string;
  archiveSerialNumber: number;
  correspondent: string | null;
}

/** The index decides `added`/`modified` (later = newer), so the default sort starts with Lima. */
const CORPUS: readonly CorpusRow[] = [
  {
    key: 'Alpha',
    words: 'roof quote',
    typeId: 2,
    tagIds: [2],
    created: '2025-01-10',
    archiveSerialNumber: 112,
    correspondent: 'Roofing Example Ltd',
  },
  {
    key: 'Bravo',
    words: 'window invoice',
    typeId: 1,
    tagIds: [1],
    created: '2025-02-14',
    archiveSerialNumber: 109,
    correspondent: 'Windows Example Ltd',
  },
  {
    key: 'Charlie',
    words: 'plumbing invoice',
    typeId: 1,
    tagIds: [1, 3],
    created: '2025-03-01',
    archiveSerialNumber: 111,
    correspondent: null,
  },
  {
    key: 'Delta',
    words: 'electric contract',
    typeId: 2,
    tagIds: [2, 5],
    created: '2025-01-25',
    archiveSerialNumber: 105,
    correspondent: null,
  },
  {
    key: 'Echo',
    words: 'screed receipt',
    typeId: 1,
    tagIds: [3],
    created: '2025-04-02',
    archiveSerialNumber: 108,
    correspondent: null,
  },
  {
    key: 'Foxtrot',
    words: 'kitchen warranty',
    typeId: null,
    tagIds: [4],
    created: '2025-02-02',
    archiveSerialNumber: 110,
    correspondent: null,
  },
  {
    key: 'Golf',
    words: 'heating invoice',
    typeId: 1,
    tagIds: [1, 2, 3, 4],
    created: '2025-05-05',
    archiveSerialNumber: 101,
    correspondent: null,
  },
  {
    key: 'Hotel',
    words: 'garden plan',
    typeId: null,
    tagIds: [5],
    created: '2025-04-20',
    archiveSerialNumber: 103,
    correspondent: null,
  },
  {
    key: 'India',
    words: 'facade invoice',
    typeId: 1,
    tagIds: [1],
    created: '2025-03-15',
    archiveSerialNumber: 107,
    correspondent: null,
  },
  {
    key: 'Juliet',
    words: 'tiling receipt',
    typeId: 1,
    tagIds: [3],
    created: '2025-05-25',
    archiveSerialNumber: 102,
    correspondent: null,
  },
  {
    key: 'Kilo',
    words: 'insulation letter',
    typeId: 2,
    tagIds: [],
    created: '2025-03-30',
    archiveSerialNumber: 106,
    correspondent: null,
  },
  {
    key: 'Lima',
    words: 'paint quote',
    typeId: 2,
    tagIds: [2],
    created: '2025-06-01',
    archiveSerialNumber: 104,
    correspondent: null,
  },
];

/** More than 300 characters, so the sheet's content preview ends with an ellipsis. */
const LONG_CONTENT = 'Synthetic line of document text for the preview. '.repeat(10);

export interface LibraryMockOptions {
  /** Paperless id of the first corpus document minus one. Default: random, 20 apart. */
  baseId?: number;
  status?: PaperlessStatusResponse;
}

export interface LibraryMock {
  /** A short random token carried by every title and the content (unique per test). */
  readonly token: string;
  readonly baseId: number;
  readonly docs: readonly LibraryDoc[];
  /** Every `GET /api/paperless/documents` query string, in order. */
  readonly listRequests: URLSearchParams[];
  /** Every detail id requested, in order. */
  readonly detailRequests: number[];
  readonly doc: (key: string) => LibraryDoc;
  /** An id that is not in the corpus (the detail answers 404). */
  readonly missingId: number;
  /** Replace the status answered from now on (e.g. unreachable, then reachable for Try again). */
  readonly setStatus: (status: PaperlessStatusResponse) => void;
  /** The titles of the whole corpus in the order the list route answers for a sort. */
  readonly sortedTitles: (sortBy: LibrarySortBy, sortOrder: 'asc' | 'desc') => string[];
  /** The query of the latest list request (throws while there was none). */
  readonly lastListRequest: () => URLSearchParams;
}

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function sortKey(doc: LibraryDoc, sortBy: LibrarySortBy): string | number {
  switch (sortBy) {
    case 'title':
      return doc.title.toLowerCase();
    case 'created':
      return doc.created ?? '';
    case 'modified':
      return doc.modified ?? '';
    case 'archive_serial_number':
      return doc.archiveSerialNumber ?? 0;
    case 'added':
      return doc.added ?? '';
  }
}

function sortDocs(
  docs: readonly LibraryDoc[],
  sortBy: LibrarySortBy,
  sortOrder: 'asc' | 'desc',
): LibraryDoc[] {
  const direction = sortOrder === 'asc' ? 1 : -1;
  return [...docs].sort((a, b) => {
    const left = sortKey(a, sortBy);
    const right = sortKey(b, sortBy);
    if (left < right) return -direction;
    if (left > right) return direction;
    return a.id - b.id;
  });
}

function toSearchResult(doc: LibraryDoc): PaperlessDocumentSearchResult {
  const { tagIds: _tagIds, typeId: _typeId, ...rest } = doc;
  return { ...rest, searchHit: null };
}

export async function mockPaperlessLibrary(
  page: Page,
  options: LibraryMockOptions = {},
): Promise<LibraryMock> {
  const baseId = options.baseId ?? 100_000 + Math.floor(Math.random() * 900_000) * 20;
  const token = Math.random().toString(36).slice(2, 6);
  let status = options.status ?? LIBRARY_STATUS_CONFIGURED;

  const docs: LibraryDoc[] = CORPUS.map((row, index) => ({
    id: baseId + index + 1,
    title: `${row.key} ${row.words} ${token}`,
    content:
      index === 0
        ? `Subject ${token}. ${LONG_CONTENT}`
        : `Synthetic text of the ${row.key} document ${token}.`,
    tags: LIBRARY_TAGS.filter((tag) => row.tagIds.includes(tag.id)),
    tagIds: row.tagIds,
    typeId: row.typeId,
    created: row.created,
    added: `2025-03-${String(index + 2).padStart(2, '0')}T10:00:00Z`,
    modified: `2025-04-${String(index + 2).padStart(2, '0')}T10:00:00Z`,
    correspondent: row.correspondent,
    documentType: LIBRARY_TYPES.find((type) => type.id === row.typeId)?.name ?? null,
    archiveSerialNumber: row.archiveSerialNumber,
    originalFileName: `${row.key.toLowerCase()}-${token}.pdf`,
    pageCount: index + 1,
  }));

  const listRequests: URLSearchParams[] = [];
  const detailRequests: number[] = [];
  const missingId = baseId + 19;

  const json = (route: Route, body: unknown, statusCode = 200) =>
    route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route('**/api/paperless/status', (route) => json(route, status));
  await page.route('**/api/paperless/tags', (route) =>
    json(route, { tags: [...LIBRARY_TAGS] } satisfies PaperlessTagListResponse),
  );
  await page.route('**/api/paperless/document-types', (route) =>
    json(route, { documentTypes: [...LIBRARY_TYPES] } satisfies PaperlessDocumentTypeListResponse),
  );
  await page.route('**/api/paperless/correspondents', (route) =>
    json(route, { correspondents: [] }),
  );
  await page.route('**/api/paperless/documents/*/thumb', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
  );

  await page.route(
    (url) => url.pathname === '/api/paperless/documents',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const params = new URL(route.request().url()).searchParams;
      listRequests.push(params);

      let matching = [...docs];
      const query = params.get('query')?.trim().toLowerCase();
      if (query) {
        matching = matching.filter(
          (doc) =>
            doc.title.toLowerCase().includes(query) ||
            (doc.content ?? '').toLowerCase().includes(query),
        );
      }
      const tagIds = (params.get('tags') ?? '').split(',').filter(Boolean).map(Number);
      if (tagIds.length > 0) {
        matching = matching.filter((doc) => tagIds.every((id) => doc.tagIds.includes(id)));
      }
      const typeId = params.get('documentType');
      if (typeId) matching = matching.filter((doc) => doc.typeId === Number(typeId));
      if (params.get('excludeLinked') === 'true') {
        const linked = await page.request.get('/api/document-links/linked-ids');
        const { paperlessDocumentIds } = (await linked.json()) as AllLinkedDocumentIdsResponse;
        const linkedIds = new Set(paperlessDocumentIds);
        matching = matching.filter((doc) => !linkedIds.has(doc.id));
      }

      const sortBy = (params.get('sortBy') ?? 'added') as LibrarySortBy;
      const sortOrder = params.get('sortOrder') === 'asc' ? 'asc' : 'desc';
      const sorted = sortDocs(matching, sortBy, sortOrder);

      const pageNumber = Number(params.get('page') ?? '1');
      const pageSize = Number(params.get('pageSize') ?? '25');
      const start = (pageNumber - 1) * pageSize;
      await json(route, {
        documents: sorted.slice(start, start + pageSize).map(toSearchResult),
        pagination: {
          page: pageNumber,
          pageSize,
          totalItems: sorted.length,
          totalPages: Math.max(1, Math.ceil(sorted.length / pageSize)),
        },
      } satisfies PaperlessDocumentListResponse);
    },
  );

  await page.route(
    (url) => /^\/api\/paperless\/documents\/\d+$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const id = Number(new URL(route.request().url()).pathname.split('/').pop());
      detailRequests.push(id);
      const found = docs.find((doc) => doc.id === id);
      if (!found) {
        await json(route, { error: { code: 'NOT_FOUND', message: 'Document not found' } }, 404);
        return;
      }
      const { tagIds: _tagIds, typeId: _typeId, ...document } = found;
      await json(route, { document } satisfies PaperlessDocumentDetailResponse);
    },
  );

  return {
    token,
    baseId,
    docs,
    listRequests,
    detailRequests,
    missingId,
    doc: (key) => {
      const found = docs.find((doc) => doc.title.startsWith(`${key} `));
      if (!found) throw new Error(`No library document "${key}"`);
      return found;
    },
    setStatus: (next) => {
      status = next;
    },
    sortedTitles: (sortBy, sortOrder) => sortDocs(docs, sortBy, sortOrder).map((doc) => doc.title),
    lastListRequest: () => {
      const last = listRequests.at(-1);
      if (!last) throw new Error('No documents list request recorded yet');
      return last;
    },
  };
}

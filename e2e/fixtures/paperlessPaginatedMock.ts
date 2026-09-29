/**
 * Page-aware Paperless-ngx route mock for infinite-scroll E2E tests (Issue #2101).
 *
 * Unlike the fixed-response mocks used elsewhere, this one reads `page` / `pageSize` from the
 * request URL, slices a synthetic corpus, and returns a matching `totalPages`. Every requested
 * page number is recorded so tests can assert exactly which batches the client asked for.
 *
 * The documents-list route matches the exact pathname `/api/paperless/documents`, so it never
 * collides with the `/api/paperless/documents/:id/thumb` mock registered alongside it. Register
 * this helper AFTER any broader documents mock (Playwright runs the most recently registered
 * matching route first).
 */

import type { Page, Route } from '@playwright/test';
import type {
  AllLinkedDocumentIdsResponse,
  PaperlessCorrespondentListResponse,
  PaperlessDocumentListResponse,
  PaperlessDocumentSearchResult,
  PaperlessStatusResponse,
  PaperlessTagListResponse,
} from '@cornerstone/shared';

export const PAGINATED_STATUS_CONFIGURED = {
  configured: true,
  reachable: true,
  error: null,
  paperlessUrl: 'http://paperless.local:8000',
  filterTag: null,
} satisfies PaperlessStatusResponse;

export interface PaginatedPaperlessMockOptions {
  /** Total documents in the synthetic corpus (ids 1..total). Default 30. */
  total?: number;
  /** Paperless document ids returned by GET /api/document-links/linked-ids. Default []. */
  linkedIds?: number[];
  /** Artificial latency (ms) applied to page >= 2 responses. Default 0. */
  delayPageGte2Ms?: number;
  /** Number of times a request for page 2 answers 502 before succeeding. Default 0. */
  failPage2Times?: number;
}

export interface PaginatedPaperlessMock {
  /** Every documents-list `page` value requested, in order (including failed requests). */
  requestedPages: number[];
  /** Title of the synthetic document with the given id. */
  titleFor(id: number): string;
}

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function makeDocument(id: number, title: string): PaperlessDocumentSearchResult {
  return {
    id,
    title,
    content: `Content of document ${id}`,
    tags: [],
    created: '2025-06-15',
    added: '2025-06-15T10:00:00Z',
    modified: '2025-06-15T10:00:00Z',
    correspondent: null,
    documentType: null,
    archiveSerialNumber: id + 100,
    originalFileName: `scroll-doc-${id}.pdf`,
    pageCount: 1,
    searchHit: null,
  };
}

/**
 * Mocks status, tags, correspondents, thumbnails, linked-ids and a page-aware documents list.
 */
export async function mockPaginatedPaperless(
  page: Page,
  options: PaginatedPaperlessMockOptions = {},
): Promise<PaginatedPaperlessMock> {
  const total = options.total ?? 30;
  const linkedIds = options.linkedIds ?? [];
  const delayMs = options.delayPageGte2Ms ?? 0;
  let failuresLeft = options.failPage2Times ?? 0;

  const requestedPages: number[] = [];
  const titleFor = (id: number) => `Scroll Doc ${String(id).padStart(2, '0')}`;

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/paperless/status', (route) => json(route, PAGINATED_STATUS_CONFIGURED));
  await page.route('**/api/paperless/tags', (route) =>
    json(route, { tags: [] } satisfies PaperlessTagListResponse),
  );
  await page.route('**/api/paperless/correspondents', (route) =>
    json(route, { correspondents: [] } satisfies PaperlessCorrespondentListResponse),
  );
  await page.route('**/api/document-links/linked-ids', (route) =>
    json(route, { paperlessDocumentIds: linkedIds } satisfies AllLinkedDocumentIdsResponse),
  );

  await page.route(
    (url) => url.pathname === '/api/paperless/documents',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url());
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('pageSize') ?? '25');
      requestedPages.push(pageNumber);

      if (pageNumber >= 2 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (pageNumber === 2 && failuresLeft > 0) {
        failuresLeft -= 1;
        await json(
          route,
          { error: { code: 'PAPERLESS_UNREACHABLE', message: 'Bad gateway' } },
          502,
        );
        return;
      }

      const start = (pageNumber - 1) * pageSize;
      const documents = Array.from({ length: total }, (_, i) => i + 1)
        .slice(start, start + pageSize)
        .map((id) => makeDocument(id, titleFor(id)));
      await json(route, {
        documents,
        pagination: {
          page: pageNumber,
          pageSize,
          totalItems: total,
          totalPages: Math.ceil(total / pageSize),
        },
      } satisfies PaperlessDocumentListResponse);
    },
  );

  await page.route('**/api/paperless/documents/*/thumb', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG }),
  );

  return { requestedPages, titleFor };
}

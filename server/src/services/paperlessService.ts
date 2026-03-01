/**
 * Paperless-ngx HTTP client service.
 *
 * EPIC-08: Paperless-ngx Document Integration
 *
 * This service proxies all requests to a Paperless-ngx instance, transforming
 * raw API responses into Cornerstone's own response shapes. The Paperless-ngx
 * API token is kept server-side and never exposed to the browser.
 *
 * All requests include `Accept: application/json; version=5` (ADR-015).
 */

import type {
  PaperlessDocument,
  PaperlessTag,
  PaperlessDocumentSearchResult,
  PaperlessDocumentListResponse,
  PaperlessTagListResponse,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import { AppError } from '../errors/AppError.js';

// ─── Paperless color ID → hex mapping ────────────────────────────────────────

/**
 * Maps Paperless-ngx numeric colour IDs (1–7) to hex colour strings.
 */
const PAPERLESS_COLOR_MAP: Record<number, string> = {
  1: '#a6cee3',
  2: '#1f78b4',
  3: '#b2df8a',
  4: '#33a02c',
  5: '#fb9a99',
  6: '#e31a1c',
  7: '#fdbf6f',
};

// ─── Raw Paperless-ngx API shapes ────────────────────────────────────────────

interface RawPaperlessTag {
  id: number;
  name: string;
  colour: number;
  document_count: number;
}

interface RawSearchHit {
  score: string;
  highlights: string;
  rank: number;
}

interface RawPaperlessDocument {
  id: number;
  title: string;
  content: string;
  tags: number[];
  created: string | null;
  added: string | null;
  modified: string | null;
  correspondent: number | null;
  document_type: number | null;
  archive_serial_number: number | null;
  original_file_name: string | null;
  page_count: number | null;
  __search_hit__?: RawSearchHit;
}

interface RawPaperlessListResponse {
  count: number;
  results: RawPaperlessDocument[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build the standard Paperless-ngx JSON API request headers.
 */
function makeHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Token ${token}`,
    Accept: 'application/json; version=5',
  };
}

/**
 * Perform an authenticated JSON request to Paperless-ngx.
 * Throws AppError with appropriate codes on failure.
 */
async function fetchPaperless<T>(baseUrl: string, token: string, path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { headers: makeHeaders(token) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError('PAPERLESS_UNREACHABLE', 502, `Cannot connect to Paperless-ngx: ${message}`);
  }

  if (response.status === 404) {
    throw new AppError('NOT_FOUND', 404, 'Document not found in Paperless-ngx');
  }

  if (!response.ok) {
    throw new AppError(
      'PAPERLESS_ERROR',
      502,
      `Paperless-ngx returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Fetch binary content from Paperless-ngx (thumbnails, previews).
 * Returns the raw Response so the caller can stream it to the client.
 */
export async function fetchBinary(baseUrl: string, token: string, path: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Token ${token}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError('PAPERLESS_UNREACHABLE', 502, `Cannot connect to Paperless-ngx: ${message}`);
  }

  if (response.status === 404) {
    throw new AppError('NOT_FOUND', 404, 'Document not found in Paperless-ngx');
  }

  if (!response.ok) {
    throw new AppError(
      'PAPERLESS_ERROR',
      502,
      `Paperless-ngx returned ${response.status}: ${response.statusText}`,
    );
  }

  return response;
}

/**
 * Map a raw Paperless-ngx tag to Cornerstone's PaperlessTag shape.
 */
function mapTag(raw: RawPaperlessTag): PaperlessTag {
  return {
    id: raw.id,
    name: raw.name,
    color: PAPERLESS_COLOR_MAP[raw.colour] ?? null,
    documentCount: raw.document_count,
  };
}

/**
 * Fetch all tags from Paperless-ngx and return them as a lookup map.
 * Uses a large page_size to avoid pagination (instances typically have <100 tags).
 */
async function fetchTagsMap(baseUrl: string, token: string): Promise<Map<number, PaperlessTag>> {
  const data = await fetchPaperless<{ count: number; results: RawPaperlessTag[] }>(
    baseUrl,
    token,
    '/api/tags/?page_size=1000',
  );
  const map = new Map<number, PaperlessTag>();
  for (const raw of data.results) {
    map.set(raw.id, mapTag(raw));
  }
  return map;
}

/**
 * Resolve a Paperless-ngx correspondent ID to its display name.
 * Returns null if the ID is null or the correspondent cannot be fetched.
 */
async function resolveCorrespondentName(
  baseUrl: string,
  token: string,
  id: number | null,
): Promise<string | null> {
  if (id === null) return null;
  try {
    const data = await fetchPaperless<{ id: number; name: string }>(
      baseUrl,
      token,
      `/api/correspondents/${id}/`,
    );
    return data.name;
  } catch {
    return null;
  }
}

/**
 * Resolve a Paperless-ngx document type ID to its display name.
 * Returns null if the ID is null or the document type cannot be fetched.
 */
async function resolveDocumentTypeName(
  baseUrl: string,
  token: string,
  id: number | null,
): Promise<string | null> {
  if (id === null) return null;
  try {
    const data = await fetchPaperless<{ id: number; name: string }>(
      baseUrl,
      token,
      `/api/document_types/${id}/`,
    );
    return data.name;
  } catch {
    return null;
  }
}

/**
 * Map a raw Paperless-ngx document to Cornerstone's PaperlessDocument shape.
 * Tag resolution uses the pre-fetched tagsMap. Content is included only for detail views.
 */
function mapDocument(
  raw: RawPaperlessDocument,
  tagsMap: Map<number, PaperlessTag>,
  correspondentName: string | null,
  documentTypeName: string | null,
  includeContent: boolean,
): PaperlessDocument {
  const tags: PaperlessTag[] = raw.tags
    .map((tagId) => tagsMap.get(tagId))
    .filter((t): t is PaperlessTag => t !== undefined);

  // Paperless returns created as ISO datetime (YYYY-MM-DDTHH:MM:SSZ); strip to date only
  const created = raw.created ? raw.created.slice(0, 10) : null;

  return {
    id: raw.id,
    title: raw.title,
    content: includeContent ? raw.content : null,
    tags,
    created,
    added: raw.added,
    modified: raw.modified,
    correspondent: correspondentName,
    documentType: documentTypeName,
    archiveSerialNumber: raw.archive_serial_number,
    originalFileName: raw.original_file_name,
    pageCount: raw.page_count,
  };
}

// ─── Exported service functions ───────────────────────────────────────────────

/**
 * Check the connectivity status of the Paperless-ngx integration.
 * Performs a lightweight probe request to verify reachability.
 */
export async function getStatus(baseUrl: string, token: string): Promise<PaperlessStatusResponse> {
  try {
    await fetchPaperless<{ count: number }>(baseUrl, token, '/api/documents/?page_size=1');
    return { configured: true, reachable: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { configured: true, reachable: false, error: message };
  }
}

/**
 * Query parameters for listing/searching Paperless-ngx documents.
 */
export interface ListDocumentsQuery {
  query?: string;
  tags?: string; // comma-separated Paperless-ngx tag IDs
  correspondent?: number;
  documentType?: number;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * List or search documents in Paperless-ngx with pagination, filtering, and sorting.
 * Tag, correspondent, and document type names are resolved server-side.
 */
export async function listDocuments(
  baseUrl: string,
  token: string,
  query: ListDocumentsQuery,
): Promise<PaperlessDocumentListResponse> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

  // Build Paperless-ngx query string
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize));

  if (query.query) {
    params.set('query', query.query);
  }
  if (query.tags) {
    params.set('tags__id__in', query.tags);
  }
  if (query.correspondent !== undefined) {
    params.set('correspondent__id', String(query.correspondent));
  }
  if (query.documentType !== undefined) {
    params.set('document_type__id', String(query.documentType));
  }

  // Build ordering param
  const sortFieldMap: Record<string, string> = {
    created: 'created',
    added: 'added',
    modified: 'modified',
    title: 'title',
    archive_serial_number: 'archive_serial_number',
  };
  const paperlessSortField = sortFieldMap[query.sortBy ?? ''] ?? 'created';
  const ordering = `${query.sortOrder === 'asc' ? '' : '-'}${paperlessSortField}`;
  params.set('ordering', ordering);

  const path = `/api/documents/?${params.toString()}`;
  const raw = await fetchPaperless<RawPaperlessListResponse>(baseUrl, token, path);

  // Fetch tags once for the whole result set
  const tagsMap = await fetchTagsMap(baseUrl, token);

  // Collect unique correspondent and document type IDs to avoid N+1 calls
  const correspondentIds = new Set<number>();
  const documentTypeIds = new Set<number>();
  for (const doc of raw.results) {
    if (doc.correspondent !== null) correspondentIds.add(doc.correspondent);
    if (doc.document_type !== null) documentTypeIds.add(doc.document_type);
  }

  // Resolve all unique correspondents and document types in parallel
  const [correspondentNames, documentTypeNames] = await Promise.all([
    Promise.all(
      [...correspondentIds].map(async (id) => {
        const name = await resolveCorrespondentName(baseUrl, token, id);
        return [id, name] as [number, string | null];
      }),
    ),
    Promise.all(
      [...documentTypeIds].map(async (id) => {
        const name = await resolveDocumentTypeName(baseUrl, token, id);
        return [id, name] as [number, string | null];
      }),
    ),
  ]);

  const correspondentMap = new Map<number, string | null>(correspondentNames);
  const documentTypeMap = new Map<number, string | null>(documentTypeNames);

  // Map documents
  const documents: PaperlessDocumentSearchResult[] = raw.results.map((rawDoc) => {
    const correspondentName =
      rawDoc.correspondent !== null ? (correspondentMap.get(rawDoc.correspondent) ?? null) : null;
    const documentTypeName =
      rawDoc.document_type !== null ? (documentTypeMap.get(rawDoc.document_type) ?? null) : null;

    const doc = mapDocument(rawDoc, tagsMap, correspondentName, documentTypeName, false);

    const searchHit = rawDoc.__search_hit__
      ? {
          score: parseFloat(rawDoc.__search_hit__.score),
          highlights: rawDoc.__search_hit__.highlights,
          rank: rawDoc.__search_hit__.rank,
        }
      : null;

    return { ...doc, searchHit };
  });

  return {
    documents,
    pagination: {
      page,
      pageSize,
      totalItems: raw.count,
      totalPages: Math.ceil(raw.count / pageSize),
    },
  };
}

/**
 * Fetch metadata for a single Paperless-ngx document (includes full text content).
 * @throws AppError('NOT_FOUND') if the document does not exist in Paperless-ngx
 */
export async function getDocument(
  baseUrl: string,
  token: string,
  id: number,
): Promise<PaperlessDocument> {
  const rawDoc = await fetchPaperless<RawPaperlessDocument>(
    baseUrl,
    token,
    `/api/documents/${id}/`,
  );

  const tagsMap = await fetchTagsMap(baseUrl, token);
  const [correspondentName, documentTypeName] = await Promise.all([
    resolveCorrespondentName(baseUrl, token, rawDoc.correspondent),
    resolveDocumentTypeName(baseUrl, token, rawDoc.document_type),
  ]);

  return mapDocument(rawDoc, tagsMap, correspondentName, documentTypeName, true);
}

/**
 * List all tags available in Paperless-ngx, sorted by ID ascending.
 */
export async function listTags(baseUrl: string, token: string): Promise<PaperlessTagListResponse> {
  const tagsMap = await fetchTagsMap(baseUrl, token);
  const tags = [...tagsMap.values()].sort((a, b) => a.id - b.id);
  return { tags };
}

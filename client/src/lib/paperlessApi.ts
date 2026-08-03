import { get, getBaseUrl, ApiClientError } from './apiClient.js';
import type {
  PaperlessStatusResponse,
  PaperlessDocumentListResponse,
  PaperlessDocumentDetailResponse,
  PaperlessTagListResponse,
  PaperlessDocumentListQuery,
  PaperlessCorrespondentListResponse,
  PaperlessUploadResponse,
  ApiError,
  ApiErrorResponse,
} from '@cornerstone/shared';

/**
 * Checks if Paperless-ngx is configured and reachable.
 */
export function getPaperlessStatus(): Promise<PaperlessStatusResponse> {
  return get<PaperlessStatusResponse>('/paperless/status');
}

/**
 * Lists documents with optional filtering, search, and pagination.
 */
export function listPaperlessDocuments(
  query?: PaperlessDocumentListQuery,
): Promise<PaperlessDocumentListResponse> {
  const params = new URLSearchParams();
  if (query?.query) params.set('query', query.query);
  if (query?.tags) params.set('tags', query.tags);
  if (query?.correspondent !== undefined) params.set('correspondent', String(query.correspondent));
  if (query?.documentType !== undefined) params.set('documentType', String(query.documentType));
  if (query?.page !== undefined) params.set('page', String(query.page));
  if (query?.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query?.sortBy) params.set('sortBy', query.sortBy);
  if (query?.sortOrder) params.set('sortOrder', query.sortOrder);
  const qs = params.toString();
  return get<PaperlessDocumentListResponse>(`/paperless/documents${qs ? `?${qs}` : ''}`);
}

/**
 * Gets a single document by its Paperless-ngx ID.
 */
export function getPaperlessDocument(id: number): Promise<PaperlessDocumentDetailResponse> {
  return get<PaperlessDocumentDetailResponse>(`/paperless/documents/${id}`);
}

/**
 * Lists all available Paperless-ngx tags.
 */
export function listPaperlessTags(): Promise<PaperlessTagListResponse> {
  return get<PaperlessTagListResponse>('/paperless/tags');
}

/**
 * Lists all available Paperless-ngx correspondents for filtering documents.
 */
export function listPaperlessCorrespondents(): Promise<PaperlessCorrespondentListResponse> {
  return get<PaperlessCorrespondentListResponse>('/paperless/correspondents');
}

/**
 * Returns the URL for a document thumbnail image.
 * Note: this is a URL string, NOT a fetch call — use as <img src={...} />.
 */
export function getDocumentThumbnailUrl(id: number): string {
  return `${getBaseUrl()}/paperless/documents/${id}/thumb`;
}

/**
 * Returns the URL for a document preview (PDF).
 * Note: this is a URL string, NOT a fetch call — use as <a href={...} />.
 */
export function getDocumentPreviewUrl(id: number): string {
  return `${getBaseUrl()}/paperless/documents/${id}/preview`;
}

/**
 * Uploads a document to Paperless-ngx.
 * @throws {ApiClientError} On 4xx/5xx responses
 */
export async function uploadPaperlessDocument(
  document: Blob,
  title: string,
): Promise<PaperlessUploadResponse> {
  const formData = new FormData();
  formData.set('document', document);
  formData.set('title', title);

  const response = await fetch(`${getBaseUrl()}/paperless/documents`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    let apiError: ApiError = { code: 'INTERNAL_ERROR', message: 'Upload failed' };
    try {
      const json = (await response.json()) as ApiErrorResponse;
      if (json.error) {
        apiError = json.error;
      }
    } catch {
      // JSON parse error; use default
    }
    throw new ApiClientError(response.status, apiError);
  }

  return response.json() as Promise<PaperlessUploadResponse>;
}

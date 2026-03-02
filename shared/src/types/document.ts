/**
 * Document-related types for Paperless-ngx integration.
 *
 * EPIC-08: Paperless-ngx Document Integration
 *
 * These types cover:
 * - Paperless-ngx document metadata (proxied through Cornerstone API)
 * - Paperless-ngx tag metadata
 * - Document link entities (linking Paperless-ngx docs to Cornerstone entities)
 * - API request/response shapes for proxy and linking endpoints
 */

import type { PaginationMeta } from './pagination.js';

// ─── Entity Types ────────────────────────────────────────────────────────────

/**
 * Entity types that can be linked to Paperless-ngx documents.
 */
export type DocumentLinkEntityType = 'work_item' | 'household_item' | 'invoice';

// ─── Paperless-ngx Proxy Types ───────────────────────────────────────────────

/**
 * Tag metadata from Paperless-ngx (simplified for Cornerstone's needs).
 */
export interface PaperlessTag {
  id: number;
  name: string;
  color: string | null;
  /** Number of documents with this tag in Paperless-ngx. */
  documentCount: number;
}

/**
 * Document metadata from Paperless-ngx (simplified for Cornerstone's needs).
 * This is the shape returned by Cornerstone's proxy, not the raw Paperless-ngx response.
 */
export interface PaperlessDocument {
  /** Paperless-ngx document ID. */
  id: number;
  title: string;
  /** The content/text of the document (may be truncated for list views). */
  content: string | null;
  /** Tags applied to this document in Paperless-ngx. */
  tags: PaperlessTag[];
  /** ISO 8601 date string (YYYY-MM-DD) when the document was created. */
  created: string | null;
  /** ISO 8601 datetime string when the document was added to Paperless-ngx. */
  added: string | null;
  /** ISO 8601 datetime string when the document was last modified. */
  modified: string | null;
  /** Correspondent name (the person/organization the document is from). */
  correspondent: string | null;
  /** Document type name. */
  documentType: string | null;
  /** Archive serial number assigned in Paperless-ngx. */
  archiveSerialNumber: number | null;
  /** Original filename of the uploaded document. */
  originalFileName: string | null;
  /** Number of pages in the document (if available). */
  pageCount: number | null;
}

/**
 * Search hit metadata returned alongside documents when a search query is used.
 */
export interface PaperlessSearchHit {
  score: number;
  highlights: string;
  rank: number;
}

/**
 * Document with optional search hit metadata.
 */
export interface PaperlessDocumentSearchResult extends PaperlessDocument {
  /** Present only when the request includes a search query. */
  searchHit: PaperlessSearchHit | null;
}

// ─── Proxy API Request/Response Types ────────────────────────────────────────

/**
 * Query parameters for GET /api/paperless/documents.
 */
export interface PaperlessDocumentListQuery {
  /** Full-text search query. */
  query?: string;
  /** Filter by Paperless-ngx tag IDs (comma-separated). */
  tags?: string;
  /** Filter by correspondent ID. */
  correspondent?: number;
  /** Filter by document type ID. */
  documentType?: number;
  /** Page number (1-indexed). */
  page?: number;
  /** Page size (default 25, max 100). */
  pageSize?: number;
  /** Sort field. */
  sortBy?: 'created' | 'added' | 'modified' | 'title' | 'archive_serial_number';
  /** Sort direction. */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response for GET /api/paperless/documents.
 */
export interface PaperlessDocumentListResponse {
  documents: PaperlessDocumentSearchResult[];
  pagination: PaginationMeta;
}

/**
 * Response for GET /api/paperless/documents/:id.
 */
export interface PaperlessDocumentDetailResponse {
  document: PaperlessDocument;
}

/**
 * Response for GET /api/paperless/tags.
 */
export interface PaperlessTagListResponse {
  tags: PaperlessTag[];
}

/**
 * Response for GET /api/paperless/status.
 * Indicates whether the Paperless-ngx integration is configured and reachable.
 */
export interface PaperlessStatusResponse {
  configured: boolean;
  reachable: boolean;
  /** Human-readable error message if not reachable. */
  error: string | null;
}

// ─── Document Link Types ─────────────────────────────────────────────────────

/**
 * A link between a Cornerstone entity and a Paperless-ngx document.
 */
export interface DocumentLink {
  id: string;
  entityType: DocumentLinkEntityType;
  entityId: string;
  paperlessDocumentId: number;
  createdBy: {
    id: string;
    displayName: string;
  } | null;
  createdAt: string;
}

/**
 * Document link enriched with Paperless-ngx document metadata.
 * Used in list responses where the client needs to display document info.
 */
export interface DocumentLinkWithMetadata extends DocumentLink {
  /** Paperless-ngx document metadata. Null if the document was deleted from Paperless-ngx. */
  document: PaperlessDocument | null;
}

/**
 * Request body for POST /api/document-links.
 */
export interface CreateDocumentLinkRequest {
  entityType: DocumentLinkEntityType;
  entityId: string;
  paperlessDocumentId: number;
}

/**
 * Response for POST /api/document-links.
 */
export interface DocumentLinkResponse {
  documentLink: DocumentLink;
}

/**
 * Response for GET /api/document-links?entityType=...&entityId=...
 * Returns links enriched with document metadata.
 */
export interface DocumentLinkListResponse {
  documentLinks: DocumentLinkWithMetadata[];
}

/**
 * Paperless-ngx API types.
 *
 * Mirrors Paperless API objects for correspondents, document types, etc.
 * Note: PaperlessTag is defined in document.ts (EPIC-08) to avoid duplication.
 *
 * EPIC-18 Story #1679: Added correspondent types for Paperless-first invoice creation workflow.
 */

/**
 * Correspondent (sender/source organization) in Paperless-ngx.
 * EPIC-18 Story #1679: Added for Paperless-first invoice creation workflow.
 */
export interface PaperlessCorrespondent {
  id: number;
  name: string;
}

export interface PaperlessCorrespondentListResponse {
  correspondents: PaperlessCorrespondent[];
}

/** Response for POST /api/paperless/documents — the Paperless-ngx consumption task UUID. */
export interface PaperlessUploadResponse {
  taskId: string;
}

import { get, post, del, patch } from './apiClient.js';
import type {
  DocumentLink,
  DocumentLinkWithMetadata,
  CreateDocumentLinkRequest,
  AllLinkedDocumentIdsResponse,
  AttachmentType,
  UpdateDocumentLinkRequest,
  DeleteDocumentLinkResponse,
} from '@cornerstone/shared';

/**
 * Lists all document links for a given entity.
 */
export function listDocumentLinks(
  entityType: string,
  entityId: string,
): Promise<DocumentLinkWithMetadata[]> {
  const params = new URLSearchParams({ entityType, entityId });
  return get<{ documentLinks: DocumentLinkWithMetadata[] }>(
    `/document-links?${params.toString()}`,
  ).then((r) => r.documentLinks);
}

/**
 * Creates a new document link between a Cornerstone entity and a Paperless-ngx document.
 */
export function createDocumentLink(data: CreateDocumentLinkRequest): Promise<DocumentLink> {
  return post<{ documentLink: DocumentLink }>('/document-links', data).then((r) => r.documentLink);
}

/**
 * Deletes a document link by its ID. The response carries the Undo token that restores it.
 */
export function deleteDocumentLink(id: string): Promise<DeleteDocumentLinkResponse> {
  return del<DeleteDocumentLinkResponse>(`/document-links/${id}`);
}

/**
 * Returns the distinct set of Paperless-ngx document IDs linked to any entity
 * in the system.
 */
export function listAllLinkedDocumentIds(): Promise<number[]> {
  return get<AllLinkedDocumentIdsResponse>('/document-links/linked-ids').then(
    (r) => r.paperlessDocumentIds,
  );
}

/**
 * Updates (or clears) the attachment type tag on a document link.
 * Non-invoice links are normalized to null regardless of the requested value.
 */
export function updateDocumentLinkAttachmentType(
  id: string,
  attachmentType: AttachmentType | null,
): Promise<DocumentLink> {
  return patch<{ documentLink: DocumentLink }>(`/document-links/${id}`, {
    attachmentType,
  } satisfies UpdateDocumentLinkRequest).then((r) => r.documentLink);
}

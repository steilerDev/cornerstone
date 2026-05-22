import { get, post, del } from './apiClient.js';
import type {
  DocumentLink,
  DocumentLinkWithMetadata,
  CreateDocumentLinkRequest,
  AllLinkedDocumentIdsResponse,
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
 * Deletes a document link by its ID.
 */
export function deleteDocumentLink(id: string): Promise<void> {
  return del<void>(`/document-links/${id}`);
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

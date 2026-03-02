import { get, post, del } from './apiClient.js';
import type {
  DocumentLink,
  DocumentLinkWithMetadata,
  CreateDocumentLinkRequest,
} from '@cornerstone/shared';

/**
 * Lists all document links for a given entity.
 */
export function listDocumentLinks(
  entityType: string,
  entityId: string,
): Promise<DocumentLinkWithMetadata[]> {
  return get<{ documentLinks: DocumentLinkWithMetadata[] }>(
    `/document-links?entityType=${entityType}&entityId=${entityId}`,
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

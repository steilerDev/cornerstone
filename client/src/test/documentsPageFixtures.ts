import type {
  DocumentLinkEntityType,
  DocumentLinkWithEntity,
  PaperlessDocument,
  PaperlessDocumentSearchResult,
  PaperlessStatusResponse,
  PaperlessTag,
} from '@cornerstone/shared';

/** Synthetic Paperless tag. */
export function makeTag(id: number, name: string): PaperlessTag {
  return { id, name, color: null, documentCount: 0 };
}

/** Synthetic list row of the Documents page. */
export function makeDocument(
  id: number,
  overrides: Partial<PaperlessDocumentSearchResult> = {},
): PaperlessDocumentSearchResult {
  return {
    id,
    title: `Document ${id}`,
    content: null,
    tags: [],
    created: '2026-02-03',
    added: '2026-02-04T09:00:00Z',
    modified: '2026-02-05T09:00:00Z',
    correspondent: null,
    documentType: 'Contract',
    archiveSerialNumber: null,
    originalFileName: `document-${id}.pdf`,
    pageCount: 2,
    searchHit: null,
    ...overrides,
  };
}

/** Synthetic detail of one document (carries content). */
export function makeDocumentDetail(
  id: number,
  overrides: Partial<PaperlessDocument> = {},
): PaperlessDocument {
  const { searchHit: _unused, ...detail } = makeDocument(id, {
    content: `Synthetic text of document ${id}.`,
    correspondent: 'Sample Roofing Ltd',
  });
  void _unused;
  return { ...detail, ...overrides };
}

/** Synthetic Paperless status: configured and reachable unless overridden. */
export function makePaperlessStatus(
  overrides: Partial<PaperlessStatusResponse> = {},
): PaperlessStatusResponse {
  return {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paperless.example.test',
    filterTag: null,
    ...overrides,
  };
}

/** Synthetic link of a document to a record, with the record summary (null: the record is gone). */
export function makeLinkWithEntity(
  id: string,
  entityType: DocumentLinkEntityType,
  entityId: string,
  entity: DocumentLinkWithEntity['entity'],
  paperlessDocumentId = 7,
): DocumentLinkWithEntity {
  return {
    id,
    entityType,
    entityId,
    paperlessDocumentId,
    attachmentType: null,
    createdBy: null,
    createdAt: '2026-02-06T09:00:00Z',
    entity,
  };
}

/** Entity summary of a non-invoice record. */
export function plainEntity(title: string | null): DocumentLinkWithEntity['entity'] {
  return { title, vendorName: null, invoiceStatus: null };
}

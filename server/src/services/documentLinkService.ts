/**
 * Document link service — CRUD for linking Paperless-ngx documents to Cornerstone entities.
 *
 * EPIC-08: Paperless-ngx Document Integration
 *
 * Manages the polymorphic `document_links` table. Referential integrity on the entity
 * side is enforced at the application layer (entity existence check on insert;
 * cascade-delete of links when an entity is deleted).
 *
 * See ADR-015 for design rationale.
 */

import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  documentLinks,
  users,
  workItems,
  invoices,
  householdItems,
  budgetSources,
  subsidyPrograms,
} from '../db/schema.js';
import { AppError, ConflictError, NotFoundError } from '../errors/AppError.js';
import type {
  DocumentLink,
  DocumentLinkWithMetadata,
  DocumentLinkEntityType,
  PaperlessDocument,
  AttachmentType,
} from '@cornerstone/shared';
import * as paperlessService from './paperlessService.js';
import type { UndoTransaction } from './undoService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Paperless-ngx configuration needed for metadata enrichment.
 */
interface PaperlessConfig {
  paperlessEnabled: boolean;
  paperlessUrl?: string | null;
  paperlessApiToken?: string | null;
  paperlessFilterTag?: string | null;
}

/**
 * Map a document_links row + resolved user to a DocumentLink shape.
 */
function toDocumentLink(
  row: typeof documentLinks.$inferSelect,
  user: typeof users.$inferSelect | null | undefined,
): DocumentLink {
  return {
    id: row.id,
    entityType: row.entityType as DocumentLinkEntityType,
    entityId: row.entityId,
    paperlessDocumentId: row.paperlessDocumentId,
    attachmentType: (row.attachmentType as AttachmentType | null) ?? null,
    createdBy: user ? { id: user.id, displayName: user.displayName } : null,
    createdAt: row.createdAt,
  };
}

/**
 * Resolve the user who created a document link.
 */
function resolveCreatedBy(db: DbType, createdBy: string | null): typeof users.$inferSelect | null {
  if (!createdBy) return null;
  return db.select().from(users).where(eq(users.id, createdBy)).get() ?? null;
}

const ENTITY_NOT_FOUND_MESSAGES: Record<DocumentLinkEntityType, string> = {
  work_item: 'Work item not found',
  invoice: 'Invoice not found',
  household_item: 'Household item not found',
  budget_source: 'Budget source not found',
  subsidy_program: 'Subsidy program not found',
};

/**
 * True when the linked record exists (application-layer FK for the polymorphic entity_id).
 */
export function entityExists(
  db: Pick<DbType, 'select'>,
  entityType: DocumentLinkEntityType,
  entityId: string,
): boolean {
  switch (entityType) {
    case 'work_item':
      return !!db
        .select({ id: workItems.id })
        .from(workItems)
        .where(eq(workItems.id, entityId))
        .get();
    case 'invoice':
      return !!db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, entityId)).get();
    case 'household_item':
      return !!db
        .select({ id: householdItems.id })
        .from(householdItems)
        .where(eq(householdItems.id, entityId))
        .get();
    case 'budget_source':
      return !!db
        .select({ id: budgetSources.id })
        .from(budgetSources)
        .where(eq(budgetSources.id, entityId))
        .get();
    case 'subsidy_program':
      return !!db
        .select({ id: subsidyPrograms.id })
        .from(subsidyPrograms)
        .where(eq(subsidyPrograms.id, entityId))
        .get();
  }
}

/**
 * Create a link between a Cornerstone entity and a Paperless-ngx document.
 *
 * Validates that the entity exists at the application layer (no FK constraint
 * on entity_id since it references different tables depending on entity_type).
 *
 * AttachmentType is meaningful only for entityType='invoice'; it is silently
 * normalized to null for all other entity types (application-layer enforcement
 * since the database CHECK allows null).
 *
 * @throws NotFoundError if the referenced entity does not exist
 * @throws AppError(VALIDATION_ERROR) if entity type is not yet implemented
 * @throws AppError(DUPLICATE_DOCUMENT_LINK) if this exact link already exists
 */
export function createLink(
  db: DbType,
  entityType: DocumentLinkEntityType,
  entityId: string,
  paperlessDocumentId: number,
  userId: string,
  attachmentType: AttachmentType | null = null,
): DocumentLink {
  // Validate entity exists (application-layer FK enforcement)
  if (!entityExists(db, entityType, entityId)) {
    throw new NotFoundError(ENTITY_NOT_FOUND_MESSAGES[entityType]);
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // Resolve userId to null if user no longer exists (FK is nullable with ON DELETE SET NULL)
  const userExists = resolveCreatedBy(db, userId) !== null;
  const createdBy = userExists ? userId : null;

  // Normalize attachmentType: only meaningful for invoice entity type
  const resolvedAttachmentType = entityType === 'invoice' ? attachmentType : null;

  try {
    db.insert(documentLinks)
      .values({
        id,
        entityType,
        entityId,
        paperlessDocumentId,
        attachmentType: resolvedAttachmentType,
        createdBy,
        createdAt,
      })
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE constraint failed')) {
      throw new AppError(
        'DUPLICATE_DOCUMENT_LINK',
        409,
        'This document is already linked to this entity',
      );
    }
    throw err;
  }

  const row = db.select().from(documentLinks).where(eq(documentLinks.id, id)).get()!;
  const user = resolveCreatedBy(db, row.createdBy);
  return toDocumentLink(row, user);
}

/**
 * Get all document links for an entity, enriched with Paperless-ngx document metadata.
 *
 * If Paperless-ngx is not configured or a document has been deleted from Paperless-ngx,
 * the `document` field will be `null` for that link.
 * The `content` field is set to `null` on all documents (list view — use detail endpoint for content).
 */
export async function getLinksForEntity(
  db: DbType,
  entityType: DocumentLinkEntityType,
  entityId: string,
  config: PaperlessConfig,
): Promise<DocumentLinkWithMetadata[]> {
  const rows = db
    .select()
    .from(documentLinks)
    .where(and(eq(documentLinks.entityType, entityType), eq(documentLinks.entityId, entityId)))
    .all();

  if (rows.length === 0) return [];

  // Resolve user for each link (most links will share the same creator)
  const userCache = new Map<string, typeof users.$inferSelect | null>();
  const resolveUser = (createdBy: string | null) => {
    if (!createdBy) return null;
    const cached = userCache.get(createdBy);
    if (cached !== undefined) return cached;
    const user = resolveCreatedBy(db, createdBy);
    userCache.set(createdBy, user);
    return user;
  };

  // Bulk-fetch all Paperless-ngx document metadata in a single API call
  // (avoids N×4 sequential requests that the old per-document approach required)
  let docsBulk: Map<number, PaperlessDocument> = new Map();
  if (config.paperlessEnabled && config.paperlessUrl && config.paperlessApiToken) {
    try {
      docsBulk = await paperlessService.getDocuments(
        config.paperlessUrl,
        config.paperlessApiToken,
        rows.map((r) => r.paperlessDocumentId),
        config.paperlessFilterTag,
      );
    } catch {
      // Paperless-ngx unreachable — all documents will appear as null
    }
  }

  const enriched: DocumentLinkWithMetadata[] = rows.map((row) => {
    const user = resolveUser(row.createdBy);
    const base = toDocumentLink(row, user);
    const doc = docsBulk.get(row.paperlessDocumentId) ?? null;
    // content is already null in bulk results (list view — use GET /api/paperless/documents/:id for full content)
    return { ...base, document: doc };
  });

  return enriched;
}

/** Snapshot of a deleted document link, used to restore it (contract 11). */
export interface DeletedDocumentLinkSnapshot {
  readonly row: typeof documentLinks.$inferSelect;
}

/**
 * Read a document link and delete it in one transaction.
 *
 * @returns the snapshot, or null when the link does not exist
 */
export function deleteLinkWithSnapshot(db: DbType, id: string): DeletedDocumentLinkSnapshot | null {
  return db.transaction((tx) => {
    const row = tx.select().from(documentLinks).where(eq(documentLinks.id, id)).get();
    if (!row) return null;
    tx.delete(documentLinks).where(eq(documentLinks.id, id)).run();
    return { row };
  });
}

/**
 * Re-insert a deleted document link with its original id.
 *
 * @throws ConflictError (details.changed) when the linked record is gone, the same document
 *   was linked again to the same record in the meantime, or the id is taken
 */
export function restoreDeletedLink(
  tx: UndoTransaction,
  snapshot: DeletedDocumentLinkSnapshot,
): void {
  const { row } = snapshot;
  const changed = { changed: [{ type: 'document_link', id: row.id }] };
  const refuse = (): never => {
    throw new ConflictError('The record changed after this action', changed);
  };

  const entityType = row.entityType as DocumentLinkEntityType;
  if (!entityExists(tx, entityType, row.entityId)) refuse();

  const relinked = tx
    .select({ id: documentLinks.id })
    .from(documentLinks)
    .where(
      and(
        eq(documentLinks.entityType, row.entityType),
        eq(documentLinks.entityId, row.entityId),
        eq(documentLinks.paperlessDocumentId, row.paperlessDocumentId),
      ),
    )
    .get();
  if (relinked) refuse();

  const idTaken = tx
    .select({ id: documentLinks.id })
    .from(documentLinks)
    .where(eq(documentLinks.id, row.id))
    .get();
  if (idTaken) refuse();

  const creator = row.createdBy
    ? tx.select({ id: users.id }).from(users).where(eq(users.id, row.createdBy)).get()
    : undefined;

  tx.insert(documentLinks)
    .values({ ...row, createdBy: creator ? row.createdBy : null })
    .run();
}

/**
 * Delete all document links for a given entity.
 * Used for cascade deletion when an entity (work item, invoice) is deleted.
 *
 * This is required because entity_id has no FK constraint in the database
 * (polymorphic pattern — referential integrity is enforced at the application layer).
 */
export function deleteLinksForEntity(
  db: DbType,
  entityType: DocumentLinkEntityType,
  entityId: string,
): void {
  db.delete(documentLinks)
    .where(and(eq(documentLinks.entityType, entityType), eq(documentLinks.entityId, entityId)))
    .run();
}

/**
 * Return the distinct set of Paperless-ngx document IDs linked to any entity in the system.
 * Used by the frontend to implement system-wide "hide already-linked" filtering.
 */
export function getAllLinkedDocumentIds(db: DbType): number[] {
  const rows = db
    .selectDistinct({ paperlessDocumentId: documentLinks.paperlessDocumentId })
    .from(documentLinks)
    .all();
  return rows.map((r) => r.paperlessDocumentId);
}

/**
 * Update (or clear) the attachment type tag on a document link.
 * Non-invoice links are normalized to null regardless of the requested value —
 * attachment typing is only meaningful for entityType='invoice'.
 *
 * @throws NotFoundError if the link does not exist
 */
export function updateAttachmentType(
  db: DbType,
  id: string,
  attachmentType: AttachmentType | null,
): DocumentLink {
  const existing = db.select().from(documentLinks).where(eq(documentLinks.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Document link not found');
  }
  const resolved = existing.entityType === 'invoice' ? attachmentType : null;
  db.update(documentLinks).set({ attachmentType: resolved }).where(eq(documentLinks.id, id)).run();
  const row = db.select().from(documentLinks).where(eq(documentLinks.id, id)).get()!;
  const user = resolveCreatedBy(db, row.createdBy);
  return toDocumentLink(row, user);
}

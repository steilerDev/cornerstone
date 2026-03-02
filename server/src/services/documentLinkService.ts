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
import { documentLinks, users, workItems, invoices } from '../db/schema.js';
import { AppError, NotFoundError } from '../errors/AppError.js';
import type {
  DocumentLink,
  DocumentLinkWithMetadata,
  DocumentLinkEntityType,
} from '@cornerstone/shared';
import * as paperlessService from './paperlessService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Paperless-ngx configuration needed for metadata enrichment.
 */
interface PaperlessConfig {
  paperlessEnabled: boolean;
  paperlessUrl?: string | null;
  paperlessApiToken?: string | null;
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

/**
 * Create a link between a Cornerstone entity and a Paperless-ngx document.
 *
 * Validates that the entity exists at the application layer (no FK constraint
 * on entity_id since it references different tables depending on entity_type).
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
): DocumentLink {
  // Validate entity exists (application-layer FK enforcement)
  if (entityType === 'work_item') {
    const item = db.select().from(workItems).where(eq(workItems.id, entityId)).get();
    if (!item) {
      throw new NotFoundError('Work item not found');
    }
  } else if (entityType === 'invoice') {
    const invoice = db.select().from(invoices).where(eq(invoices.id, entityId)).get();
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }
  } else if (entityType === 'household_item') {
    // EPIC-04 not yet implemented — household_items table does not exist
    throw new AppError('VALIDATION_ERROR', 400, 'Household items are not yet implemented');
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // Resolve userId to null if user no longer exists (FK is nullable with ON DELETE SET NULL)
  const userExists = resolveCreatedBy(db, userId) !== null;
  const createdBy = userExists ? userId : null;

  try {
    db.insert(documentLinks)
      .values({
        id,
        entityType,
        entityId,
        paperlessDocumentId,
        createdBy,
        createdAt,
      })
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE constraint failed')) {
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
    if (!userCache.has(createdBy)) {
      userCache.set(createdBy, resolveCreatedBy(db, createdBy));
    }
    return userCache.get(createdBy) ?? null;
  };

  // Enrich with Paperless-ngx metadata in parallel
  const enriched: DocumentLinkWithMetadata[] = await Promise.all(
    rows.map(async (row) => {
      const user = resolveUser(row.createdBy);
      const base = toDocumentLink(row, user);

      if (!config.paperlessEnabled || !config.paperlessUrl || !config.paperlessApiToken) {
        return { ...base, document: null };
      }

      try {
        const doc = await paperlessService.getDocument(
          config.paperlessUrl,
          config.paperlessApiToken,
          row.paperlessDocumentId,
        );
        // Strip content for list view (use GET /api/paperless/documents/:id for full content)
        return { ...base, document: { ...doc, content: null } };
      } catch {
        // Document deleted from Paperless-ngx or unreachable — return null document
        return { ...base, document: null };
      }
    }),
  );

  return enriched;
}

/**
 * Delete a document link by ID.
 *
 * @returns true if the link was found and deleted, false if not found
 */
export function deleteLink(db: DbType, id: string): boolean {
  const existing = db.select().from(documentLinks).where(eq(documentLinks.id, id)).get();
  if (!existing) return false;
  db.delete(documentLinks).where(eq(documentLinks.id, id)).run();
  return true;
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

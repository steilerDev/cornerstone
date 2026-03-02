/**
 * Unit tests for documentLinkService.ts
 *
 * Tests cover:
 * - createLink (success, entity not found, duplicate, household_item not implemented)
 * - getLinksForEntity (empty, with links, Paperless not configured, Paperless error/404)
 * - deleteLink (success, not found)
 * - deleteLinksForEntity (cleans up all links for entity)
 *
 * Strategy:
 * - Fresh in-memory SQLite per test with migrations applied
 * - global.fetch mocked for paperlessService calls (getDocument)
 * - paperlessService.getDocument is called via real service code (not mocked at module level)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as documentLinkService from './documentLinkService.js';
import { type AppError, NotFoundError } from '../errors/AppError.js';
import type { DocumentLinkEntityType } from '@cornerstone/shared';

// ─── Mock global fetch (used by paperlessService.getDocument) ─────────────────

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ─── Mock response helpers ────────────────────────────────────────────────────

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

// ─── Paperless-ngx raw fixture ────────────────────────────────────────────────

const RAW_TAG = { id: 5, name: 'invoice', colour: 6, document_count: 15 };
const RAW_TAGS_RESPONSE = { count: 1, results: [RAW_TAG] };

const RAW_DOCUMENT = {
  id: 42,
  title: 'Invoice from Builder Co',
  content: 'Full text content here.',
  tags: [5],
  created: '2026-01-15T00:00:00Z',
  added: '2026-01-16T08:30:00Z',
  modified: '2026-01-16T08:30:00Z',
  correspondent: null,
  document_type: null,
  archive_serial_number: 1042,
  original_file_name: 'invoice-2026-001.pdf',
  page_count: 2,
};

// ─── Test database setup ──────────────────────────────────────────────────────

describe('documentLinkService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(id = 'user-001', email = 'test@example.com', displayName = 'Test User') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertTestWorkItem(title = 'Test Work Item', userId = 'user-001') {
    const id = `wi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertTestVendor(name = 'Test Vendor') {
    const id = `vendor-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name,
        specialty: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertTestInvoice(vendorId: string, amount = 100) {
    const id = `inv-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: `INV-${idCounter}`,
        amount,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        workItemBudgetId: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a document link directly (bypassing service for test setup).
   */
  function insertRawDocumentLink(
    entityType: DocumentLinkEntityType,
    entityId: string,
    paperlessDocumentId: number,
    userId = 'user-001',
  ) {
    const id = `link-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.documentLinks)
      .values({ id, entityType, entityId, paperlessDocumentId, createdBy: userId, createdAt: now })
      .run();
    return id;
  }

  const PAPERLESS_CONFIG_DISABLED = {
    paperlessEnabled: false,
    paperlessUrl: null,
    paperlessApiToken: null,
  };

  const PAPERLESS_CONFIG_ENABLED = {
    paperlessEnabled: true,
    paperlessUrl: 'http://paperless:8000',
    paperlessApiToken: 'test-token',
  };

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── createLink() ──────────────────────────────────────────────────────────

  describe('createLink()', () => {
    it('creates a document link for a work item and returns the DocumentLink shape', () => {
      const workItemId = insertTestWorkItem();

      const result = documentLinkService.createLink(db, 'work_item', workItemId, 42, 'user-001');

      expect(result.entityType).toBe('work_item');
      expect(result.entityId).toBe(workItemId);
      expect(result.paperlessDocumentId).toBe(42);
      expect(result.createdBy).toEqual({ id: 'user-001', displayName: 'Test User' });
      expect(result.createdAt).toBeTruthy();
      expect(result.id).toBeTruthy();
    });

    it('creates a document link for an invoice', () => {
      const vendorId = insertTestVendor();
      const invoiceId = insertTestInvoice(vendorId);

      const result = documentLinkService.createLink(db, 'invoice', invoiceId, 99, 'user-001');

      expect(result.entityType).toBe('invoice');
      expect(result.entityId).toBe(invoiceId);
      expect(result.paperlessDocumentId).toBe(99);
      expect(result.createdBy).toEqual({ id: 'user-001', displayName: 'Test User' });
    });

    it('returns createdBy: null when user does not exist', () => {
      const workItemId = insertTestWorkItem();

      const result = documentLinkService.createLink(
        db,
        'work_item',
        workItemId,
        42,
        'non-existent-user',
      );

      expect(result.createdBy).toBeNull();
    });

    it('throws NotFoundError when work item does not exist', () => {
      expect(() => {
        documentLinkService.createLink(db, 'work_item', 'non-existent-id', 42, 'user-001');
      }).toThrow(NotFoundError);

      expect(() => {
        documentLinkService.createLink(db, 'work_item', 'non-existent-id', 42, 'user-001');
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError when invoice does not exist', () => {
      expect(() => {
        documentLinkService.createLink(db, 'invoice', 'non-existent-id', 42, 'user-001');
      }).toThrow(NotFoundError);

      expect(() => {
        documentLinkService.createLink(db, 'invoice', 'non-existent-id', 42, 'user-001');
      }).toThrow('Invoice not found');
    });

    it('throws VALIDATION_ERROR for household_item (not yet implemented)', () => {
      let error: AppError | undefined;
      try {
        documentLinkService.createLink(db, 'household_item', 'any-id', 42, 'user-001');
      } catch (err) {
        error = err as AppError;
      }
      expect(error).toBeDefined();
      expect(error?.code).toBe('VALIDATION_ERROR');
      expect(error?.statusCode).toBe(400);
      expect(error?.message).toContain('not yet implemented');
    });

    it('throws DUPLICATE_DOCUMENT_LINK when same link already exists', () => {
      const workItemId = insertTestWorkItem();

      // First link succeeds
      documentLinkService.createLink(db, 'work_item', workItemId, 42, 'user-001');

      // Second identical link should throw
      let error: AppError | undefined;
      try {
        documentLinkService.createLink(db, 'work_item', workItemId, 42, 'user-001');
      } catch (err) {
        error = err as AppError;
      }
      expect(error).toBeDefined();
      expect(error?.code).toBe('DUPLICATE_DOCUMENT_LINK');
      expect(error?.statusCode).toBe(409);
    });

    it('allows same document linked to different entities', () => {
      const workItem1 = insertTestWorkItem('Item 1');
      const workItem2 = insertTestWorkItem('Item 2');

      const link1 = documentLinkService.createLink(db, 'work_item', workItem1, 42, 'user-001');
      const link2 = documentLinkService.createLink(db, 'work_item', workItem2, 42, 'user-001');

      expect(link1.id).not.toBe(link2.id);
      expect(link1.entityId).toBe(workItem1);
      expect(link2.entityId).toBe(workItem2);
    });

    it('allows different documents linked to the same entity', () => {
      const workItemId = insertTestWorkItem();

      const link1 = documentLinkService.createLink(db, 'work_item', workItemId, 42, 'user-001');
      const link2 = documentLinkService.createLink(db, 'work_item', workItemId, 99, 'user-001');

      expect(link1.id).not.toBe(link2.id);
      expect(link1.paperlessDocumentId).toBe(42);
      expect(link2.paperlessDocumentId).toBe(99);
    });

    it('persists the link to the database', () => {
      const workItemId = insertTestWorkItem();

      const result = documentLinkService.createLink(db, 'work_item', workItemId, 42, 'user-001');

      const all = db.select().from(schema.documentLinks).all();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(result.id);
      expect(all[0].entityType).toBe('work_item');
      expect(all[0].entityId).toBe(workItemId);
      expect(all[0].paperlessDocumentId).toBe(42);
    });
  });

  // ─── getLinksForEntity() ───────────────────────────────────────────────────

  describe('getLinksForEntity()', () => {
    it('returns empty array when no links exist for the entity', async () => {
      const workItemId = insertTestWorkItem();

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_DISABLED,
      );

      expect(result).toEqual([]);
    });

    it('returns links with document: null when Paperless is not configured', async () => {
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42);
      insertRawDocumentLink('work_item', workItemId, 99);

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_DISABLED,
      );

      expect(result).toHaveLength(2);
      expect(result[0].entityType).toBe('work_item');
      expect(result[0].entityId).toBe(workItemId);
      expect(result[0].document).toBeNull();
      expect(result[1].document).toBeNull();
    });

    it('returns links enriched with document metadata when Paperless is configured', async () => {
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42);

      // Mock: document fetch first, then tags (paperlessService.getDocument order)
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(RAW_DOCUMENT)) // document fetch
        .mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE)); // tags for mapDocument

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_ENABLED,
      );

      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('work_item');
      expect(result[0].paperlessDocumentId).toBe(42);
      expect(result[0].document).not.toBeNull();
      expect(result[0].document?.id).toBe(42);
      expect(result[0].document?.title).toBe('Invoice from Builder Co');
      // content must be null in list response
      expect(result[0].document?.content).toBeNull();
      // Tags should be resolved
      expect(result[0].document?.tags).toHaveLength(1);
      expect(result[0].document?.tags[0].name).toBe('invoice');
    });

    it('sets content to null even when Paperless returns content', async () => {
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42);

      mockFetch
        .mockResolvedValueOnce(mockJsonResponse({ ...RAW_DOCUMENT, content: 'Rich full text' }))
        .mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_ENABLED,
      );

      expect(result[0].document?.content).toBeNull();
    });

    it('returns document: null for a specific link when document not found in Paperless', async () => {
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42);
      insertRawDocumentLink('work_item', workItemId, 99);

      // getDocument order: document fetch first, then tags (per paperlessService.getDocument)
      // Because both run in parallel via Promise.all in getLinksForEntity, order may vary.
      // Use mockResolvedValue for all calls to avoid order sensitivity.
      mockFetch.mockImplementation(async (url: RequestInfo | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/documents/99/')) {
          return mockJsonResponse({ detail: 'Not found' }, 404);
        }
        if (urlStr.includes('/api/documents/42/')) {
          return mockJsonResponse(RAW_DOCUMENT);
        }
        if (urlStr.includes('/api/tags/')) {
          return mockJsonResponse(RAW_TAGS_RESPONSE);
        }
        return mockJsonResponse({}, 200);
      });

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_ENABLED,
      );

      expect(result).toHaveLength(2);
      const linkFor42 = result.find((l) => l.paperlessDocumentId === 42);
      const linkFor99 = result.find((l) => l.paperlessDocumentId === 99);
      expect(linkFor42?.document).not.toBeNull();
      expect(linkFor99?.document).toBeNull();
    });

    it('returns document: null when Paperless is unreachable for a link', async () => {
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42);

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_ENABLED,
      );

      expect(result).toHaveLength(1);
      expect(result[0].document).toBeNull();
    });

    it('only returns links for the specified entity, not others', async () => {
      const workItem1 = insertTestWorkItem('Item 1');
      const workItem2 = insertTestWorkItem('Item 2');
      insertRawDocumentLink('work_item', workItem1, 42);
      insertRawDocumentLink('work_item', workItem2, 99);

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItem1,
        PAPERLESS_CONFIG_DISABLED,
      );

      expect(result).toHaveLength(1);
      expect(result[0].entityId).toBe(workItem1);
      expect(result[0].paperlessDocumentId).toBe(42);
    });

    it('resolves createdBy user information', async () => {
      insertTestUser('user-002', 'other@example.com', 'Other User');
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42, 'user-002');

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_DISABLED,
      );

      expect(result[0].createdBy).toEqual({ id: 'user-002', displayName: 'Other User' });
    });

    it('returns createdBy: null when user has been deleted', async () => {
      const workItemId = insertTestWorkItem();

      // Insert link with a non-existent user ID (simulates deleted user)
      const id = `link-direct-${++idCounter}`;
      const now = new Date().toISOString();
      db.insert(schema.documentLinks)
        .values({
          id,
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
          createdBy: null,
          createdAt: now,
        })
        .run();

      const result = await documentLinkService.getLinksForEntity(
        db,
        'work_item',
        workItemId,
        PAPERLESS_CONFIG_DISABLED,
      );

      expect(result[0].createdBy).toBeNull();
    });

    it('returns links for invoice entity type', async () => {
      const vendorId = insertTestVendor();
      const invoiceId = insertTestInvoice(vendorId);
      insertRawDocumentLink('invoice', invoiceId, 55);

      const result = await documentLinkService.getLinksForEntity(
        db,
        'invoice',
        invoiceId,
        PAPERLESS_CONFIG_DISABLED,
      );

      expect(result).toHaveLength(1);
      expect(result[0].entityType).toBe('invoice');
      expect(result[0].entityId).toBe(invoiceId);
      expect(result[0].paperlessDocumentId).toBe(55);
    });
  });

  // ─── deleteLink() ──────────────────────────────────────────────────────────

  describe('deleteLink()', () => {
    it('returns true and deletes the link when found', () => {
      const workItemId = insertTestWorkItem();
      const linkId = insertRawDocumentLink('work_item', workItemId, 42);

      const result = documentLinkService.deleteLink(db, linkId);

      expect(result).toBe(true);
      const remaining = db.select().from(schema.documentLinks).all();
      expect(remaining).toHaveLength(0);
    });

    it('returns false when link does not exist', () => {
      const result = documentLinkService.deleteLink(db, 'non-existent-id');

      expect(result).toBe(false);
    });

    it('only deletes the specified link, not others', () => {
      const workItemId = insertTestWorkItem();
      const linkId1 = insertRawDocumentLink('work_item', workItemId, 42);
      insertRawDocumentLink('work_item', workItemId, 99);

      documentLinkService.deleteLink(db, linkId1);

      const remaining = db.select().from(schema.documentLinks).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].paperlessDocumentId).toBe(99);
    });
  });

  // ─── deleteLinksForEntity() ────────────────────────────────────────────────

  describe('deleteLinksForEntity()', () => {
    it('deletes all links for a given work item entity', () => {
      const workItemId = insertTestWorkItem();
      insertRawDocumentLink('work_item', workItemId, 42);
      insertRawDocumentLink('work_item', workItemId, 99);

      documentLinkService.deleteLinksForEntity(db, 'work_item', workItemId);

      const remaining = db.select().from(schema.documentLinks).all();
      expect(remaining).toHaveLength(0);
    });

    it('only deletes links for the specified entity, not others', () => {
      const workItem1 = insertTestWorkItem('Item 1');
      const workItem2 = insertTestWorkItem('Item 2');
      insertRawDocumentLink('work_item', workItem1, 42);
      insertRawDocumentLink('work_item', workItem2, 99);

      documentLinkService.deleteLinksForEntity(db, 'work_item', workItem1);

      const remaining = db.select().from(schema.documentLinks).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].entityId).toBe(workItem2);
    });

    it('does not delete links for different entity types with same ID', () => {
      const entityId = 'shared-id';

      // Insert link for work_item type
      const now = new Date().toISOString();
      db.insert(schema.documentLinks)
        .values({
          id: 'link-wi',
          entityType: 'work_item',
          entityId,
          paperlessDocumentId: 42,
          createdBy: null,
          createdAt: now,
        })
        .run();

      // Invoice type with same entity ID — must NOT be deleted by work_item cascade
      db.insert(schema.documentLinks)
        .values({
          id: 'link-inv',
          entityType: 'invoice',
          entityId,
          paperlessDocumentId: 42,
          createdBy: null,
          createdAt: now,
        })
        .run();

      documentLinkService.deleteLinksForEntity(db, 'work_item', entityId);

      const remaining = db.select().from(schema.documentLinks).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].entityType).toBe('invoice');
    });

    it('is a no-op when no links exist for the entity', () => {
      // Should not throw
      expect(() => {
        documentLinkService.deleteLinksForEntity(db, 'work_item', 'no-links-here');
      }).not.toThrow();
    });
  });
});

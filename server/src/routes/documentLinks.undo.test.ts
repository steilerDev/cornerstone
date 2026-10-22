/**
 * End-to-end (real services, real undo store) tests for the undoable document-link unlink
 * (#2233): DELETE /api/document-links/:id issues an Undo token, POST /api/undo/:token restores
 * the row with its original id, attachment type and timestamp (contract 11).
 * All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  DeleteDocumentLinkResponse,
  DocumentLinkResponse,
  UndoResponse,
} from '@cornerstone/shared';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { undoStore } from '../services/undoService.js';
import { documentLinks, users, workItems } from '../db/schema.js';

describe('Document link unlink Undo (real flow)', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-doclink-undo-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    delete process.env.PAPERLESS_URL;
    delete process.env.PAPERLESS_API_TOKEN;
    app = await buildApp();
    undoStore.snapshots.clear();
  });

  afterEach(async () => {
    if (app) await app.close();
    undoStore.snapshots.clear();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  async function session(email: string): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, email, 'password-1234', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { userId: user.id, cookie: `cornerstone_session=${token}` };
  }

  async function createWorkItem(cookie: string, title = 'Task A'): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/work-items',
      headers: { cookie },
      payload: { title },
    });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  async function createVendorInvoice(cookie: string): Promise<string> {
    const vendor = await app.inject({
      method: 'POST',
      url: '/api/vendors',
      headers: { cookie },
      payload: { name: 'Fixture vendor' },
    });
    const vendorId = vendor.json<{ vendor: { id: string } }>().vendor.id;
    const invoice = await app.inject({
      method: 'POST',
      url: `/api/vendors/${vendorId}/invoices`,
      headers: { cookie },
      payload: { amount: 100, date: '2026-01-15' },
    });
    expect(invoice.statusCode).toBe(201);
    return invoice.json<{ invoice: { id: string } }>().invoice.id;
  }

  async function link(
    cookie: string,
    entityType: string,
    entityId: string,
    paperlessDocumentId: number,
    attachmentType?: string,
  ): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/document-links',
      headers: { cookie },
      payload: { entityType, entityId, paperlessDocumentId, attachmentType },
    });
    expect(res.statusCode).toBe(201);
    return res.json<DocumentLinkResponse>().documentLink.id;
  }

  async function unlink(cookie: string, id: string): Promise<string> {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/document-links/${id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    return res.json<DeleteDocumentLinkResponse>().undo.token;
  }

  function undo(cookie: string, token: string) {
    return app.inject({ method: 'POST', url: `/api/undo/${token}`, headers: { cookie } });
  }

  function rows() {
    return app.db.select().from(documentLinks).all();
  }

  it('DELETE answers 200 with a token and the Undo restores the row byte-identical', async () => {
    const { cookie, userId } = await session('a@example.com');
    const invoiceId = await createVendorInvoice(cookie);
    const id = await link(cookie, 'invoice', invoiceId, 42, 'quotation');
    const before = rows()[0]!;
    expect(before.createdBy).toBe(userId);

    const token = await unlink(cookie, id);
    expect(token).toMatch(/^u_[0-9a-f]{32}$/);
    expect(rows()).toHaveLength(0);

    const res = await undo(cookie, token);

    expect(res.statusCode).toBe(200);
    expect(res.json<UndoResponse>()).toEqual({
      restored: [{ type: 'document_link', id }],
      retractedEventIds: [],
    });
    expect(rows()).toEqual([before]);
  });

  it('answers 409 with details.changed when the linked record was deleted, and consumes the token', async () => {
    const { cookie } = await session('a@example.com');
    const workItemId = await createWorkItem(cookie);
    const id = await link(cookie, 'work_item', workItemId, 42);
    const token = await unlink(cookie, id);
    app.db.delete(workItems).where(eq(workItems.id, workItemId)).run();

    const res = await undo(cookie, token);

    expect(res.statusCode).toBe(409);
    const body = res.json<ApiErrorResponse>();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details).toEqual({ changed: [{ type: 'document_link', id }] });
    expect(rows()).toHaveLength(0);
    expect((await undo(cookie, token)).statusCode).toBe(404);
  });

  it('answers 409 when the work item delete cascaded the remaining links', async () => {
    const { cookie } = await session('a@example.com');
    const workItemId = await createWorkItem(cookie);
    const id = await link(cookie, 'work_item', workItemId, 42);
    const token = await unlink(cookie, id);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/work-items/${workItemId}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);

    const res = await undo(cookie, token);

    expect(res.statusCode).toBe(409);
    expect(rows()).toHaveLength(0);
  });

  it('answers 409 when the same document was linked again to the same record, keeping the new link', async () => {
    const { cookie } = await session('a@example.com');
    const workItemId = await createWorkItem(cookie);
    const id = await link(cookie, 'work_item', workItemId, 42);
    const token = await unlink(cookie, id);
    const relinkedId = await link(cookie, 'work_item', workItemId, 42);

    const res = await undo(cookie, token);

    expect(res.statusCode).toBe(409);
    expect(res.json<ApiErrorResponse>().error.details).toEqual({
      changed: [{ type: 'document_link', id }],
    });
    expect(rows().map((r) => r.id)).toEqual([relinkedId]);
    expect((await undo(cookie, token)).statusCode).toBe(404);
  });

  it('restores createdBy as null when the creating user was deleted meanwhile', async () => {
    const owner = await session('owner@example.com');
    const creator = await session('creator@example.com');
    const workItemId = await createWorkItem(owner.cookie);
    const id = await link(creator.cookie, 'work_item', workItemId, 42);
    const token = await unlink(owner.cookie, id);
    app.db.delete(users).where(eq(users.id, creator.userId)).run();

    const res = await undo(owner.cookie, token);

    expect(res.statusCode).toBe(200);
    const restored = rows();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(id);
    expect(restored[0]!.createdBy).toBeNull();
  });

  it('a second use of the token is 404 and does not duplicate the row', async () => {
    const { cookie } = await session('a@example.com');
    const workItemId = await createWorkItem(cookie);
    const id = await link(cookie, 'work_item', workItemId, 42);
    const token = await unlink(cookie, id);
    expect((await undo(cookie, token)).statusCode).toBe(200);

    const second = await undo(cookie, token);

    expect(second.statusCode).toBe(404);
    expect(rows()).toHaveLength(1);
  });

  it("another user's token attempt is 404, restores nothing and does not burn the owner token", async () => {
    const a = await session('a@example.com');
    const b = await session('b@example.com');
    const workItemId = await createWorkItem(a.cookie);
    const id = await link(a.cookie, 'work_item', workItemId, 42);
    const token = await unlink(a.cookie, id);

    const foreign = await undo(b.cookie, token);
    expect(foreign.statusCode).toBe(404);
    expect(rows()).toHaveLength(0);

    expect((await undo(a.cookie, token)).statusCode).toBe(200);
    expect(rows()).toHaveLength(1);
  });

  it('the cascade on entity delete issues no token (unlinking a gone link is 404)', async () => {
    const { cookie } = await session('a@example.com');
    const workItemId = await createWorkItem(cookie);
    const id = await link(cookie, 'work_item', workItemId, 42);
    await app.inject({
      method: 'DELETE',
      url: `/api/work-items/${workItemId}`,
      headers: { cookie },
    });
    const before = undoStore.snapshots.size;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/document-links/${id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(undoStore.snapshots.size).toBe(before);
  });

  it('unknown link id is 404 and issues no token', async () => {
    const { cookie } = await session('a@example.com');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/document-links/does-not-exist',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(undoStore.snapshots.size).toBe(0);
  });
});

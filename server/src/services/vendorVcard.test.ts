/**
 * Unit tests for vendorVcard service.
 *
 * Tests cover:
 *  - computeAddressBookETag: DB-driven ETag from real in-memory SQLite
 *  - buildVendorVcard: required fields, optional fields (email, phone, address, notes, URL),
 *    KIND:org injection, UID/REV injection, special character handling
 *  - buildContactVcard: required fields, optional fields (role, email, phone, notes, URL),
 *    UID/REV injection, null firstName/lastName handling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  computeAddressBookETag,
  buildVendorVcard,
  buildContactVcard,
} from './vendorVcard.js';

// ─── DB helpers ───────────────────────────────────────────────────────────────

type DbType = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function createTestDb(): DbType {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  const db = drizzle(sqliteDb, { schema });
  return Object.assign(db, { $client: sqliteDb }) as DbType;
}

// ─── Fixture factories ────────────────────────────────────────────────────────

type VendorInput = Parameters<typeof buildVendorVcard>[0];
type ContactInput = Parameters<typeof buildContactVcard>[0];

function makeVendor(overrides: Partial<VendorInput> = {}): VendorInput {
  return {
    id: 'vendor-abc',
    name: 'Acme Construction',
    tradeId: null,
    email: null,
    phone: null,
    address: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-03-15T08:00:00Z',
    ...overrides,
  };
}

function makeContact(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    id: 'contact-xyz',
    vendorId: 'vendor-abc',
    firstName: 'Alice',
    lastName: 'Smith',
    name: 'Alice Smith',
    role: null,
    email: null,
    phone: null,
    notes: null,
    updatedAt: '2026-03-15T08:00:00Z',
    ...overrides,
  };
}

// ─── computeAddressBookETag ───────────────────────────────────────────────────

describe('computeAddressBookETag', () => {
  let db: DbType;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    if (db.$client && db.$client.open) {
      db.$client.close();
    }
  });

  it('returns a 16-character hex string on an empty database', () => {
    const etag = computeAddressBookETag(db);
    expect(etag).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same ETag when nothing changes (idempotent)', () => {
    const a = computeAddressBookETag(db);
    const b = computeAddressBookETag(db);
    expect(a).toBe(b);
  });

  it('changes the ETag after inserting a vendor', () => {
    const before = computeAddressBookETag(db);

    const now = new Date().toISOString();
    const later = new Date(Date.now() + 1000).toISOString();
    db.insert(schema.vendors)
      .values({
        id: `vendor-${Date.now()}`,
        name: 'New Vendor Co',
        tradeId: null,
        email: null,
        phone: null,
        address: null,
        notes: null,
        createdAt: now,
        updatedAt: later,
      })
      .run();

    const after = computeAddressBookETag(db);
    expect(after).not.toBe(before);
  });
});

// ─── buildVendorVcard ─────────────────────────────────────────────────────────

describe('buildVendorVcard', () => {
  // ── required structure ────────────────────────────────────────────────────────

  it('produces a string starting with BEGIN:VCARD', () => {
    const output = buildVendorVcard(makeVendor());
    expect(output).toContain('BEGIN:VCARD');
  });

  it('produces a string ending with END:VCARD', () => {
    const output = buildVendorVcard(makeVendor());
    expect(output.trimEnd()).toContain('END:VCARD');
  });

  it('includes the vendor name as FN', () => {
    const output = buildVendorVcard(makeVendor({ name: 'Acme Construction' }));
    expect(output).toContain('Acme Construction');
  });

  it('includes KIND:org for organization vCards', () => {
    const output = buildVendorVcard(makeVendor());
    expect(output).toContain('KIND:org');
  });

  it('includes UID with the vendor ID', () => {
    const output = buildVendorVcard(makeVendor({ id: 'vendor-abc' }));
    expect(output).toContain('UID:urn:uuid:vendor-vendor-abc');
  });

  it('includes REV with the updatedAt timestamp', () => {
    const output = buildVendorVcard(makeVendor({ updatedAt: '2026-03-15T08:00:00Z' }));
    expect(output).toContain('REV:2026-03-15T08:00:00Z');
  });

  // ── optional fields ───────────────────────────────────────────────────────────

  it('includes email when provided', () => {
    const output = buildVendorVcard(makeVendor({ email: 'contact@acme.com' }));
    expect(output).toContain('contact@acme.com');
  });

  it('omits EMAIL field when email is null', () => {
    const output = buildVendorVcard(makeVendor({ email: null }));
    expect(output).not.toContain('EMAIL');
  });

  it('includes phone when provided', () => {
    const output = buildVendorVcard(makeVendor({ phone: '+1-800-555-1234' }));
    expect(output).toContain('+1-800-555-1234');
  });

  it('omits TEL field when phone is null', () => {
    const output = buildVendorVcard(makeVendor({ phone: null }));
    expect(output).not.toContain('TEL');
  });

  it('includes address when provided', () => {
    const output = buildVendorVcard(makeVendor({ address: '123 Main Street, Springfield' }));
    expect(output).toContain('123 Main Street');
  });

  it('omits ADR field when address is null', () => {
    const output = buildVendorVcard(makeVendor({ address: null }));
    expect(output).not.toContain('ADR');
  });

  it('includes notes when provided', () => {
    const output = buildVendorVcard(makeVendor({ notes: 'Reliable contractor.' }));
    expect(output).toContain('Reliable contractor.');
  });

  it('omits NOTE field when notes is null', () => {
    const output = buildVendorVcard(makeVendor({ notes: null }));
    expect(output).not.toContain('NOTE');
  });

  it('includes URL with baseUrl when baseUrl is provided', () => {
    const output = buildVendorVcard(
      makeVendor({ id: 'vendor-abc' }),
      'https://myhouse.example.com',
    );
    expect(output).toContain('https://myhouse.example.com/budget/vendors/vendor-abc');
  });

  it('omits URL field when baseUrl is not provided', () => {
    const output = buildVendorVcard(makeVendor());
    expect(output).not.toContain('URL');
  });

  // ── all optional fields ────────────────────────────────────────────────────────

  it('includes all optional fields when all are provided', () => {
    const vendor = makeVendor({
      id: 'vendor-full',
      name: 'Full Service Co',
      email: 'info@fullservice.com',
      phone: '+49-123-456789',
      address: 'Hauptstrasse 1, Berlin',
      notes: 'Premium vendor',
      updatedAt: '2026-02-01T12:00:00Z',
    });
    const output = buildVendorVcard(vendor, 'https://app.example.com');
    expect(output).toContain('Full Service Co');
    expect(output).toContain('info@fullservice.com');
    expect(output).toContain('+49-123-456789');
    expect(output).toContain('Hauptstrasse 1');
    expect(output).toContain('Premium vendor');
    expect(output).toContain('https://app.example.com/budget/vendors/vendor-full');
    expect(output).toContain('KIND:org');
    expect(output).toContain('UID:urn:uuid:vendor-vendor-full');
    expect(output).toContain('REV:2026-02-01T12:00:00Z');
  });

  // ── special characters ────────────────────────────────────────────────────────

  it('handles vendor names with special characters', () => {
    const output = buildVendorVcard(makeVendor({ name: 'Müller & Söhne GmbH' }));
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('END:VCARD');
    // Name is present somewhere in the output
    expect(output).toContain('Müller');
  });

  it('handles notes with newlines and special characters', () => {
    const output = buildVendorVcard(makeVendor({ notes: 'Line one\nLine two: important!' }));
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('END:VCARD');
  });

  // ── injection order ────────────────────────────────────────────────────────────

  it('places KIND:org, UID, and REV before END:VCARD', () => {
    const output = buildVendorVcard(makeVendor());
    const kindPos = output.indexOf('KIND:org');
    const uidPos = output.indexOf('UID:');
    const revPos = output.indexOf('REV:');
    const endPos = output.indexOf('END:VCARD');
    expect(kindPos).toBeGreaterThan(-1);
    expect(uidPos).toBeGreaterThan(-1);
    expect(revPos).toBeGreaterThan(-1);
    expect(kindPos).toBeLessThan(endPos);
    expect(uidPos).toBeLessThan(endPos);
    expect(revPos).toBeLessThan(endPos);
  });
});

// ─── buildContactVcard ────────────────────────────────────────────────────────

describe('buildContactVcard', () => {
  // ── required structure ────────────────────────────────────────────────────────

  it('produces a string containing BEGIN:VCARD and END:VCARD', () => {
    const output = buildContactVcard(makeContact(), 'Acme Construction');
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('END:VCARD');
  });

  it('includes the contact firstName and lastName in the vCard', () => {
    const output = buildContactVcard(
      makeContact({ firstName: 'Alice', lastName: 'Smith' }),
      'Acme',
    );
    expect(output).toContain('Alice');
    expect(output).toContain('Smith');
  });

  it('includes the vendor company name', () => {
    const output = buildContactVcard(makeContact(), 'Acme Construction');
    expect(output).toContain('Acme Construction');
  });

  it('includes UID with the contact ID', () => {
    const output = buildContactVcard(makeContact({ id: 'contact-xyz' }), 'Acme');
    expect(output).toContain('UID:urn:uuid:contact-contact-xyz');
  });

  it('includes REV with the contact updatedAt timestamp', () => {
    const output = buildContactVcard(
      makeContact({ updatedAt: '2026-03-20T10:30:00Z' }),
      'Acme',
    );
    expect(output).toContain('REV:2026-03-20T10:30:00Z');
  });

  // ── null firstName/lastName ───────────────────────────────────────────────────

  it('handles null firstName gracefully', () => {
    const output = buildContactVcard(
      makeContact({ firstName: null, lastName: 'Smith' }),
      'Acme',
    );
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('Smith');
  });

  it('handles null lastName gracefully', () => {
    const output = buildContactVcard(
      makeContact({ firstName: 'Alice', lastName: null }),
      'Acme',
    );
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('Alice');
  });

  it('handles both firstName and lastName being null', () => {
    const output = buildContactVcard(
      makeContact({ firstName: null, lastName: null }),
      'Acme',
    );
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('END:VCARD');
  });

  // ── optional fields ───────────────────────────────────────────────────────────

  it('includes role as job title when provided', () => {
    const output = buildContactVcard(makeContact({ role: 'Site Manager' }), 'Acme');
    expect(output).toContain('Site Manager');
  });

  it('omits TITLE field when role is null', () => {
    const output = buildContactVcard(makeContact({ role: null }), 'Acme');
    expect(output).not.toContain('TITLE');
  });

  it('includes email when provided', () => {
    const output = buildContactVcard(makeContact({ email: 'alice@acme.com' }), 'Acme');
    expect(output).toContain('alice@acme.com');
  });

  it('omits EMAIL field when email is null', () => {
    const output = buildContactVcard(makeContact({ email: null }), 'Acme');
    expect(output).not.toContain('EMAIL');
  });

  it('includes phone when provided', () => {
    const output = buildContactVcard(makeContact({ phone: '+49-555-0100' }), 'Acme');
    expect(output).toContain('+49-555-0100');
  });

  it('omits TEL field when phone is null', () => {
    const output = buildContactVcard(makeContact({ phone: null }), 'Acme');
    expect(output).not.toContain('TEL');
  });

  it('includes notes when provided', () => {
    const output = buildContactVcard(makeContact({ notes: 'Primary contact for invoices' }), 'Acme');
    expect(output).toContain('Primary contact for invoices');
  });

  it('omits NOTE field when notes is null', () => {
    const output = buildContactVcard(makeContact({ notes: null }), 'Acme');
    expect(output).not.toContain('NOTE');
  });

  it('includes URL linking to the vendor page when baseUrl is provided', () => {
    const output = buildContactVcard(
      makeContact({ vendorId: 'vendor-abc' }),
      'Acme',
      'https://myhouse.example.com',
    );
    expect(output).toContain('https://myhouse.example.com/budget/vendors/vendor-abc');
  });

  it('omits URL field when baseUrl is not provided', () => {
    const output = buildContactVcard(makeContact(), 'Acme');
    expect(output).not.toContain('URL');
  });

  // ── all optional fields ────────────────────────────────────────────────────────

  it('includes all optional fields when all are provided', () => {
    const contact = makeContact({
      id: 'contact-full',
      vendorId: 'vendor-full',
      firstName: 'Bob',
      lastName: 'Jones',
      name: 'Bob Jones',
      role: 'Project Lead',
      email: 'bob@fullservice.com',
      phone: '+1-555-9999',
      notes: 'Key decision maker',
      updatedAt: '2026-01-15T09:00:00Z',
    });
    const output = buildContactVcard(contact, 'Full Service Co', 'https://app.example.com');
    expect(output).toContain('Bob');
    expect(output).toContain('Jones');
    expect(output).toContain('Project Lead');
    expect(output).toContain('bob@fullservice.com');
    expect(output).toContain('+1-555-9999');
    expect(output).toContain('Key decision maker');
    expect(output).toContain('Full Service Co');
    expect(output).toContain('https://app.example.com/budget/vendors/vendor-full');
    expect(output).toContain('UID:urn:uuid:contact-contact-full');
    expect(output).toContain('REV:2026-01-15T09:00:00Z');
  });

  // ── special characters ────────────────────────────────────────────────────────

  it('handles names with umlauts and special characters', () => {
    const output = buildContactVcard(
      makeContact({ firstName: 'Jörg', lastName: 'Müller' }),
      'Müller GmbH',
    );
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('END:VCARD');
  });

  it('handles notes with commas and colons', () => {
    const output = buildContactVcard(
      makeContact({ notes: 'Call after 5pm: urgent, follow-up required' }),
      'Acme',
    );
    expect(output).toContain('BEGIN:VCARD');
    expect(output).toContain('END:VCARD');
  });

  // ── injection order ────────────────────────────────────────────────────────────

  it('places UID and REV before END:VCARD', () => {
    const output = buildContactVcard(makeContact(), 'Acme');
    const uidPos = output.indexOf('UID:');
    const revPos = output.indexOf('REV:');
    const endPos = output.indexOf('END:VCARD');
    expect(uidPos).toBeGreaterThan(-1);
    expect(revPos).toBeGreaterThan(-1);
    expect(uidPos).toBeLessThan(endPos);
    expect(revPos).toBeLessThan(endPos);
  });

  it('does NOT include KIND:org for contact vCards', () => {
    const output = buildContactVcard(makeContact(), 'Acme');
    expect(output).not.toContain('KIND:org');
  });
});

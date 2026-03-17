import { createHash } from 'node:crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
// vcard-creator is CJS — default import gives the module namespace, class is at .default
import VCardModule from 'vcard-creator';

const VCardCreator =
  (VCardModule as unknown as { default: typeof VCardModule }).default ?? VCardModule;

type DbType = BetterSQLite3Database<typeof schemaTypes> & { $client: Database.Database };

/**
 * Compute an ETag by SHA256 hashing concatenated parts.
 */
function computeETag(parts: (string | null | undefined)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part ?? '');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Compute the ETag for the address book (based on max updated_at across vendors and vendor_contacts).
 */
export function computeAddressBookETag(db: DbType): string {
  const maxUpdatedRow = db.$client
    .prepare(
      `
    SELECT MAX(max_updated) as m FROM (
      SELECT MAX(updated_at) as max_updated FROM vendors
      UNION ALL
      SELECT MAX(updated_at) as max_updated FROM vendor_contacts
    )
  `,
    )
    .get() as { m: string | null };

  return computeETag([maxUpdatedRow.m]);
}

/**
 * Build a vCard for a vendor (company-level).
 * Uses KIND:org to mark this as an organization vCard.
 * Injects UID and REV fields for CalDAV/CardDAV compatibility.
 */
export function buildVendorVcard(vendor: {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  updatedAt: string;
}, baseUrl?: string): string {
  const vcard = new VCardCreator();
  // For organizations: FN is the company name, N is minimal
  vcard.addName('', vendor.name);
  vcard.addCompany(vendor.name);

  if (vendor.email) {
    vcard.addEmail(vendor.email, 'WORK');
  }

  if (vendor.phone) {
    vcard.addPhoneNumber(vendor.phone as unknown as number, 'WORK');
  }

  if (vendor.address) {
    vcard.addAddress('', '', vendor.address, '', '', '', '', 'WORK');
  }

  if (vendor.specialty) {
    vcard.addJobtitle(vendor.specialty);
  }

  if (vendor.notes) {
    vcard.addNote(vendor.notes);
  }

  if (baseUrl) {
    vcard.addURL(`${baseUrl}/budget/vendors/${vendor.id}`, 'WORK');
  }

  let vcardStr = vcard.toString();

  // Inject KIND:org, UID, and REV fields before END:VCARD
  const uid = `urn:uuid:vendor-${vendor.id}`;
  const rev = vendor.updatedAt;
  const endMarker = 'END:VCARD';
  vcardStr = vcardStr.replace(
    endMarker,
    `KIND:org\r\nUID:${uid}\r\nREV:${rev}\r\n${endMarker}`,
  );

  return vcardStr;
}

/**
 * Build a vCard for an individual contact at a vendor.
 * Uses proper N:lastName;firstName structure.
 * Injects UID and REV fields for CalDAV/CardDAV compatibility.
 */
export function buildContactVcard(
  contact: {
    id: string;
    vendorId: string;
    firstName: string | null;
    lastName: string | null;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    updatedAt: string;
  },
  vendorName: string,
  baseUrl?: string,
): string {
  const vcard = new VCardCreator();
  // addName(lastName, firstName) — maps to N:lastName;firstName;;;
  vcard.addName(contact.lastName ?? '', contact.firstName ?? '');

  if (contact.role) {
    vcard.addJobtitle(contact.role);
  }

  if (contact.email) {
    vcard.addEmail(contact.email, 'WORK');
  }

  if (contact.phone) {
    vcard.addPhoneNumber(contact.phone as unknown as number, 'WORK');
  }

  if (contact.notes) {
    vcard.addNote(contact.notes);
  }

  // Add organization (vendor name)
  vcard.addCompany(vendorName);

  if (baseUrl) {
    vcard.addURL(`${baseUrl}/budget/vendors/${contact.vendorId}`, 'WORK');
  }

  let vcardStr = vcard.toString();

  // Inject UID and REV fields before END:VCARD
  const uid = `urn:uuid:contact-${contact.id}`;
  const rev = contact.updatedAt;
  const endMarker = 'END:VCARD';
  vcardStr = vcardStr.replace(
    endMarker,
    `UID:${uid}\r\nREV:${rev}\r\n${endMarker}`,
  );

  return vcardStr;
}

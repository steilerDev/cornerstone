import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { vendorContacts, vendors } from '../db/schema.js';
import type {
  VendorContact,
  CreateVendorContactRequest,
  UpdateVendorContactRequest,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Compute display name from firstName and lastName.
 */
function computeDisplayName(firstName: string | null, lastName: string | null): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.join(' ') || 'Unnamed Contact';
}

/**
 * Convert database vendor contact row to VendorContact shape.
 */
function toVendorContact(row: typeof vendorContacts.$inferSelect): VendorContact {
  const firstName = row.firstName ?? null;
  const lastName = row.lastName ?? null;
  return {
    id: row.id,
    vendorId: row.vendorId,
    firstName,
    lastName,
    name: computeDisplayName(firstName, lastName),
    role: row.role ?? null,
    phone: row.phone ?? null,
    email: row.email ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * List all vendor contacts for a given vendor.
 * Throws NotFoundError if vendor does not exist.
 */
export function listContacts(db: DbType, vendorId: string): VendorContact[] {
  // Validate vendor exists
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError(`Vendor with ID ${vendorId} not found`);
  }

  const rows = db
    .select()
    .from(vendorContacts)
    .where(eq(vendorContacts.vendorId, vendorId))
    .orderBy(vendorContacts.createdAt)
    .all();

  return rows.map(toVendorContact);
}

/**
 * List all vendor contacts for a given vendor (without vendor existence check).
 * Used internally by vendorService to avoid redundant queries.
 */
export function listContactsRaw(db: DbType, vendorId: string): VendorContact[] {
  const rows = db
    .select()
    .from(vendorContacts)
    .where(eq(vendorContacts.vendorId, vendorId))
    .orderBy(vendorContacts.createdAt)
    .all();

  return rows.map(toVendorContact);
}

/**
 * Create a new vendor contact.
 * Throws NotFoundError if vendor does not exist.
 * Throws ValidationError if data is invalid.
 */
export function createContact(
  db: DbType,
  vendorId: string,
  data: CreateVendorContactRequest,
): VendorContact {
  // Validate vendor exists
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError(`Vendor with ID ${vendorId} not found`);
  }

  // Validate at least one name part is provided
  const firstName = (data.firstName ?? '').trim() || null;
  const lastName = (data.lastName ?? '').trim() || null;

  if (!firstName && !lastName) {
    throw new ValidationError('At least first name or last name is required', {
      firstName: 'at least first name or last name is required',
    });
  }

  if (firstName && firstName.length > 100) {
    throw new ValidationError('First name must be 100 characters or less', {
      firstName: 'first name must be 100 characters or less',
    });
  }

  if (lastName && lastName.length > 100) {
    throw new ValidationError('Last name must be 100 characters or less', {
      lastName: 'last name must be 100 characters or less',
    });
  }

  // Validate optional fields
  const role = (data.role ?? '').trim() || null;
  if (role && role.length > 100) {
    throw new ValidationError('Contact role must be 100 characters or less', {
      role: 'role must be 100 characters or less',
    });
  }

  const phone = (data.phone ?? '').trim() || null;
  if (phone && phone.length > 50) {
    throw new ValidationError('Contact phone must be 50 characters or less', {
      phone: 'phone must be 50 characters or less',
    });
  }

  const email = (data.email ?? '').trim() || null;
  if (email && email.length > 255) {
    throw new ValidationError('Contact email must be 255 characters or less', {
      email: 'email must be 255 characters or less',
    });
  }

  const notes = (data.notes ?? '').trim() || null;
  if (notes && notes.length > 2000) {
    throw new ValidationError('Contact notes must be 2000 characters or less', {
      notes: 'notes must be 2000 characters or less',
    });
  }

  const displayName = computeDisplayName(firstName, lastName);
  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(vendorContacts)
    .values({
      id,
      vendorId,
      name: displayName,
      firstName,
      lastName,
      role,
      phone,
      email,
      notes,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = db.select().from(vendorContacts).where(eq(vendorContacts.id, id)).get();
  if (!row) throw new Error('Failed to create contact');

  return toVendorContact(row);
}

/**
 * Update an existing vendor contact.
 * Throws NotFoundError if vendor or contact does not exist.
 * Throws ValidationError if data is invalid or no fields provided.
 */
export function updateContact(
  db: DbType,
  vendorId: string,
  contactId: string,
  data: UpdateVendorContactRequest,
): VendorContact {
  // Validate vendor exists
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError(`Vendor with ID ${vendorId} not found`);
  }

  // Validate contact exists and belongs to vendor
  const contact = db
    .select()
    .from(vendorContacts)
    .where(eq(vendorContacts.id, contactId))
    .get();
  if (!contact || contact.vendorId !== vendorId) {
    throw new NotFoundError(`Contact with ID ${contactId} not found`);
  }

  // Check at least one field is provided
  const hasUpdate =
    data.firstName !== undefined ||
    data.lastName !== undefined ||
    data.role !== undefined ||
    data.phone !== undefined ||
    data.email !== undefined ||
    data.notes !== undefined;

  if (!hasUpdate) {
    throw new ValidationError('At least one field must be provided for update', {});
  }

  // Validate and build update object
  const updates: Partial<typeof vendorContacts.$inferInsert> = {};

  if (data.firstName !== undefined) {
    const firstName = (data.firstName ?? '').trim() || null;
    if (firstName && firstName.length > 100) {
      throw new ValidationError('First name must be 100 characters or less', {
        firstName: 'first name must be 100 characters or less',
      });
    }
    updates.firstName = firstName;
  }

  if (data.lastName !== undefined) {
    const lastName = (data.lastName ?? '').trim() || null;
    if (lastName && lastName.length > 100) {
      throw new ValidationError('Last name must be 100 characters or less', {
        lastName: 'last name must be 100 characters or less',
      });
    }
    updates.lastName = lastName;
  }

  // Validate that at least one name part remains after update
  const effectiveFirstName = data.firstName !== undefined
    ? ((data.firstName ?? '').trim() || null)
    : (contact.firstName ?? null);
  const effectiveLastName = data.lastName !== undefined
    ? ((data.lastName ?? '').trim() || null)
    : (contact.lastName ?? null);

  if (!effectiveFirstName && !effectiveLastName) {
    throw new ValidationError('At least first name or last name is required', {
      firstName: 'at least first name or last name is required',
    });
  }

  // Update computed display name
  updates.name = computeDisplayName(effectiveFirstName, effectiveLastName);

  if (data.role !== undefined) {
    const role = (data.role ?? '').trim() || null;
    if (role && role.length > 100) {
      throw new ValidationError('Contact role must be 100 characters or less', {
        role: 'role must be 100 characters or less',
      });
    }
    updates.role = role;
  }

  if (data.phone !== undefined) {
    const phone = (data.phone ?? '').trim() || null;
    if (phone && phone.length > 50) {
      throw new ValidationError('Contact phone must be 50 characters or less', {
        phone: 'phone must be 50 characters or less',
      });
    }
    updates.phone = phone;
  }

  if (data.email !== undefined) {
    const email = (data.email ?? '').trim() || null;
    if (email && email.length > 255) {
      throw new ValidationError('Contact email must be 255 characters or less', {
        email: 'email must be 255 characters or less',
      });
    }
    updates.email = email;
  }

  if (data.notes !== undefined) {
    const notes = (data.notes ?? '').trim() || null;
    if (notes && notes.length > 2000) {
      throw new ValidationError('Contact notes must be 2000 characters or less', {
        notes: 'notes must be 2000 characters or less',
      });
    }
    updates.notes = notes;
  }

  const now = new Date().toISOString();
  updates.updatedAt = now;

  db.update(vendorContacts)
    .set(updates)
    .where(eq(vendorContacts.id, contactId))
    .run();

  const updated = db.select().from(vendorContacts).where(eq(vendorContacts.id, contactId)).get();
  if (!updated) throw new Error('Failed to update contact');

  return toVendorContact(updated);
}

/**
 * Delete a vendor contact.
 * Throws NotFoundError if vendor or contact does not exist.
 */
export function deleteContact(db: DbType, vendorId: string, contactId: string): void {
  // Validate vendor exists
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError(`Vendor with ID ${vendorId} not found`);
  }

  // Validate contact exists and belongs to vendor
  const contact = db
    .select()
    .from(vendorContacts)
    .where(eq(vendorContacts.id, contactId))
    .get();
  if (!contact || contact.vendorId !== vendorId) {
    throw new NotFoundError(`Contact with ID ${contactId} not found`);
  }

  db.delete(vendorContacts).where(eq(vendorContacts.id, contactId)).run();
}

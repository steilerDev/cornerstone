import { describe, it, expect } from '@jest/globals';
import type * as schema from '../../db/schema.js';
import {
  toUserSummary,
  toBudgetCategory,
  toBudgetSourceSummary,
  toVendorSummary,
} from './converters.js';

// ─── Mock row helpers ───────────────────────────────────────────────────────

function makeUserRow(
  overrides: Partial<typeof schema.users.$inferSelect> = {},
): typeof schema.users.$inferSelect {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    role: 'member',
    authProvider: 'local',
    passwordHash: null,
    oidcSubject: null,
    davToken: null,
    deactivatedAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBudgetCategoryRow(
  overrides: Partial<typeof schema.budgetCategories.$inferSelect> = {},
): typeof schema.budgetCategories.$inferSelect {
  return {
    id: 'bc-1',
    name: 'Electrical',
    description: 'Electrical work',
    color: '#3B82F6',
    sortOrder: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBudgetSourceRow(
  overrides: Partial<typeof schema.budgetSources.$inferSelect> = {},
): typeof schema.budgetSources.$inferSelect {
  return {
    id: 'bs-1',
    name: 'Main Loan',
    sourceType: 'bank_loan',
    totalAmount: 100000,
    interestRate: 3.5,
    terms: '20 years',
    notes: null,
    status: 'active',
    isDiscretionary: false,
    createdBy: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeVendorRow(
  overrides: Partial<typeof schema.vendors.$inferSelect> = {},
): typeof schema.vendors.$inferSelect {
  return {
    id: 'vendor-1',
    name: 'ACME Contractors',
    tradeId: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    createdBy: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── toUserSummary ──────────────────────────────────────────────────────────

describe('toUserSummary()', () => {
  it('returns null when passed null', () => {
    expect(toUserSummary(null)).toBeNull();
  });

  it('returns null when passed undefined', () => {
    expect(toUserSummary(undefined)).toBeNull();
  });

  it('maps id, displayName, and email from user row', () => {
    const row = makeUserRow({
      id: 'user-42',
      displayName: 'Bob Builder',
      email: 'bob@example.com',
    });

    const result = toUserSummary(row);

    expect(result).toEqual({
      id: 'user-42',
      displayName: 'Bob Builder',
      email: 'bob@example.com',
    });
  });

  it('does not include extra fields like role or authProvider', () => {
    const row = makeUserRow();
    const result = toUserSummary(row);

    expect(result).not.toHaveProperty('role');
    expect(result).not.toHaveProperty('authProvider');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('createdAt');
  });

  it('returns only the three summary fields', () => {
    const row = makeUserRow({ id: 'u1', displayName: 'Carol', email: 'carol@example.com' });
    const result = toUserSummary(row);

    expect(Object.keys(result!)).toHaveLength(3);
    expect(Object.keys(result!).sort()).toEqual(['displayName', 'email', 'id']);
  });
});

// ─── toBudgetCategory ───────────────────────────────────────────────────────

describe('toBudgetCategory()', () => {
  it('returns null when passed null', () => {
    expect(toBudgetCategory(null)).toBeNull();
  });

  it('returns null when passed undefined', () => {
    expect(toBudgetCategory(undefined)).toBeNull();
  });

  it('maps all fields correctly from budget category row', () => {
    const row = makeBudgetCategoryRow({
      id: 'bc-99',
      name: 'Plumbing',
      description: 'All plumbing work',
      color: '#10B981',
      sortOrder: 3,
      createdAt: '2025-03-01T00:00:00.000Z',
      updatedAt: '2025-04-01T00:00:00.000Z',
    });

    const result = toBudgetCategory(row);

    expect(result).toEqual({
      id: 'bc-99',
      name: 'Plumbing',
      description: 'All plumbing work',
      color: '#10B981',
      sortOrder: 3,
      createdAt: '2025-03-01T00:00:00.000Z',
      updatedAt: '2025-04-01T00:00:00.000Z',
    });
  });

  it('passes through null description', () => {
    const row = makeBudgetCategoryRow({ description: null });
    const result = toBudgetCategory(row);

    expect(result).not.toBeNull();
    expect(result!.description).toBeNull();
  });

  it('passes through null color', () => {
    const row = makeBudgetCategoryRow({ color: null });
    const result = toBudgetCategory(row);

    expect(result).not.toBeNull();
    expect(result!.color).toBeNull();
  });

  it('passes through null for both description and color simultaneously', () => {
    const row = makeBudgetCategoryRow({ description: null, color: null });
    const result = toBudgetCategory(row);

    expect(result).not.toBeNull();
    expect(result!.description).toBeNull();
    expect(result!.color).toBeNull();
  });
});

// ─── toBudgetSourceSummary ──────────────────────────────────────────────────

describe('toBudgetSourceSummary()', () => {
  it('returns null when passed null', () => {
    expect(toBudgetSourceSummary(null)).toBeNull();
  });

  it('returns null when passed undefined', () => {
    expect(toBudgetSourceSummary(undefined)).toBeNull();
  });

  it('maps id, name, and sourceType correctly', () => {
    const row = makeBudgetSourceRow({
      id: 'bs-55',
      name: 'Savings Account',
      sourceType: 'savings',
    });

    const result = toBudgetSourceSummary(row);

    expect(result).toEqual({
      id: 'bs-55',
      name: 'Savings Account',
      sourceType: 'savings',
    });
  });

  it('does not include extra fields like totalAmount or status', () => {
    const row = makeBudgetSourceRow();
    const result = toBudgetSourceSummary(row);

    expect(result).not.toHaveProperty('totalAmount');
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('interestRate');
    expect(result).not.toHaveProperty('createdAt');
  });

  it('returns only the three summary fields', () => {
    const row = makeBudgetSourceRow();
    const result = toBudgetSourceSummary(row);

    expect(Object.keys(result!).sort()).toEqual(['id', 'name', 'sourceType']);
  });

  it('maps all valid sourceType values correctly', () => {
    const sourceTypes: Array<(typeof schema.budgetSources.$inferSelect)['sourceType']> = [
      'bank_loan',
      'credit_line',
      'savings',
      'other',
    ];

    for (const sourceType of sourceTypes) {
      const row = makeBudgetSourceRow({ sourceType });
      const result = toBudgetSourceSummary(row);
      expect(result!.sourceType).toBe(sourceType);
    }
  });
});

// ─── toVendorSummary ────────────────────────────────────────────────────────

describe('toVendorSummary()', () => {
  it('returns null when passed null', () => {
    expect(toVendorSummary(null)).toBeNull();
  });

  it('returns null when passed undefined', () => {
    expect(toVendorSummary(undefined)).toBeNull();
  });

  it('maps id and name correctly', () => {
    const row = makeVendorRow({
      id: 'vendor-77',
      name: 'Best Electric Co.',
    });

    const result = toVendorSummary(row);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('vendor-77');
    expect(result!.name).toBe('Best Electric Co.');
  });

  it('does not include extra fields like phone, email, or address', () => {
    const row = makeVendorRow({ phone: '555-1234', email: 'vendor@test.com', address: '123 St' });
    const result = toVendorSummary(row);

    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('address');
    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('createdAt');
  });
});

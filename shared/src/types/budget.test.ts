/**
 * Type-level tests for shared budget base types.
 *
 * These tests verify that the TypeScript interfaces are correctly shaped,
 * that all union type literals are present, and that runtime constant values
 * match the specification. Because most of these are compile-time types,
 * tests construct valid typed objects and assert their runtime field values.
 *
 * Story #499 / EPIC-14: Shared Type Consolidation
 */

import { describe, it, expect } from '@jest/globals';
import { CONFIDENCE_MARGINS } from './budget.js';
import type {
  ConfidenceLevel,
  BudgetSourceSummary,
  InvoiceSummary,
  BaseBudgetLine,
  CreateBudgetLineRequest,
  UpdateBudgetLineRequest,
  SubsidyPaybackEntry,
  BudgetAggregate,
  BudgetSummary,
} from './budget.js';
import type { VendorSummary } from './workItem.js';
import type { WorkItemBudgetLine } from './workItemBudget.js';
import type {
  HouseholdItemBudgetLine,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
  HouseholdItemSubsidyPaybackEntry,
} from './householdItemBudget.js';
import type { CreateWorkItemBudgetRequest, UpdateWorkItemBudgetRequest } from './workItemBudget.js';
import type { WorkItemSubsidyPaybackEntry } from './subsidyProgram.js';

// ---------------------------------------------------------------------------
// Minimal valid BaseBudgetLine fixture — reused across multiple tests
// ---------------------------------------------------------------------------
const minimalBudgetLine = {
  id: 'bl-001',
  description: null,
  plannedAmount: 1000,
  confidence: 'own_estimate' as ConfidenceLevel,
  confidenceMargin: 0.2,
  budgetCategory: null,
  budgetSource: null,
  vendor: null,
  actualCost: 0,
  actualCostPaid: 0,
  invoiceCount: 0,
  invoiceLink: null,
  quantity: null,
  unit: null,
  unitPrice: null,
  includesVat: null,
  createdBy: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// CONFIDENCE_MARGINS
// ---------------------------------------------------------------------------

describe('CONFIDENCE_MARGINS constant', () => {
  it('has exactly 4 keys matching the ConfidenceLevel union', () => {
    const keys = Object.keys(CONFIDENCE_MARGINS);
    expect(keys).toHaveLength(4);
    expect(keys).toContain('own_estimate');
    expect(keys).toContain('professional_estimate');
    expect(keys).toContain('quote');
    expect(keys).toContain('invoice');
  });

  it('own_estimate margin is 0.2 (20%)', () => {
    expect(CONFIDENCE_MARGINS.own_estimate).toBe(0.2);
  });

  it('professional_estimate margin is 0.1 (10%)', () => {
    expect(CONFIDENCE_MARGINS.professional_estimate).toBe(0.1);
  });

  it('quote margin is 0.05 (5%)', () => {
    expect(CONFIDENCE_MARGINS.quote).toBe(0.05);
  });

  it('invoice margin is 0.0 (no buffer — actual cost known)', () => {
    expect(CONFIDENCE_MARGINS.invoice).toBe(0.0);
  });

  it('all margin values are non-negative numbers', () => {
    for (const value of Object.values(CONFIDENCE_MARGINS)) {
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('margins are in descending order from own_estimate to invoice', () => {
    expect(CONFIDENCE_MARGINS.own_estimate).toBeGreaterThan(
      CONFIDENCE_MARGINS.professional_estimate,
    );
    expect(CONFIDENCE_MARGINS.professional_estimate).toBeGreaterThan(CONFIDENCE_MARGINS.quote);
    expect(CONFIDENCE_MARGINS.quote).toBeGreaterThan(CONFIDENCE_MARGINS.invoice);
  });
});

// ---------------------------------------------------------------------------
// ConfidenceLevel type
// ---------------------------------------------------------------------------

describe('ConfidenceLevel type', () => {
  it('accepts all 4 valid confidence level values', () => {
    const levels: ConfidenceLevel[] = ['own_estimate', 'professional_estimate', 'quote', 'invoice'];

    expect(levels).toHaveLength(4);
    expect(levels).toContain('own_estimate');
    expect(levels).toContain('professional_estimate');
    expect(levels).toContain('quote');
    expect(levels).toContain('invoice');
  });

  it('each confidence level value is distinct', () => {
    const levels: ConfidenceLevel[] = ['own_estimate', 'professional_estimate', 'quote', 'invoice'];
    const unique = new Set(levels);
    expect(unique.size).toBe(4);
  });

  it('each level has a corresponding margin in CONFIDENCE_MARGINS', () => {
    const levels: ConfidenceLevel[] = ['own_estimate', 'professional_estimate', 'quote', 'invoice'];
    for (const level of levels) {
      expect(CONFIDENCE_MARGINS[level]).toBeDefined();
      expect(typeof CONFIDENCE_MARGINS[level]).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// BudgetSourceSummary
// ---------------------------------------------------------------------------

describe('BudgetSourceSummary interface', () => {
  it('constructs a valid budget source summary with all required fields', () => {
    const source: BudgetSourceSummary = {
      id: 'bs-001',
      name: 'Construction Loan',
      sourceType: 'loan',
    };

    expect(source.id).toBe('bs-001');
    expect(source.name).toBe('Construction Loan');
    expect(source.sourceType).toBe('loan');
  });

  it('accepts different sourceType strings', () => {
    const saving: BudgetSourceSummary = {
      id: 'bs-002',
      name: 'Personal Savings',
      sourceType: 'savings',
    };
    const grant: BudgetSourceSummary = {
      id: 'bs-003',
      name: 'Government Grant',
      sourceType: 'grant',
    };

    expect(saving.sourceType).toBe('savings');
    expect(grant.sourceType).toBe('grant');
  });
});

// ---------------------------------------------------------------------------
// VendorSummary
// ---------------------------------------------------------------------------

describe('VendorSummary interface', () => {
  it('constructs a valid vendor summary with a trade object', () => {
    const vendor: VendorSummary = {
      id: 'v-001',
      name: 'Acme Plumbing',
      trade: {
        id: 'trade-plumbing',
        name: 'Plumbing',
        color: '#0EA5E9',
        translationKey: 'trades.plumbing',
      },
    };

    expect(vendor.id).toBe('v-001');
    expect(vendor.name).toBe('Acme Plumbing');
    expect(vendor.trade?.id).toBe('trade-plumbing');
    expect(vendor.trade?.name).toBe('Plumbing');
    expect(vendor.trade?.color).toBe('#0EA5E9');
  });

  it('allows trade to be null', () => {
    const vendor: VendorSummary = {
      id: 'v-002',
      name: 'General Contractor',
      trade: null,
    };

    expect(vendor.id).toBe('v-002');
    expect(vendor.name).toBe('General Contractor');
    expect(vendor.trade).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// InvoiceSummary
// ---------------------------------------------------------------------------

describe('InvoiceSummary interface', () => {
  it('constructs a valid invoice summary with all fields', () => {
    const invoice: InvoiceSummary = {
      id: 'inv-001',
      vendorId: 'v-001',
      vendorName: 'Acme Plumbing',
      invoiceNumber: 'INV-2025-001',
      amount: 4500.0,
      date: '2025-03-15',
      status: 'paid',
    };

    expect(invoice.id).toBe('inv-001');
    expect(invoice.vendorId).toBe('v-001');
    expect(invoice.vendorName).toBe('Acme Plumbing');
    expect(invoice.invoiceNumber).toBe('INV-2025-001');
    expect(invoice.amount).toBe(4500.0);
    expect(invoice.date).toBe('2025-03-15');
    expect(invoice.status).toBe('paid');
  });

  it('allows vendorName to be null', () => {
    const invoice: InvoiceSummary = {
      id: 'inv-002',
      vendorId: 'v-deleted',
      vendorName: null,
      invoiceNumber: 'INV-2025-002',
      amount: 1200,
      date: '2025-04-01',
      status: 'pending',
    };

    expect(invoice.vendorName).toBeNull();
  });

  it('allows invoiceNumber to be null', () => {
    const invoice: InvoiceSummary = {
      id: 'inv-003',
      vendorId: 'v-001',
      vendorName: 'Acme Plumbing',
      invoiceNumber: null,
      amount: 750,
      date: '2025-04-10',
      status: 'claimed',
    };

    expect(invoice.invoiceNumber).toBeNull();
  });

  it('allows both vendorName and invoiceNumber to be null simultaneously', () => {
    const invoice: InvoiceSummary = {
      id: 'inv-004',
      vendorId: 'v-001',
      vendorName: null,
      invoiceNumber: null,
      amount: 0,
      date: '2025-01-01',
      status: 'pending',
    };

    expect(invoice.vendorName).toBeNull();
    expect(invoice.invoiceNumber).toBeNull();
    expect(invoice.amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// BaseBudgetLine
// ---------------------------------------------------------------------------

describe('BaseBudgetLine interface', () => {
  it('constructs a valid budget line with all nullable fields set to null', () => {
    const line: BaseBudgetLine = { ...minimalBudgetLine };

    expect(line.id).toBe('bl-001');
    expect(line.description).toBeNull();
    expect(line.plannedAmount).toBe(1000);
    expect(line.confidence).toBe('own_estimate');
    expect(line.confidenceMargin).toBe(0.2);
    expect(line.budgetCategory).toBeNull();
    expect(line.budgetSource).toBeNull();
    expect(line.vendor).toBeNull();
    expect(line.actualCost).toBe(0);
    expect(line.actualCostPaid).toBe(0);
    expect(line.invoiceCount).toBe(0);
    expect(line.createdBy).toBeNull();
    expect(line.createdAt).toBe('2025-01-01T00:00:00Z');
    expect(line.updatedAt).toBe('2025-01-01T00:00:00Z');
  });

  it('constructs a valid budget line with all fields populated', () => {
    const line: BaseBudgetLine = {
      id: 'bl-002',
      description: 'Foundation concrete pour',
      plannedAmount: 25000,
      confidence: 'quote',
      confidenceMargin: 0.05,
      budgetCategory: {
        id: 'bc-materials',
        name: 'Materials',
        description: 'Raw construction materials',
        color: '#4a90d9',
        translationKey: 'budgetCategories.materials',
        sortOrder: 1,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      budgetSource: {
        id: 'bs-001',
        name: 'Construction Loan',
        sourceType: 'loan',
      },
      vendor: {
        id: 'v-001',
        name: 'Acme Concrete',
        trade: {
          id: 'trade-masonry',
          name: 'Masonry',
          color: '#78716C',
          translationKey: 'trades.masonry',
        },
      },
      actualCost: 24500,
      actualCostPaid: 24500,
      invoiceCount: 2,
      invoiceLink: null,
      quantity: 10,
      unit: 'm³',
      unitPrice: 2500,
      includesVat: false,
      createdBy: {
        id: 'user-001',
        displayName: 'Alice Builder',
        email: 'alice@example.com',
      },
      createdAt: '2025-02-01T00:00:00Z',
      updatedAt: '2025-02-15T00:00:00Z',
    };

    expect(line.id).toBe('bl-002');
    expect(line.description).toBe('Foundation concrete pour');
    expect(line.plannedAmount).toBe(25000);
    expect(line.confidence).toBe('quote');
    expect(line.confidenceMargin).toBe(0.05);
    expect(line.budgetCategory?.name).toBe('Materials');
    expect(line.budgetSource?.sourceType).toBe('loan');
    expect(line.vendor?.trade?.name).toBe('Masonry');
    expect(line.actualCost).toBe(24500);
    expect(line.actualCostPaid).toBe(24500);
    expect(line.invoiceCount).toBe(2);
    expect(line.createdBy?.displayName).toBe('Alice Builder');
  });

  it('accepts all 4 confidence levels', () => {
    const confidenceLevels: ConfidenceLevel[] = [
      'own_estimate',
      'professional_estimate',
      'quote',
      'invoice',
    ];

    for (const confidence of confidenceLevels) {
      const line: BaseBudgetLine = {
        ...minimalBudgetLine,
        id: `bl-conf-${confidence}`,
        confidence,
        confidenceMargin: CONFIDENCE_MARGINS[confidence],
      };
      expect(line.confidence).toBe(confidence);
      expect(line.confidenceMargin).toBe(CONFIDENCE_MARGINS[confidence]);
    }
  });
});

// ---------------------------------------------------------------------------
// CreateBudgetLineRequest
// ---------------------------------------------------------------------------

describe('CreateBudgetLineRequest interface', () => {
  it('requires only plannedAmount — all other fields are optional', () => {
    const request: CreateBudgetLineRequest = {
      plannedAmount: 5000,
    };

    expect(request.plannedAmount).toBe(5000);
    expect(request.description).toBeUndefined();
    expect(request.confidence).toBeUndefined();
    expect(request.budgetCategoryId).toBeUndefined();
    expect(request.budgetSourceId).toBeUndefined();
    expect(request.vendorId).toBeUndefined();
  });

  it('accepts all optional fields when provided', () => {
    const request: CreateBudgetLineRequest = {
      description: 'Electrical wiring',
      plannedAmount: 8000,
      confidence: 'professional_estimate',
      budgetCategoryId: 'bc-electrical',
      budgetSourceId: 'bs-001',
      vendorId: 'v-002',
    };

    expect(request.description).toBe('Electrical wiring');
    expect(request.plannedAmount).toBe(8000);
    expect(request.confidence).toBe('professional_estimate');
    expect(request.budgetCategoryId).toBe('bc-electrical');
    expect(request.budgetSourceId).toBe('bs-001');
    expect(request.vendorId).toBe('v-002');
  });

  it('allows nullable optional fields to be set to null', () => {
    const request: CreateBudgetLineRequest = {
      plannedAmount: 3000,
      description: null,
      budgetCategoryId: null,
      budgetSourceId: null,
      vendorId: null,
    };

    expect(request.plannedAmount).toBe(3000);
    expect(request.description).toBeNull();
    expect(request.budgetCategoryId).toBeNull();
    expect(request.budgetSourceId).toBeNull();
    expect(request.vendorId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UpdateBudgetLineRequest
// ---------------------------------------------------------------------------

describe('UpdateBudgetLineRequest interface', () => {
  it('allows an empty object (all fields optional)', () => {
    const request: UpdateBudgetLineRequest = {};
    expect(Object.keys(request)).toHaveLength(0);
  });

  it('allows updating a single field', () => {
    const request: UpdateBudgetLineRequest = { plannedAmount: 12000 };

    expect(request.plannedAmount).toBe(12000);
    expect(request.description).toBeUndefined();
    expect(request.confidence).toBeUndefined();
    expect(request.budgetCategoryId).toBeUndefined();
    expect(request.budgetSourceId).toBeUndefined();
    expect(request.vendorId).toBeUndefined();
  });

  it('allows updating all fields simultaneously', () => {
    const request: UpdateBudgetLineRequest = {
      description: 'Updated roofing materials',
      plannedAmount: 18000,
      confidence: 'invoice',
      budgetCategoryId: 'bc-roofing',
      budgetSourceId: 'bs-002',
      vendorId: 'v-005',
    };

    expect(request.description).toBe('Updated roofing materials');
    expect(request.plannedAmount).toBe(18000);
    expect(request.confidence).toBe('invoice');
    expect(request.budgetCategoryId).toBe('bc-roofing');
    expect(request.budgetSourceId).toBe('bs-002');
    expect(request.vendorId).toBe('v-005');
  });

  it('allows nullable fields to be explicitly set to null', () => {
    const request: UpdateBudgetLineRequest = {
      description: null,
      budgetCategoryId: null,
      budgetSourceId: null,
      vendorId: null,
    };

    expect(request.description).toBeNull();
    expect(request.budgetCategoryId).toBeNull();
    expect(request.budgetSourceId).toBeNull();
    expect(request.vendorId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SubsidyPaybackEntry
// ---------------------------------------------------------------------------

describe('SubsidyPaybackEntry interface', () => {
  it('constructs a valid percentage reduction entry', () => {
    const entry: SubsidyPaybackEntry = {
      subsidyProgramId: 'sp-001',
      name: 'Green Energy Rebate',
      reductionType: 'percentage',
      reductionValue: 15,
      minPayback: 850,
      maxPayback: 1200,
    };

    expect(entry.subsidyProgramId).toBe('sp-001');
    expect(entry.name).toBe('Green Energy Rebate');
    expect(entry.reductionType).toBe('percentage');
    expect(entry.reductionValue).toBe(15);
    expect(entry.minPayback).toBe(850);
    expect(entry.maxPayback).toBe(1200);
  });

  it('constructs a valid fixed reduction entry', () => {
    const entry: SubsidyPaybackEntry = {
      subsidyProgramId: 'sp-002',
      name: 'Home Improvement Grant',
      reductionType: 'fixed',
      reductionValue: 5000,
      minPayback: 5000,
      maxPayback: 5000,
    };

    expect(entry.reductionType).toBe('fixed');
    expect(entry.reductionValue).toBe(5000);
    // For fixed subsidies, min and max payback are equal
    expect(entry.minPayback).toBe(entry.maxPayback);
  });

  it('minPayback can be less than or equal to maxPayback', () => {
    const entry: SubsidyPaybackEntry = {
      subsidyProgramId: 'sp-003',
      name: 'Solar Panel Subsidy',
      reductionType: 'percentage',
      reductionValue: 20,
      minPayback: 2000,
      maxPayback: 2800,
    };

    expect(entry.minPayback).toBeLessThanOrEqual(entry.maxPayback);
  });

  it('accepts both reduction types in a list', () => {
    const entries: SubsidyPaybackEntry[] = [
      {
        subsidyProgramId: 'sp-p',
        name: 'Percentage Program',
        reductionType: 'percentage',
        reductionValue: 10,
        minPayback: 100,
        maxPayback: 150,
      },
      {
        subsidyProgramId: 'sp-f',
        name: 'Fixed Program',
        reductionType: 'fixed',
        reductionValue: 3000,
        minPayback: 3000,
        maxPayback: 3000,
      },
    ];

    expect(entries[0].reductionType).toBe('percentage');
    expect(entries[1].reductionType).toBe('fixed');
  });
});

// ---------------------------------------------------------------------------
// BudgetAggregate
// ---------------------------------------------------------------------------

describe('BudgetAggregate interface', () => {
  it('constructs a valid aggregate with all zero values', () => {
    const aggregate: BudgetAggregate = {
      totalPlanned: 0,
      totalActual: 0,
      subsidyReduction: 0,
      netCost: 0,
    };

    expect(aggregate.totalPlanned).toBe(0);
    expect(aggregate.totalActual).toBe(0);
    expect(aggregate.subsidyReduction).toBe(0);
    expect(aggregate.netCost).toBe(0);
  });

  it('constructs a valid aggregate with realistic values', () => {
    const aggregate: BudgetAggregate = {
      totalPlanned: 150000,
      totalActual: 138500,
      subsidyReduction: 12000,
      netCost: 126500,
    };

    expect(aggregate.totalPlanned).toBe(150000);
    expect(aggregate.totalActual).toBe(138500);
    expect(aggregate.subsidyReduction).toBe(12000);
    expect(aggregate.netCost).toBe(126500);
  });

  it('netCost can be computed as totalActual minus subsidyReduction', () => {
    const totalActual = 50000;
    const subsidyReduction = 8000;
    const aggregate: BudgetAggregate = {
      totalPlanned: 55000,
      totalActual,
      subsidyReduction,
      netCost: totalActual - subsidyReduction,
    };

    expect(aggregate.netCost).toBe(42000);
  });
});

// ---------------------------------------------------------------------------
// BudgetSummary
// ---------------------------------------------------------------------------

describe('BudgetSummary interface', () => {
  it('constructs a valid summary with a nested BudgetAggregate', () => {
    const summary: BudgetSummary = {
      budgetLineCount: 5,
      totalPlannedAmount: 80000,
      budgetSummary: {
        totalPlanned: 80000,
        totalActual: 72000,
        subsidyReduction: 5000,
        netCost: 67000,
      },
    };

    expect(summary.budgetLineCount).toBe(5);
    expect(summary.totalPlannedAmount).toBe(80000);
    expect(summary.budgetSummary.totalPlanned).toBe(80000);
    expect(summary.budgetSummary.totalActual).toBe(72000);
    expect(summary.budgetSummary.subsidyReduction).toBe(5000);
    expect(summary.budgetSummary.netCost).toBe(67000);
  });

  it('constructs a zero-state summary for an entity with no budget lines', () => {
    const summary: BudgetSummary = {
      budgetLineCount: 0,
      totalPlannedAmount: 0,
      budgetSummary: {
        totalPlanned: 0,
        totalActual: 0,
        subsidyReduction: 0,
        netCost: 0,
      },
    };

    expect(summary.budgetLineCount).toBe(0);
    expect(summary.totalPlannedAmount).toBe(0);
    expect(summary.budgetSummary).toEqual({
      totalPlanned: 0,
      totalActual: 0,
      subsidyReduction: 0,
      netCost: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// WorkItemBudgetLine extends BaseBudgetLine
// ---------------------------------------------------------------------------

describe('WorkItemBudgetLine interface (extends BaseBudgetLine)', () => {
  it('constructs a valid work item budget line with all base fields plus workItemId', () => {
    const line: WorkItemBudgetLine = {
      ...minimalBudgetLine,
      id: 'wbl-001',
      workItemId: 'wi-123',
    };

    expect(line.id).toBe('wbl-001');
    expect(line.workItemId).toBe('wi-123');
    expect(line.invoiceLink).toBeNull();
    // Base fields are present
    expect(line.plannedAmount).toBe(1000);
    expect(line.confidence).toBe('own_estimate');
  });

  it('can have a non-null invoiceLink when linked to an invoice', () => {
    const line: WorkItemBudgetLine = {
      ...minimalBudgetLine,
      id: 'wbl-002',
      workItemId: 'wi-456',
      actualCost: 3200,
      actualCostPaid: 1600,
      invoiceCount: 2,
      invoiceLink: {
        invoiceBudgetLineId: 'ibl-1',
        invoiceId: 'inv-a',
        invoiceNumber: 'E-001',
        invoiceDate: '2025-06-01',
        invoiceStatus: 'paid',
        itemizedAmount: 1600,
      },
    };

    expect(line.invoiceLink).not.toBeNull();
    expect(line.invoiceLink?.invoiceNumber).toBe('E-001');
    expect(line.invoiceLink?.invoiceStatus).toBe('paid');
    expect(line.invoiceCount).toBe(2);
  });

  it('can be assigned to a BaseBudgetLine variable (structural subtype)', () => {
    const wiLine: WorkItemBudgetLine = {
      ...minimalBudgetLine,
      id: 'wbl-subtype',
      workItemId: 'wi-789',
    };

    // Type system assignment — if this compiles, WorkItemBudgetLine satisfies BaseBudgetLine
    const baseLine: BaseBudgetLine = wiLine;

    expect(baseLine.id).toBe('wbl-subtype');
    expect(baseLine.plannedAmount).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// HouseholdItemBudgetLine extends BaseBudgetLine
// ---------------------------------------------------------------------------

describe('HouseholdItemBudgetLine interface (extends BaseBudgetLine)', () => {
  it('constructs a valid household item budget line with householdItemId', () => {
    const line: HouseholdItemBudgetLine = {
      ...minimalBudgetLine,
      id: 'hibl-001',
      householdItemId: 'hi-001',
    };

    expect(line.id).toBe('hibl-001');
    expect(line.householdItemId).toBe('hi-001');
    expect(line.invoiceLink).toBeNull();
    // Base fields are present
    expect(line.plannedAmount).toBe(1000);
    expect(line.actualCost).toBe(0);
    expect(line.invoiceCount).toBe(0);
  });

  it('can be assigned to a BaseBudgetLine variable (structural subtype)', () => {
    const hiLine: HouseholdItemBudgetLine = {
      ...minimalBudgetLine,
      id: 'hibl-subtype',
      householdItemId: 'hi-sub-001',
    };

    // Type system assignment — if this compiles, HouseholdItemBudgetLine satisfies BaseBudgetLine
    const baseLine: BaseBudgetLine = hiLine;

    expect(baseLine.id).toBe('hibl-subtype');
    expect(baseLine.confidence).toBe('own_estimate');
  });
});

// ---------------------------------------------------------------------------
// Type alias compatibility — CreateWorkItemBudgetRequest = CreateBudgetLineRequest
// ---------------------------------------------------------------------------

describe('CreateWorkItemBudgetRequest type alias', () => {
  it('is assignable from CreateBudgetLineRequest (bidirectional)', () => {
    const base: CreateBudgetLineRequest = {
      plannedAmount: 4000,
      confidence: 'quote',
    };

    // Assign base to the WI alias type — must compile without type errors
    const wiRequest: CreateWorkItemBudgetRequest = base;
    expect(wiRequest.plannedAmount).toBe(4000);
    expect(wiRequest.confidence).toBe('quote');
  });

  it('is assignable TO CreateBudgetLineRequest (reverse direction)', () => {
    const wiRequest: CreateWorkItemBudgetRequest = {
      plannedAmount: 7500,
      description: 'Tile work',
      vendorId: 'v-003',
    };

    const base: CreateBudgetLineRequest = wiRequest;
    expect(base.plannedAmount).toBe(7500);
    expect(base.description).toBe('Tile work');
  });
});

// ---------------------------------------------------------------------------
// Type alias compatibility — UpdateWorkItemBudgetRequest = UpdateBudgetLineRequest
// ---------------------------------------------------------------------------

describe('UpdateWorkItemBudgetRequest type alias', () => {
  it('is assignable from UpdateBudgetLineRequest (bidirectional)', () => {
    const base: UpdateBudgetLineRequest = { plannedAmount: 9000, confidence: 'invoice' };
    const wiRequest: UpdateWorkItemBudgetRequest = base;

    expect(wiRequest.plannedAmount).toBe(9000);
    expect(wiRequest.confidence).toBe('invoice');
  });

  it('is assignable TO UpdateBudgetLineRequest (reverse direction)', () => {
    const wiRequest: UpdateWorkItemBudgetRequest = { description: 'Painting walls' };
    const base: UpdateBudgetLineRequest = wiRequest;

    expect(base.description).toBe('Painting walls');
  });
});

// ---------------------------------------------------------------------------
// Type alias compatibility — CreateHouseholdItemBudgetRequest = CreateBudgetLineRequest
// ---------------------------------------------------------------------------

describe('CreateHouseholdItemBudgetRequest type alias', () => {
  it('is assignable from CreateBudgetLineRequest (bidirectional)', () => {
    const base: CreateBudgetLineRequest = {
      plannedAmount: 2500,
      confidence: 'own_estimate',
    };

    const hiRequest: CreateHouseholdItemBudgetRequest = base;
    expect(hiRequest.plannedAmount).toBe(2500);
    expect(hiRequest.confidence).toBe('own_estimate');
  });

  it('is assignable TO CreateBudgetLineRequest (reverse direction)', () => {
    const hiRequest: CreateHouseholdItemBudgetRequest = {
      plannedAmount: 1200,
      budgetCategoryId: 'bc-furniture',
    };

    const base: CreateBudgetLineRequest = hiRequest;
    expect(base.plannedAmount).toBe(1200);
    expect(base.budgetCategoryId).toBe('bc-furniture');
  });
});

// ---------------------------------------------------------------------------
// Type alias compatibility — UpdateHouseholdItemBudgetRequest = UpdateBudgetLineRequest
// ---------------------------------------------------------------------------

describe('UpdateHouseholdItemBudgetRequest type alias', () => {
  it('is assignable from UpdateBudgetLineRequest (bidirectional)', () => {
    const base: UpdateBudgetLineRequest = { vendorId: null, confidence: 'professional_estimate' };
    const hiRequest: UpdateHouseholdItemBudgetRequest = base;

    expect(hiRequest.vendorId).toBeNull();
    expect(hiRequest.confidence).toBe('professional_estimate');
  });

  it('is assignable TO UpdateBudgetLineRequest (reverse direction)', () => {
    const hiRequest: UpdateHouseholdItemBudgetRequest = { plannedAmount: 3300 };
    const base: UpdateBudgetLineRequest = hiRequest;

    expect(base.plannedAmount).toBe(3300);
  });
});

// ---------------------------------------------------------------------------
// Subsidy payback alias compatibility
// ---------------------------------------------------------------------------

describe('WorkItemSubsidyPaybackEntry type alias (= SubsidyPaybackEntry)', () => {
  it('is assignable from SubsidyPaybackEntry', () => {
    const base: SubsidyPaybackEntry = {
      subsidyProgramId: 'sp-wi-01',
      name: 'Insulation Grant',
      reductionType: 'percentage',
      reductionValue: 25,
      minPayback: 500,
      maxPayback: 750,
    };

    const wiEntry: WorkItemSubsidyPaybackEntry = base;
    expect(wiEntry.subsidyProgramId).toBe('sp-wi-01');
    expect(wiEntry.reductionType).toBe('percentage');
  });

  it('is assignable TO SubsidyPaybackEntry (reverse direction)', () => {
    const wiEntry: WorkItemSubsidyPaybackEntry = {
      subsidyProgramId: 'sp-wi-02',
      name: 'Window Replacement Fund',
      reductionType: 'fixed',
      reductionValue: 2000,
      minPayback: 2000,
      maxPayback: 2000,
    };

    const base: SubsidyPaybackEntry = wiEntry;
    expect(base.reductionValue).toBe(2000);
    expect(base.minPayback).toBe(base.maxPayback);
  });
});

describe('HouseholdItemSubsidyPaybackEntry type alias (= SubsidyPaybackEntry)', () => {
  it('is assignable from SubsidyPaybackEntry', () => {
    const base: SubsidyPaybackEntry = {
      subsidyProgramId: 'sp-hi-01',
      name: 'Appliance Rebate',
      reductionType: 'fixed',
      reductionValue: 300,
      minPayback: 300,
      maxPayback: 300,
    };

    const hiEntry: HouseholdItemSubsidyPaybackEntry = base;
    expect(hiEntry.subsidyProgramId).toBe('sp-hi-01');
    expect(hiEntry.reductionType).toBe('fixed');
  });

  it('is assignable TO SubsidyPaybackEntry (reverse direction)', () => {
    const hiEntry: HouseholdItemSubsidyPaybackEntry = {
      subsidyProgramId: 'sp-hi-02',
      name: 'Furniture Assistance Program',
      reductionType: 'percentage',
      reductionValue: 12,
      minPayback: 240,
      maxPayback: 360,
    };

    const base: SubsidyPaybackEntry = hiEntry;
    expect(base.reductionType).toBe('percentage');
    expect(base.reductionValue).toBe(12);
  });

  it('all three aliases are interchangeable (cross-alias assignment)', () => {
    // Since all three are aliases of the same base type, they should be mutually assignable
    const wiEntry: WorkItemSubsidyPaybackEntry = {
      subsidyProgramId: 'sp-cross',
      name: 'Cross-type Test',
      reductionType: 'percentage',
      reductionValue: 5,
      minPayback: 50,
      maxPayback: 75,
    };

    const hiEntry: HouseholdItemSubsidyPaybackEntry = wiEntry;
    const base: SubsidyPaybackEntry = hiEntry;

    expect(base.subsidyProgramId).toBe('sp-cross');
    expect(hiEntry.name).toBe('Cross-type Test');
  });
});

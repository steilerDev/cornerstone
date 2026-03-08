/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BaseBudgetLine, BudgetLineInvoiceLink } from '@cornerstone/shared';
import type { UseBudgetSectionReturn } from '../../hooks/useBudgetSection.js';
import type { BudgetSectionProps } from './BudgetSection.js';

// ─── Stub heavy child components ─────────────────────────────────────────────

jest.unstable_mockModule('./BudgetLineCard.js', () => ({
  BudgetLineCard: ({
    line,
    children,
  }: {
    line: BaseBudgetLine;
    children?: React.ReactNode;
  }) => (
    <div data-testid={`budget-line-card-${line.id}`}>
      <span>{line.description ?? 'no-description'}</span>
      {children}
    </div>
  ),
}));

jest.unstable_mockModule('./BudgetLineForm.js', () => ({
  BudgetLineForm: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="budget-line-form">{children}</div>
  ),
}));

jest.unstable_mockModule('./SubsidyLinkSection.js', () => ({
  SubsidyLinkSection: () => <div data-testid="subsidy-link-section" />,
}));

jest.unstable_mockModule('./BudgetCostOverview.js', () => ({
  BudgetCostOverview: () => <div data-testid="budget-cost-overview" />,
}));

jest.unstable_mockModule('./InvoiceGroup.js', () => ({
  InvoiceGroup: ({
    invoiceId,
    invoiceNumber,
    invoiceStatus,
    lines,
    onUnlink,
  }: {
    invoiceId: string;
    invoiceNumber: string | null;
    invoiceStatus: string;
    lines: BaseBudgetLine[];
    onUnlink: (lineId: string, invoiceBudgetLineId: string) => void;
  }) => (
    <div data-testid={`invoice-group-${invoiceId}`}>
      <span>{invoiceNumber ?? 'Invoice'}</span>
      <span>{invoiceStatus}</span>
      {lines.map((line) => (
        <div key={line.id} data-testid={`grouped-line-${line.id}`}>
          <span>{line.description}</span>
          {line.invoiceLink && (
            <button
              onClick={() => onUnlink(line.id, line.invoiceLink!.invoiceBudgetLineId)}
              data-testid={`unlink-btn-${line.id}`}
            >
              Unlink
            </button>
          )}
        </div>
      ))}
    </div>
  ),
}));

// ─── Import component under test after mocks ──────────────────────────────────

let BudgetSection: (typeof import('./BudgetSection.js'))['BudgetSection'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildInvoiceLink(
  invoiceId: string,
  invoiceBudgetLineId: string = 'ibl-1',
): BudgetLineInvoiceLink {
  return {
    invoiceBudgetLineId,
    invoiceId,
    invoiceNumber: `INV-${invoiceId}`,
    invoiceDate: '2025-01-15',
    invoiceStatus: 'pending',
    itemizedAmount: 500,
  };
}

function buildLine(id: string, invoiceLink: BudgetLineInvoiceLink | null = null): BaseBudgetLine {
  return {
    id,
    description: `Line ${id}`,
    plannedAmount: 1000,
    confidence: 'own_estimate',
    confidenceMargin: 0.2,
    budgetCategory: null,
    budgetSource: null,
    vendor: null,
    actualCost: invoiceLink ? 500 : 0,
    actualCostPaid: 0,
    invoiceCount: invoiceLink ? 1 : 0,
    invoiceLink,
    createdBy: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };
}

function buildHookReturn(
  overrides?: Partial<UseBudgetSectionReturn>,
): UseBudgetSectionReturn {
  return {
    showBudgetForm: false,
    budgetForm: {
      description: '',
      plannedAmount: '',
      confidence: 'own_estimate',
      budgetCategoryId: '',
      budgetSourceId: '',
      vendorId: '',
    },
    editingBudgetId: null,
    isSavingBudget: false,
    budgetFormError: null,
    deletingBudgetId: null,
    selectedSubsidyId: '',
    isLinkingSubsidy: false,
    openAddBudgetForm: jest.fn(),
    openEditBudgetForm: jest.fn(),
    closeBudgetForm: jest.fn(),
    handleSaveBudgetLine: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleDeleteBudgetLine: jest.fn(),
    confirmDeleteBudgetLine: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setBudgetFormPartial: jest.fn(),
    setBudgetForm: jest.fn(),
    setDeletingBudgetId: jest.fn(),
    handleLinkSubsidy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleUnlinkSubsidy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setSelectedSubsidyId: jest.fn(),
    ...overrides,
  };
}

function buildProps(
  budgetLines: BaseBudgetLine[],
  overrides?: Partial<BudgetSectionProps<BaseBudgetLine>>,
): BudgetSectionProps<BaseBudgetLine> {
  return {
    budgetLines,
    subsidyPayback: null,
    linkedSubsidies: [],
    availableSubsidies: [],
    budgetSectionHook: buildHookReturn(),
    budgetSources: [],
    vendors: [],
    onLinkSubsidy: jest.fn(),
    onUnlinkSubsidy: jest.fn(),
    onConfirmDeleteBudgetLine: jest.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BudgetSection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await import('./BudgetSection.js');
    BudgetSection = module.BudgetSection;
  });

  it('lines with same invoiceId are grouped into a single InvoiceGroup', () => {
    const link = buildInvoiceLink('inv-1');
    const line1 = buildLine('line-1', link);
    const line2 = buildLine('line-2', { ...link, invoiceBudgetLineId: 'ibl-2' });

    render(<BudgetSection {...buildProps([line1, line2])} />);

    // One InvoiceGroup for inv-1
    expect(screen.getByTestId('invoice-group-inv-1')).toBeTruthy();
    // Both lines rendered inside the group
    expect(screen.getByTestId('grouped-line-line-1')).toBeTruthy();
    expect(screen.getByTestId('grouped-line-line-2')).toBeTruthy();
  });

  it('lines with different invoiceIds produce separate InvoiceGroups', () => {
    const link1 = buildInvoiceLink('inv-1', 'ibl-1');
    const link2 = buildInvoiceLink('inv-2', 'ibl-2');
    const line1 = buildLine('line-1', link1);
    const line2 = buildLine('line-2', link2);

    render(<BudgetSection {...buildProps([line1, line2])} />);

    expect(screen.getByTestId('invoice-group-inv-1')).toBeTruthy();
    expect(screen.getByTestId('invoice-group-inv-2')).toBeTruthy();
  });

  it('unlinked lines (invoiceLink=null) rendered as standalone BudgetLineCards', () => {
    const line = buildLine('line-u', null);

    render(<BudgetSection {...buildProps([line])} />);

    expect(screen.getByTestId('budget-line-card-line-u')).toBeTruthy();
    // Should NOT appear inside any invoice group
    expect(screen.queryByTestId('invoice-group-inv-1')).toBeNull();
  });

  it('unlinked lines have Link to Invoice button when budgetLineType and onLinkInvoice provided', () => {
    const line = buildLine('line-u', null);
    const onLinkInvoice = jest.fn();

    render(
      <BudgetSection
        {...buildProps([line], {
          budgetLineType: 'work_item',
          onLinkInvoice,
        })}
      />,
    );

    const linkBtn = screen.getByRole('button', { name: /link to invoice/i });
    expect(linkBtn).toBeTruthy();

    fireEvent.click(linkBtn);
    expect(onLinkInvoice).toHaveBeenCalledWith('line-u');
  });

  it('unlinked lines do NOT have Link to Invoice button when budgetLineType is not provided', () => {
    const line = buildLine('line-u', null);

    // No budgetLineType or onLinkInvoice
    render(<BudgetSection {...buildProps([line])} />);

    expect(screen.queryByRole('button', { name: /link to invoice/i })).toBeNull();
  });

  it('linked lines inside InvoiceGroups do not show standalone Link to Invoice button', () => {
    const link = buildInvoiceLink('inv-1');
    const line = buildLine('line-1', link);
    const onLinkInvoice = jest.fn();

    render(
      <BudgetSection
        {...buildProps([line], {
          budgetLineType: 'work_item',
          onLinkInvoice,
        })}
      />,
    );

    // InvoiceGroup is rendered (not BudgetLineCard directly)
    expect(screen.getByTestId('invoice-group-inv-1')).toBeTruthy();
    // No standalone "Link to Invoice" button outside the group
    expect(screen.queryByRole('button', { name: /^link to invoice$/i })).toBeNull();
  });

  it('mixed: some linked, some unlinked — renders both InvoiceGroup and standalone cards', () => {
    const link = buildInvoiceLink('inv-1');
    const linkedLine = buildLine('line-linked', link);
    const unlinkedLine = buildLine('line-free', null);
    const onLinkInvoice = jest.fn();

    render(
      <BudgetSection
        {...buildProps([linkedLine, unlinkedLine], {
          budgetLineType: 'work_item',
          onLinkInvoice,
        })}
      />,
    );

    expect(screen.getByTestId('invoice-group-inv-1')).toBeTruthy();
    expect(screen.getByTestId('budget-line-card-line-free')).toBeTruthy();
    // Link to Invoice button only for the unlinked line
    expect(screen.getByRole('button', { name: /link to invoice/i })).toBeTruthy();
  });

  it('shows empty state when no budget lines and form is hidden', () => {
    render(<BudgetSection {...buildProps([])} />);

    expect(
      screen.getByText('No budget lines yet. Add the first line to start tracking costs.'),
    ).toBeTruthy();
  });

  it('renders inline error banner when inlineError is provided', () => {
    render(<BudgetSection {...buildProps([], { inlineError: 'Something went wrong' })} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('Add Line button is visible when form is not shown', () => {
    render(<BudgetSection {...buildProps([])} />);

    expect(screen.getByRole('button', { name: /add budget line/i })).toBeTruthy();
  });

  it('onLinkInvoice is not provided — no Link to Invoice buttons even with budgetLineType', () => {
    const line = buildLine('line-u', null);

    render(
      <BudgetSection
        {...buildProps([line], {
          budgetLineType: 'work_item',
          // onLinkInvoice intentionally omitted
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /link to invoice/i })).toBeNull();
  });
});

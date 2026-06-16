/**
 * @jest-environment jsdom
 *
 * Unit tests for AutoItemizeLineList (Story #1703/#1704 — auto-itemize UI unification).
 *
 * Covers all 9 scenarios from the QA Spec:
 *   1. Renders N line cards given N lines
 *   2. Empty state with noLineItems message; no <ul> children
 *   3. Total displayed via formatCurrency
 *   4. Variance match when variancePercent <= 0.01
 *   5. Variance warning when variancePercent = 0.03
 *   6. Variance danger when variancePercent = 0.1
 *   7. Discretionary note shown when discretionarySourceId matches a line's budgetSourceId
 *   8. Discretionary note hidden when no lines have the discretionary source
 *   9. Callbacks propagated through to AutoItemizeLineCard
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks must come before any static imports ────────────────────────────────

// Mock AutoItemizeLineCard to keep the list test isolated from card internals
// and to capture callback propagation.

let capturedToggle: ((rowId: string) => void) | null = null;
let capturedFieldChange: ((rowId: string, field: unknown, value: unknown) => void) | null = null;
let capturedAssign: ((rowId: string) => void) | null = null;
let capturedClearAssign: ((rowId: string) => void) | null = null;

jest.unstable_mockModule('./AutoItemizeLineCard.js', () => ({
  AutoItemizeLineCard: ({
    line,
    onToggleInclude,
    onFieldChange,
    onAssign,
    onClearAssign,
  }: {
    line: { rowId: string; description: string };
    onToggleInclude: (rowId: string) => void;
    onFieldChange: (rowId: string, field: unknown, value: unknown) => void;
    onAssign: (rowId: string) => void;
    onClearAssign: (rowId: string) => void;
  }) => {
    // Capture callbacks for callback-propagation tests
    capturedToggle = onToggleInclude;
    capturedFieldChange = onFieldChange;
    capturedAssign = onAssign;
    capturedClearAssign = onClearAssign;

    return (
      <li data-testid={`line-card-${line.rowId}`}>
        {line.description}
      </li>
    );
  },
}));

// ─── Dynamic import ────────────────────────────────────────────────────────────

import React from 'react';
import type * as AutoItemizeLineListModule from './AutoItemizeLineList.js';
import type { LineWithInclude } from './types.js';

let AutoItemizeLineList: (typeof AutoItemizeLineListModule)['AutoItemizeLineList'];

beforeEach(async () => {
  ({ AutoItemizeLineList } =
    (await import('./AutoItemizeLineList.js')) as typeof AutoItemizeLineListModule);

  capturedToggle = null;
  capturedFieldChange = null;
  capturedAssign = null;
  capturedClearAssign = null;
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLine(
  rowId: string,
  overrides: Partial<LineWithInclude> = {},
): LineWithInclude {
  return {
    rowId,
    description: `Line ${rowId}`,
    totalAmount: 100,
    confidence: 0.9,
    included: true,
    includesVat: false,
    quantity: undefined,
    unit: undefined,
    unitPrice: undefined,
    vendorName: undefined,
    budgetCategoryId: null,
    budgetSourceId: null,
    ...overrides,
  };
}

const t = (key: string) => key;
const tSettings = (key: string) => key;
const formatCurrency = (v: number) => `€${v.toFixed(2)}`;
const createdFromExtractionVariants = {
  true: { label: 'Auto-created', className: 'badge-info' },
};

// ─── Render helper ─────────────────────────────────────────────────────────────

function renderList(
  lines: LineWithInclude[],
  opts: {
    discretionarySourceId?: string;
    computedTotal?: number;
    variance?: number;
    variancePercent?: number;
    onToggleInclude?: (rowId: string) => void;
    onFieldChange?: (rowId: string, field: keyof LineWithInclude, value: unknown) => void;
    onAssign?: (rowId: string) => void;
    onClearAssign?: (rowId: string) => void;
  } = {},
) {
  return render(
    React.createElement(AutoItemizeLineList, {
      lines,
      onToggleInclude: opts.onToggleInclude ?? jest.fn(),
      onFieldChange: opts.onFieldChange ?? jest.fn(),
      onAssign: opts.onAssign ?? jest.fn(),
      onClearAssign: opts.onClearAssign ?? jest.fn(),
      categories: [],
      budgetSources: [
        { id: 'src-1', name: 'Main', isDiscretionary: false },
        { id: 'disc-1', name: 'Discretionary', isDiscretionary: true },
      ],
      discretionarySourceId: opts.discretionarySourceId,
      computedTotal: opts.computedTotal ?? 0,
      variance: opts.variance ?? 0,
      variancePercent: opts.variancePercent ?? 0,
      createdFromExtractionVariants,
      formatCurrency,
      t: t as any,
      tSettings: tSettings as any,
    }),
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutoItemizeLineList', () => {
  // 1. Renders N line cards given N lines
  it('renders 3 <li> elements inside role="list" when given 3 lines', () => {
    renderList([makeLine('r1'), makeLine('r2'), makeLine('r3')]);

    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    expect(list.tagName.toLowerCase()).toBe('ul');

    // The mocked AutoItemizeLineCard renders as <li> elements
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  // 2. Empty state when 0 lines
  it('renders noLineItems message when given 0 lines', () => {
    renderList([]);

    // The empty message uses the translation key 'autoItemize.noLineItems'
    const emptyMsg = screen.getByText('autoItemize.noLineItems');
    expect(emptyMsg).toBeInTheDocument();

    // No <ul role="list"> with <li> children
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  // 3. Total displayed
  it('shows the formatted computedTotal in the totals card', () => {
    renderList([makeLine('r1')], { computedTotal: 350.5 });

    // formatCurrency(350.5) = '€350.50'
    expect(screen.getByText('€350.50')).toBeInTheDocument();
  });

  // 4. Variance match when variancePercent <= 0.01
  it('renders varianceMatch span when variancePercent=0.005', () => {
    renderList([makeLine('r1')], { variancePercent: 0.005 });

    // The CSS class name is hashed but the text content is the translation key
    expect(screen.getByText('autoItemize.varianceMatch')).toBeInTheDocument();
    expect(screen.queryByText('autoItemize.varianceWarning')).not.toBeInTheDocument();
    expect(screen.queryByText('autoItemize.varianceDanger')).not.toBeInTheDocument();
  });

  it('renders varianceMatch span when variancePercent=0 (exactly zero)', () => {
    renderList([makeLine('r1')], { variancePercent: 0 });
    expect(screen.getByText('autoItemize.varianceMatch')).toBeInTheDocument();
  });

  it('renders varianceMatch span when variancePercent=0.01 (boundary)', () => {
    renderList([makeLine('r1')], { variancePercent: 0.01 });
    expect(screen.getByText('autoItemize.varianceMatch')).toBeInTheDocument();
  });

  // 5. Variance warning when variancePercent = 0.03
  it('renders varianceWarning span when variancePercent=0.03', () => {
    renderList([makeLine('r1')], { variancePercent: 0.03 });

    expect(screen.getByText('autoItemize.varianceWarning')).toBeInTheDocument();
    expect(screen.queryByText('autoItemize.varianceMatch')).not.toBeInTheDocument();
    expect(screen.queryByText('autoItemize.varianceDanger')).not.toBeInTheDocument();
  });

  it('renders varianceWarning at the 0.05 boundary (inclusive)', () => {
    renderList([makeLine('r1')], { variancePercent: 0.05 });
    expect(screen.getByText('autoItemize.varianceWarning')).toBeInTheDocument();
  });

  // 6. Variance danger when variancePercent = 0.1
  it('renders varianceDanger span when variancePercent=0.1', () => {
    renderList([makeLine('r1')], { variancePercent: 0.1 });

    expect(screen.getByText('autoItemize.varianceDanger')).toBeInTheDocument();
    expect(screen.queryByText('autoItemize.varianceMatch')).not.toBeInTheDocument();
    expect(screen.queryByText('autoItemize.varianceWarning')).not.toBeInTheDocument();
  });

  // 7. Discretionary note shown
  it('renders role="note" discretionary note when a line has the discretionary budgetSourceId', () => {
    const lines = [
      makeLine('r1', { budgetSourceId: 'disc-1' }),
      makeLine('r2', { budgetSourceId: 'src-1' }),
    ];
    renderList(lines, { discretionarySourceId: 'disc-1' });

    const note = screen.getByRole('note');
    expect(note).toBeInTheDocument();
  });

  // 8. Discretionary note hidden when no lines have discretionary source
  it('does not render discretionary note when no lines have the discretionary budgetSourceId', () => {
    const lines = [
      makeLine('r1', { budgetSourceId: 'src-1' }),
      makeLine('r2', { budgetSourceId: 'src-1' }),
    ];
    renderList(lines, { discretionarySourceId: 'disc-1' });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('does not render discretionary note when discretionarySourceId is undefined', () => {
    const lines = [makeLine('r1', { budgetSourceId: 'disc-1' })];
    renderList(lines, { discretionarySourceId: undefined });

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  // 9. Callbacks propagated through to AutoItemizeLineCard
  it('propagates onToggleInclude to AutoItemizeLineCard', () => {
    const onToggleInclude = jest.fn<(rowId: string) => void>();
    renderList([makeLine('r1')], { onToggleInclude });

    // The mock captures the callback; invoke it to verify propagation
    expect(capturedToggle).not.toBeNull();
    capturedToggle!('r1');
    expect(onToggleInclude).toHaveBeenCalledWith('r1');
  });

  it('propagates onFieldChange to AutoItemizeLineCard', () => {
    const onFieldChange = jest.fn();
    renderList([makeLine('r1')], { onFieldChange: onFieldChange as any });

    expect(capturedFieldChange).not.toBeNull();
    capturedFieldChange!('r1', 'description', 'New value');
    expect(onFieldChange).toHaveBeenCalledWith('r1', 'description', 'New value');
  });

  it('propagates onAssign to AutoItemizeLineCard', () => {
    const onAssign = jest.fn<(rowId: string) => void>();
    renderList([makeLine('r1')], { onAssign });

    expect(capturedAssign).not.toBeNull();
    capturedAssign!('r1');
    expect(onAssign).toHaveBeenCalledWith('r1');
  });

  it('propagates onClearAssign to AutoItemizeLineCard', () => {
    const onClearAssign = jest.fn<(rowId: string) => void>();
    renderList([makeLine('r1')], { onClearAssign });

    expect(capturedClearAssign).not.toBeNull();
    capturedClearAssign!('r1');
    expect(onClearAssign).toHaveBeenCalledWith('r1');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  it('renders the "autoItemize.total" label in the totals card', () => {
    renderList([makeLine('r1')], { computedTotal: 100 });
    expect(screen.getByText('autoItemize.total')).toBeInTheDocument();
  });

  it('renders all 3 line cards when given 3 lines (testid check)', () => {
    renderList([makeLine('r1'), makeLine('r2'), makeLine('r3')]);
    expect(screen.getByTestId('line-card-r1')).toBeInTheDocument();
    expect(screen.getByTestId('line-card-r2')).toBeInTheDocument();
    expect(screen.getByTestId('line-card-r3')).toBeInTheDocument();
  });

  it('still renders the totals card even when 0 lines', () => {
    renderList([]);
    // The totals card always renders (it's outside the lines.length === 0 branch)
    expect(screen.getByText('autoItemize.total')).toBeInTheDocument();
  });

  it('does not show discretionary note when discretionarySourceId is undefined even if a line has a matching id', () => {
    const lines = [makeLine('r1', { budgetSourceId: undefined as unknown as string })];
    renderList(lines, { discretionarySourceId: undefined });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

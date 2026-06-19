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
 *   9. Callbacks propagated through to AutoItemizeLineCard (via real DOM interactions)
 *
 * NOTE: The mock for AutoItemizeLineCard does not reliably intercept in Jest ESM mode
 * (module caching/isolation constraints). The real AutoItemizeLineCard is used instead,
 * and callback propagation is verified via real DOM interactions.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks must come before any static imports ────────────────────────────────

// Mock categoryUtils to avoid needing real translation infrastructure in the real AutoItemizeLineCard
jest.unstable_mockModule('../../lib/categoryUtils.js', () => ({
  getCategoryDisplayName: (_t: unknown, name: string, _translationKey: unknown) => name,
  useCategoryDisplayName: (_name: string, _translationKey: unknown) => _name,
}));

// Mock Badge to render a span with data-testid when provided
jest.unstable_mockModule('../Badge/Badge.js', () => ({
  Badge: (props: {
    testId?: string;
    variants?: Record<string, { label: string }>;
    value?: string;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const R = require('react') as { createElement: (...args: any[]) => unknown };
    const label = props.variants && props.value ? (props.variants[props.value]?.label ?? '') : '';
    return props.testId
      ? R.createElement('span', { 'data-testid': props.testId }, label)
      : R.createElement('span', null, label);
  },
}));

// ─── Dynamic import ────────────────────────────────────────────────────────────

import React from 'react';
import type * as AutoItemizeLineListModule from './AutoItemizeLineList.js';
import type { LineWithInclude } from './types.js';
import type { BudgetSource } from '@cornerstone/shared';

let AutoItemizeLineList: (typeof AutoItemizeLineListModule)['AutoItemizeLineList'];

beforeEach(async () => {
  ({ AutoItemizeLineList } =
    (await import('./AutoItemizeLineList.js')) as typeof AutoItemizeLineListModule);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLine(rowId: string, overrides: Partial<LineWithInclude> = {}): LineWithInclude {
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
      ] as unknown as BudgetSource[],
      discretionarySourceId: opts.discretionarySourceId,
      computedTotal: opts.computedTotal ?? 0,
      variance: opts.variance ?? 0,
      variancePercent: opts.variancePercent ?? 0,
      createdFromExtractionVariants,
      formatCurrency,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: t as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // The real AutoItemizeLineCard renders as <li> elements
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

  // 9. Callbacks propagated through to AutoItemizeLineCard (via real DOM interactions)
  //
  // The mock for AutoItemizeLineCard does not reliably intercept in Jest ESM mode.
  // Instead we interact with the real rendered DOM to verify that callbacks passed to
  // AutoItemizeLineList are forwarded to AutoItemizeLineCard and fire correctly.

  it('propagates onToggleInclude to AutoItemizeLineCard (real checkbox interaction)', () => {
    const onToggleInclude = jest.fn<(rowId: string) => void>();
    renderList([makeLine('r1')], { onToggleInclude });

    // The real AutoItemizeLineCard renders an include checkbox as the first checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    const includeCheckbox = checkboxes[0]!;
    fireEvent.click(includeCheckbox);

    expect(onToggleInclude).toHaveBeenCalledWith('r1');
  });

  it('propagates onFieldChange to AutoItemizeLineCard (real textarea interaction)', () => {
    const onFieldChange = jest.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderList([makeLine('r1')], { onFieldChange: onFieldChange as any });

    // The real AutoItemizeLineCard renders a textarea for description
    const textarea = screen.getByDisplayValue('Line r1');
    fireEvent.change(textarea, { target: { value: 'Updated' } });

    expect(onFieldChange).toHaveBeenCalledWith('r1', 'description', 'Updated');
  });

  it('propagates onAssign to AutoItemizeLineCard (real button click)', () => {
    const onAssign = jest.fn<(rowId: string) => void>();
    renderList([makeLine('r1')], { onAssign });

    // The real AutoItemizeLineCard renders an Assign button when no assignment exists.
    // t('autoItemize.assignButton') = 'autoItemize.assignButton' (t stub returns key)
    const assignBtn = screen.getByRole('button', { name: /autoItemize.assignButton/i });
    fireEvent.click(assignBtn);

    expect(onAssign).toHaveBeenCalledWith('r1');
  });

  it('propagates onClearAssign to AutoItemizeLineCard (real button click)', () => {
    const onClearAssign = jest.fn<(rowId: string) => void>();
    // Render a line that is already assigned so the clear button is visible
    renderList(
      [makeLine('r1', { assignedBudgetLineId: 'abc', assignedBudgetLineDescription: 'My Line' })],
      {
        onClearAssign,
      },
    );

    // The real AutoItemizeLineCard renders a clear (✕) button with aria-label
    const clearBtn = screen.getByRole('button', {
      name: /autoItemize.clearAssignmentAriaLabel/i,
    });
    fireEvent.click(clearBtn);

    expect(onClearAssign).toHaveBeenCalledWith('r1');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  it('renders the "autoItemize.total" label in the totals card', () => {
    renderList([makeLine('r1')], { computedTotal: 100 });
    expect(screen.getByText('autoItemize.total')).toBeInTheDocument();
  });

  it('renders all 3 line descriptions when given 3 lines', () => {
    renderList([makeLine('r1'), makeLine('r2'), makeLine('r3')]);
    // The real card renders a textarea with the description value
    expect(screen.getByDisplayValue('Line r1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Line r2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Line r3')).toBeInTheDocument();
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

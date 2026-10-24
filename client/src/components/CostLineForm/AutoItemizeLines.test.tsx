/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseAutoItemizeLinesReturn } from '../../hooks/useAutoItemizeLines.js';
import type * as LinesModule from './AutoItemizeLines.js';
import type * as ModelModule from './costLineGridModel.js';
import type { CostLineGridProps, CostLineGridRow } from './types.js';

// ─── Module boundaries ───────────────────────────────────────────────────────

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});

jest.unstable_mockModule('../../hooks/useAutoItemizeLines.js', () => ({
  AUTO_ITEMIZE_GRID_PREFIX: 'auto-itemize-grid',
  AUTO_ITEMIZE_GRID_OPTIONS: {
    targets: true,
    requireTarget: false,
    positiveGross: true,
    columns: ['category', 'fundingSource'],
    include: true,
    select: true,
    existingLines: true,
  },
}));

let lastGridProps: CostLineGridProps | null = null;
jest.unstable_mockModule('./CostLineGrid.js', () => ({
  CostLineGrid: (props: CostLineGridProps) => {
    lastGridProps = props;
    return (
      <div data-testid="grid-probe" data-prefix={props.testIdPrefix}>
        {props.rows.map((row) => (
          <div key={row.rowId} data-testid={`extra-${row.rowId}`}>
            {props.renderRowExtra?.(row)}
          </div>
        ))}
      </div>
    );
  },
}));

let AutoItemizeLines: typeof LinesModule.AutoItemizeLines;
let blankGridRow: typeof ModelModule.blankGridRow;

beforeEach(async () => {
  jest.clearAllMocks();
  lastGridProps = null;
  ({ AutoItemizeLines } = await import('./AutoItemizeLines.js'));
  ({ blankGridRow } = await import('./costLineGridModel.js'));
});

const row = (rowId: string, patch: Partial<CostLineGridRow> = {}): CostLineGridRow => ({
  ...blankGridRow(rowId),
  ...patch,
});

function makeState(over: Partial<UseAutoItemizeLinesReturn> = {}): UseAutoItemizeLinesReturn {
  return {
    rows: [row('a', { description: 'Tile', unitPrice: '10', aiCertainty: 0.876 }), row('b')],
    data: new Map(),
    assignAll: null,
    setAssignAll: jest.fn(),
    options: {
      categories: [],
      sources: [],
      categoryOptions: [{ value: 'c1', label: 'Materials' }],
      sourceOptions: [{ value: 's1', label: 'Savings' }],
      discretionarySourceId: 'disc',
      loading: false,
      failed: false,
    },
    selectedRowIds: new Set<string>(),
    showAllErrors: false,
    load: jest.fn(),
    onRowsChange: jest.fn(),
    replaceRows: jest.fn(),
    onToggleSelect: jest.fn(),
    onClearSelection: jest.fn(),
    onMergeSelected: jest.fn(),
    onNoticeAction: jest.fn(),
    applyBudgetSource: jest.fn(() => 0),
    validate: jest.fn(() => true),
    commitContext: jest.fn(),
    ...over,
  } as unknown as UseAutoItemizeLinesReturn;
}

function setup(
  state: UseAutoItemizeLinesReturn,
  amounts: { computedTotal?: number; variance?: number; variancePercent?: number } = {},
) {
  const onAnnounce = jest.fn<(message: string) => void>();
  const user = userEvent.setup();
  render(
    <AutoItemizeLines
      state={state}
      computedTotal={amounts.computedTotal ?? 100}
      variance={amounts.variance ?? 0}
      variancePercent={amounts.variancePercent ?? 0}
      onAnnounce={onAnnounce}
    />,
  );
  return { user, onAnnounce };
}

describe('AutoItemizeLines grid wiring', () => {
  it('passes the hook state and the page announcer to the shared grid', () => {
    const state = makeState({ selectedRowIds: new Set(['a']), showAllErrors: true });
    const { onAnnounce } = setup(state);
    expect(screen.getByTestId('grid-probe')).toHaveAttribute('data-prefix', 'auto-itemize-grid');
    expect(lastGridProps).toMatchObject({
      rows: state.rows,
      onRowsChange: state.onRowsChange,
      assignAll: null,
      onAssignAllChange: state.setAssignAll,
      categoryOptions: state.options.categoryOptions,
      sourceOptions: state.options.sourceOptions,
      showAllErrors: true,
      onAnnounce,
      selectedRowIds: state.selectedRowIds,
      onToggleSelect: state.onToggleSelect,
      onNoticeAction: state.onNoticeAction,
    });
    expect(lastGridProps?.options).toMatchObject({ include: true, select: true });
    expect(lastGridProps?.selectLinkedReason).toBe(
      'A line linked to an existing cost line cannot be merged.',
    );
  });

  it('renders the AI certainty under AI rows only', () => {
    setup(makeState());
    expect(within(screen.getByTestId('extra-a')).getByText('AI certainty 88%')).toBeInTheDocument();
    expect(screen.getByTestId('extra-b')).toBeEmptyDOMElement();
  });
});

describe('empty state and funding note', () => {
  it('says nothing was extracted while only the blank row exists', () => {
    setup(makeState({ rows: [row('a')] }));
    expect(screen.getByText('No line items extracted')).toBeInTheDocument();
  });

  it('hides the empty message once a row has content', () => {
    setup(makeState());
    expect(screen.queryByText('No line items extracted')).not.toBeInTheDocument();
  });

  it('notes the discretionary funding source when a new line uses it', () => {
    setup(
      makeState({ rows: [row('a', { description: 'Tile', budgetSourceId: 'disc' }), row('b')] }),
    );
    expect(screen.getByRole('note')).toHaveTextContent(/Discretionary Funding source/);
  });

  it('shows no note for other sources, linked rows or a missing discretionary source', () => {
    const linked = row('l', {
      unitPrice: '5',
      budgetSourceId: 'disc',
      existingLine: { id: 'e', type: 'work_item', description: 'x', gross: 5 },
    });
    setup(makeState({ rows: [row('a', { description: 'Tile', budgetSourceId: 's1' }), linked] }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows no note without a discretionary source', () => {
    const base = makeState();
    setup(
      makeState({
        rows: [row('a', { description: 'Tile', budgetSourceId: 'disc' })],
        options: { ...base.options, discretionarySourceId: null },
      }),
    );
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('totals and variance', () => {
  it.each([
    ['matches within 1%', 0, 0.005, 'Amount matches invoice total'],
    ['is a warning within 5%', -3, 0.03, '€3.00 variance (within tolerance)'],
    ['is danger above 5%', 20, 0.2, '€20.00 variance (exceeds tolerance)'],
  ])('variance %s', (_name, variance, percent, text) => {
    setup(makeState(), { computedTotal: 123.45, variance, variancePercent: percent });
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('€123.45')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(text.replace(/[.()]/g, '\\$&')))).toBeInTheDocument();
  });
});

describe('merge bar', () => {
  it('is hidden without a selection', () => {
    setup(makeState());
    expect(screen.queryByTestId('auto-itemize-merge')).not.toBeInTheDocument();
  });

  it('keeps Merge aria-disabled with its hint while fewer than two rows are selected', async () => {
    const state = makeState({ selectedRowIds: new Set(['a']) });
    const { user } = setup(state);
    const merge = screen.getByTestId('auto-itemize-merge');
    expect(merge).toHaveAttribute('aria-disabled', 'true');
    expect(merge).toHaveAccessibleName('Merge 1 selected line items');
    expect(merge).toHaveAccessibleDescription('Select at least 2 items to merge');
    await user.click(merge);
    expect(state.onMergeSelected).not.toHaveBeenCalled();
  });

  it('merges from two selected rows and clears the selection', async () => {
    const state = makeState({ selectedRowIds: new Set(['a', 'b']) });
    const { user } = setup(state);
    const merge = screen.getByTestId('auto-itemize-merge');
    expect(merge).not.toHaveAttribute('aria-disabled');
    expect(merge).not.toHaveAttribute('aria-describedby');
    await user.click(merge);
    expect(state.onMergeSelected).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(state.onClearSelection).toHaveBeenCalledTimes(1);
  });
});

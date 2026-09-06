import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

interface TestItem {
  id: string;
  title: string;
  amount: number;
}

interface ChildItem {
  id: string;
  label: string;
}

// Mock useColumnPreferences so column visibility/order is deterministic and
// controllable per-test (mirrors DataTable.test.tsx's harness).
const mockToggleColumn = jest.fn();
const mockMoveColumn = jest.fn();
const mockResetToDefaults = jest.fn();
const mockUseColumnPreferences = jest.fn();

jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: mockUseColumnPreferences,
}));

import type * as DataTableModule from './DataTable.js';

let DataTable: (typeof DataTableModule)['DataTable'];
type TableState = DataTableModule.TableState;
type ExpandableRowsConfig<T, C> = DataTableModule.ExpandableRowsConfig<T, C>;
type ColumnDef<T> = DataTableModule.ColumnDef<T>;

const COLUMNS: ColumnDef<TestItem>[] = [
  { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
  { key: 'amount', label: 'Amount', defaultVisible: true, render: (i) => String(i.amount) },
];

const SAMPLE_ITEMS: TestItem[] = [
  { id: 'item-1', title: 'Alpha Work', amount: 1000 },
  { id: 'item-2', title: 'Beta Work', amount: 2000 },
];

// item-1 has two children, item-2 has none (exercises both branches).
const CHILDREN_BY_PARENT: Record<string, ChildItem[]> = {
  'item-1': [
    { id: 'child-1a', label: 'Child A' },
    { id: 'child-1b', label: 'Child B' },
  ],
  'item-2': [],
};

function makeTableState(overrides: Partial<TableState> = {}): TableState {
  return {
    search: '',
    filters: new Map(),
    sortBy: null,
    sortDir: null,
    page: 1,
    pageSize: 25,
    ...overrides,
  };
}

function makeExpandableRows(
  overrides: Partial<ExpandableRowsConfig<TestItem, ChildItem>> = {},
): ExpandableRowsConfig<TestItem, ChildItem> {
  return {
    getChildren: (item) => CHILDREN_BY_PARENT[item.id] ?? [],
    getChildKey: (child) => child.id,
    renderChildCells: (child, _parent, keys): ReactNode =>
      keys.map((key) => (
        <td key={key} data-testid={`child-cell-${child.id}-${key}`}>
          {key === 'title' ? child.label : ''}
        </td>
      )),
    renderChildCard: (child) => <span data-testid={`child-card-${child.id}`}>{child.label}</span>,
    getExpandLabel: (item, expanded, count) =>
      `${expanded ? 'Collapse' : 'Expand'} ${item.title} (${count})`,
    ...overrides,
  };
}

function renderDataTable({
  items = SAMPLE_ITEMS,
  columns = COLUMNS,
  expandableRows = makeExpandableRows(),
  onRowClick,
  tableState = makeTableState(),
}: {
  items?: TestItem[];
  columns?: ColumnDef<TestItem>[];
  expandableRows?: ExpandableRowsConfig<TestItem, ChildItem>;
  onRowClick?: jest.Mock;
  tableState?: TableState;
} = {}) {
  return render(
    <DataTable<TestItem, ChildItem>
      pageKey="test-page"
      columns={columns}
      items={items}
      totalItems={items.length}
      totalPages={1}
      currentPage={1}
      isLoading={false}
      getRowKey={(item) => item.id}
      onRowClick={onRowClick}
      tableState={tableState}
      onStateChange={jest.fn()}
      expandableRows={expandableRows}
    />,
  );
}

beforeEach(async () => {
  ({ DataTable } = (await import('./DataTable.js')) as typeof DataTableModule);
  mockUseColumnPreferences.mockReturnValue({
    visibleColumns: new Set(COLUMNS.map((c) => c.key)),
    columnOrder: COLUMNS.map((c) => c.key),
    toggleColumn: mockToggleColumn,
    moveColumn: mockMoveColumn,
    resetToDefaults: mockResetToDefaults,
  });
  mockToggleColumn.mockReset();
  mockMoveColumn.mockReset();
  mockResetToDefaults.mockReset();
});

describe('DataTable expandableRows', () => {
  // ─── AC34: one tbody per item, correct cell counts ──────────────────────

  it('renders one <tbody id="row-group-{key}"> per item', () => {
    const { container } = renderDataTable();
    const groups = container.querySelectorAll('tbody[id^="row-group-"]');
    expect(groups).toHaveLength(SAMPLE_ITEMS.length);
    expect(container.querySelector('#row-group-item-1')).toBeInTheDocument();
    expect(container.querySelector('#row-group-item-2')).toBeInTheDocument();
  });

  it('header and body visible-column cell counts equal the configured visible column count', () => {
    const { container } = renderDataTable();
    // Leading expand <th> + 2 data columns = 3 header cells
    expect(container.querySelectorAll('thead th')).toHaveLength(3);
    // Each parent row: leading <td> + 2 data columns = 3 cells
    const parentRow = container.querySelector('#row-group-item-1 tr.tableRow')!;
    expect(parentRow.querySelectorAll('td')).toHaveLength(3);
  });

  // ─── AC35: child rows present in DOM before expansion; node identity stable ─

  it('renders child <tr> elements in the DOM even while collapsed by default (hidden attribute, not unmounted)', () => {
    const { container } = renderDataTable({
      expandableRows: makeExpandableRows({ isDefaultExpanded: () => false }),
    });
    const childRow = container.querySelector('#row-group-item-1 tr.childRow');
    expect(childRow).toBeInTheDocument();
    expect(childRow).toHaveAttribute('hidden');
    // `ByText` queries do no accessibility-tree filtering (unlike `ByRole`, where
    // `hidden` is a valid option), so a `hidden` child <tr>/<div> is found either
    // way. Renders in both the desktop table body and the mobile card body (no
    // CSS media-query filtering in jsdom) — at least one instance must be present.
    expect(screen.getAllByText('Child A').length).toBeGreaterThan(0);
  });

  it('keeps the same child DOM node identity across an expand → collapse cycle', async () => {
    const user = userEvent.setup();
    const { container } = renderDataTable();
    const childRowBefore = container.querySelector('#row-group-item-1 tr.childRow');
    // No isDefaultExpanded configured -> collapsed by default.
    expect(childRowBefore).toHaveAttribute('hidden');

    const toggleButton = within(container.querySelector('#row-group-item-1')! as HTMLElement)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;
    await user.click(toggleButton); // expand
    await user.click(toggleButton); // collapse again
    const childRowAfter = container.querySelector('#row-group-item-1 tr.childRow');
    expect(childRowAfter).toBe(childRowBefore);
  });

  // ─── AC36: aria-expanded flips; aria-controls references a real tbody id ────

  it('toggles aria-expanded on click and aria-controls references the real containing tbody id', async () => {
    const user = userEvent.setup();
    const { container } = renderDataTable();
    const group = container.querySelector('#row-group-item-1') as HTMLElement;
    const toggleButton = within(group)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;

    const controlsId = toggleButton.getAttribute('aria-controls');
    expect(controlsId).toBe('row-group-item-1');
    expect(document.getElementById(controlsId!)).not.toBeNull();

    expect(toggleButton).toHaveAttribute('aria-expanded', 'false'); // isDefaultExpanded not set -> collapsed by default
    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  // ─── AC37: no-children row renders leading cell but no button ───────────────

  it('a row whose getChildren returns [] renders the leading expand cell but no button inside it', () => {
    const { container } = renderDataTable();
    const group = container.querySelector('#row-group-item-2') as HTMLElement;
    const leadingCell = group.querySelector('tr.tableRow > td:first-child')!;
    expect(leadingCell).toHaveClass('expandCell');
    expect(leadingCell.querySelector('button')).not.toBeInTheDocument();
  });

  // ─── AC38: Enter/Space activate; click stopPropagation keeps row click intact ─

  it('activates the expand toggle via Enter and via Space, both toggling aria-expanded', async () => {
    const user = userEvent.setup();
    const { container } = renderDataTable();
    const group = container.querySelector('#row-group-item-1') as HTMLElement;
    const toggleButton = within(group)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;

    toggleButton.focus();
    const before = toggleButton.getAttribute('aria-expanded');
    await user.keyboard('{Enter}');
    expect(toggleButton.getAttribute('aria-expanded')).not.toBe(before);

    const afterEnter = toggleButton.getAttribute('aria-expanded');
    await user.keyboard(' ');
    expect(toggleButton.getAttribute('aria-expanded')).not.toBe(afterEnter);
  });

  it('clicking the expand toggle does not invoke onRowClick, but clicking elsewhere on the row does', async () => {
    const user = userEvent.setup();
    const onRowClick = jest.fn();
    const { container } = renderDataTable({ onRowClick });
    const group = container.querySelector('#row-group-item-1') as HTMLElement;
    const toggleButton = within(group)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;

    await user.click(toggleButton);
    expect(onRowClick).not.toHaveBeenCalled();

    const row = group.querySelector('tr.tableRow') as HTMLElement;
    await user.click(row);
    expect(onRowClick).toHaveBeenCalledWith(SAMPLE_ITEMS[0]);
  });

  // ─── AC39: isDefaultExpanded, collapse persists across items change, resets on remount ─

  it('isDefaultExpanded: () => true starts expanded on first render with no interaction', () => {
    const { container } = renderDataTable({
      expandableRows: makeExpandableRows({ isDefaultExpanded: () => true }),
    });
    const group = container.querySelector('#row-group-item-1') as HTMLElement;
    const toggleButton = within(group)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('a manual collapse survives a re-render with a new items array reference (no reset effect), but a fresh mount re-applies isDefaultExpanded', async () => {
    const user = userEvent.setup();
    const expandableRows = makeExpandableRows({ isDefaultExpanded: () => true });
    const { container, rerender, unmount } = render(
      <DataTable<TestItem, ChildItem>
        pageKey="test-page"
        columns={COLUMNS}
        items={SAMPLE_ITEMS}
        totalItems={SAMPLE_ITEMS.length}
        totalPages={1}
        currentPage={1}
        isLoading={false}
        getRowKey={(item) => item.id}
        tableState={makeTableState()}
        onStateChange={jest.fn()}
        expandableRows={expandableRows}
      />,
    );

    const getToggle = () =>
      within(container.querySelector('#row-group-item-1') as HTMLElement)
        .getAllByRole('button')
        .find((b) => b.hasAttribute('aria-expanded'))!;

    expect(getToggle()).toHaveAttribute('aria-expanded', 'true');
    await user.click(getToggle()); // collapse
    expect(getToggle()).toHaveAttribute('aria-expanded', 'false');

    // Re-render with a brand-new items array (new reference, same ids) — same mounted instance.
    rerender(
      <DataTable<TestItem, ChildItem>
        pageKey="test-page"
        columns={COLUMNS}
        items={[...SAMPLE_ITEMS]}
        totalItems={SAMPLE_ITEMS.length}
        totalPages={1}
        currentPage={1}
        isLoading={false}
        getRowKey={(item) => item.id}
        tableState={makeTableState()}
        onStateChange={jest.fn()}
        expandableRows={expandableRows}
      />,
    );
    expect(getToggle()).toHaveAttribute('aria-expanded', 'false'); // collapse preserved

    unmount();
    const { container: freshContainer } = render(
      <DataTable<TestItem, ChildItem>
        pageKey="test-page"
        columns={COLUMNS}
        items={SAMPLE_ITEMS}
        totalItems={SAMPLE_ITEMS.length}
        totalPages={1}
        currentPage={1}
        isLoading={false}
        getRowKey={(item) => item.id}
        tableState={makeTableState()}
        onStateChange={jest.fn()}
        expandableRows={expandableRows}
      />,
    );
    const freshToggle = within(freshContainer.querySelector('#row-group-item-1') as HTMLElement)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;
    expect(freshToggle).toHaveAttribute('aria-expanded', 'true'); // fresh mount re-applies default
  });

  // ─── AC40: alwaysVisible column bypasses stored visibility & popover exclusion ─

  it('an alwaysVisible column renders even when stored visibleColumns omits it, and is excluded from the column-settings popover', async () => {
    const user = userEvent.setup();
    const columnsWithAlwaysVisible: ColumnDef<TestItem>[] = [
      ...COLUMNS,
      {
        key: 'bonus',
        label: 'Bonus Column',
        defaultVisible: true,
        alwaysVisible: true,
        render: () => 'bonus-value',
      },
    ];
    // Stored preferences omit 'bonus' entirely.
    mockUseColumnPreferences.mockReturnValue({
      visibleColumns: new Set(['title', 'amount']),
      columnOrder: ['title', 'amount', 'bonus'],
      toggleColumn: mockToggleColumn,
      moveColumn: mockMoveColumn,
      resetToDefaults: mockResetToDefaults,
    });

    renderDataTable({ columns: columnsWithAlwaysVisible });

    // Renders despite being absent from stored visibleColumns (desktop header +
    // mobile card label both render in jsdom, so at least one must be present).
    expect(screen.getAllByText('Bonus Column').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bonus-value').length).toBeGreaterThan(0);

    // Excluded from the column-settings popover options.
    await user.click(screen.getByRole('button', { name: /column settings/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Bonus Column')).not.toBeInTheDocument();
    // A normal column IS offered.
    expect(within(dialog).getByText('Title')).toBeInTheDocument();
  });

  // ─── Production bug regression: settings/columnOrder index-space remap ──────
  //
  // DataTableColumnSettings emits drag-and-drop indices into `settingsColumns`
  // (which excludes alwaysVisible columns), but `useColumnPreferences.moveColumn`
  // splices `columnOrder`, which still contains them. DataTable.tsx's
  // `handleMoveSettingsColumn` remaps settings-space indices to columnOrder-space
  // by column key before calling moveColumn. These tests drive the REAL HTML5
  // drag-and-drop handlers against a stateful useColumnPreferences mock so the
  // assertion lands on the actual resulting header order — not merely "moveColumn
  // was called with two different numbers", which would pass even on the bug.
  describe('column settings drag-reorder', () => {
    // Makes the mocked useColumnPreferences stateful: its `moveColumn` mutates a
    // closure-local order array to a NEW array reference (so DataTable's
    // `sortedColumns` useMemo — keyed on columnOrder by identity — recomputes on
    // the next render) rather than being a no-op jest.fn().
    function makeStatefulColumnPreferencesMock(initialOrder: string[], visible: Set<string>) {
      let order = initialOrder;
      mockUseColumnPreferences.mockImplementation(() => ({
        visibleColumns: visible,
        columnOrder: order,
        toggleColumn: mockToggleColumn,
        moveColumn: (from: number, to: number) => {
          const updated = [...order];
          const [item] = updated.splice(from, 1);
          updated.splice(to, 0, item!);
          order = updated;
        },
        resetToDefaults: mockResetToDefaults,
      }));
    }

    function renderReorderTable(columns: ColumnDef<TestItem>[], pageKey: string) {
      return render(
        <DataTable<TestItem, ChildItem>
          pageKey={pageKey}
          columns={columns}
          items={SAMPLE_ITEMS}
          totalItems={SAMPLE_ITEMS.length}
          totalPages={1}
          currentPage={1}
          isLoading={false}
          getRowKey={(item) => item.id}
          tableState={makeTableState()}
          onStateChange={jest.fn()}
        />,
      );
    }

    // Opens the settings popover and drags the item labelled `fromLabel` onto the
    // item labelled `toLabel`, using the component's real onDragStart/onDragOver/
    // onDrop handlers (native HTML5 DnD — no userEvent helper exists for this).
    async function openAndDragColumn(fromLabel: string, toLabel: string) {
      await userEvent.setup().click(screen.getByRole('button', { name: /column settings/i }));
      const dialog = screen.getByRole('dialog');
      const fromEl = within(dialog)
        .getByText(fromLabel)
        .closest('.columnCheckboxItem') as HTMLElement;
      const toEl = within(dialog).getByText(toLabel).closest('.columnCheckboxItem') as HTMLElement;

      fireEvent.dragStart(fromEl, { dataTransfer: {} });
      // clientY far below any jsdom-default zero-rect so the above/below split is
      // deterministic; only dragOverState.index (not .position) drives the move.
      fireEvent.dragOver(toEl, { dataTransfer: {}, clientY: 999999 });
      fireEvent.drop(toEl, { dataTransfer: {} });
    }

    it('dragging a column past an alwaysVisible column (no stored preferences) moves the correct column — not the alwaysVisible one', async () => {
      const columns: ColumnDef<TestItem>[] = [
        { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
        {
          key: 'flag',
          label: 'Flag',
          defaultVisible: true,
          alwaysVisible: true,
          render: () => 'F',
        },
        { key: 'amount', label: 'Amount', defaultVisible: true, render: (i) => String(i.amount) },
        { key: 'notes', label: 'Notes', defaultVisible: true, render: () => 'N' },
      ];
      // No stored preferences: columnOrder defaults to the columns array order.
      makeStatefulColumnPreferencesMock(
        ['title', 'flag', 'amount', 'notes'],
        new Set(['title', 'flag', 'amount', 'notes']),
      );

      const { container, rerender } = renderReorderTable(columns, 'reorder-always-visible');

      // Settings popover excludes 'flag': rendered settings order is
      // Title(0), Amount(1), Notes(2). Drag 'Notes' (settings-index 2) onto
      // 'Amount' (settings-index 1) — i.e. move Notes to just before Amount.
      await openAndDragColumn('Notes', 'Amount');

      rerender(
        <DataTable<TestItem, ChildItem>
          pageKey="reorder-always-visible"
          columns={columns}
          items={SAMPLE_ITEMS}
          totalItems={SAMPLE_ITEMS.length}
          totalPages={1}
          currentPage={1}
          isLoading={false}
          getRowKey={(item) => item.id}
          tableState={makeTableState()}
          onStateChange={jest.fn()}
        />,
      );

      // Correct (post-fix) result: title, flag, notes, amount — 'flag'
      // (alwaysVisible) never moved, and 'notes' landed where 'amount' was.
      // The pre-fix bug called moveColumn(2, 1) directly on columnOrder (real
      // indices), which would have produced [title, amount, flag, notes] —
      // moving 'amount' instead of 'notes' AND displacing 'flag'.
      const headerLabels = Array.from(container.querySelectorAll('thead th')).map(
        (th) => th.textContent,
      );
      expect(headerLabels).toEqual(['Title', 'Flag', 'Notes', 'Amount']);
    });

    it('regression: with no alwaysVisible column present, drag-reorder indices pass through unchanged', async () => {
      const columns: ColumnDef<TestItem>[] = [
        { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
        { key: 'amount', label: 'Amount', defaultVisible: true, render: (i) => String(i.amount) },
        { key: 'notes', label: 'Notes', defaultVisible: true, render: () => 'N' },
      ];
      makeStatefulColumnPreferencesMock(
        ['title', 'amount', 'notes'],
        new Set(['title', 'amount', 'notes']),
      );

      const { container, rerender } = renderReorderTable(columns, 'reorder-no-always-visible');

      // No alwaysVisible columns: settings-space === columnOrder-space (0,1,2).
      await openAndDragColumn('Notes', 'Amount');

      rerender(
        <DataTable<TestItem, ChildItem>
          pageKey="reorder-no-always-visible"
          columns={columns}
          items={SAMPLE_ITEMS}
          totalItems={SAMPLE_ITEMS.length}
          totalPages={1}
          currentPage={1}
          isLoading={false}
          getRowKey={(item) => item.id}
          tableState={makeTableState()}
          onStateChange={jest.fn()}
        />,
      );

      const headerLabels = Array.from(container.querySelectorAll('thead th')).map(
        (th) => th.textContent,
      );
      expect(headerLabels).toEqual(['Title', 'Notes', 'Amount']);
    });
  });

  // ─── AC41: disabledFilterKeys disables one column's filter trigger, scoped ──

  it('disabledFilterKeys disables only the targeted column filter trigger, with the reason as title, and blocks opening its popover', async () => {
    const user = userEvent.setup();
    const columnsWithFilters: ColumnDef<TestItem>[] = [
      {
        key: 'title',
        label: 'Title',
        defaultVisible: true,
        filterable: true,
        filterType: 'string',
        filterParamKey: 'title',
        render: (i) => i.title,
      },
      {
        key: 'amount',
        label: 'Amount',
        defaultVisible: true,
        filterable: true,
        filterType: 'number',
        filterParamKey: 'amount',
        render: (i) => String(i.amount),
      },
    ];
    mockUseColumnPreferences.mockReturnValue({
      visibleColumns: new Set(['title', 'amount']),
      columnOrder: ['title', 'amount'],
      toggleColumn: mockToggleColumn,
      moveColumn: mockMoveColumn,
      resetToDefaults: mockResetToDefaults,
    });

    render(
      <DataTable<TestItem, ChildItem>
        pageKey="test-page"
        columns={columnsWithFilters}
        items={SAMPLE_ITEMS}
        totalItems={SAMPLE_ITEMS.length}
        totalPages={1}
        currentPage={1}
        isLoading={false}
        getRowKey={(item) => item.id}
        tableState={makeTableState()}
        onStateChange={jest.fn()}
        expandableRows={makeExpandableRows()}
        disabledFilterKeys={new Map([['title', 'Disabled while open items is on']])}
      />,
    );

    const titleFilterBtn = screen.getByRole('button', { name: 'Disabled while open items is on' });
    expect(titleFilterBtn).toBeDisabled();
    expect(titleFilterBtn).toHaveAttribute('title', 'Disabled while open items is on');
    await user.click(titleFilterBtn);
    expect(screen.queryByRole('dialog', { name: /amount|title/i })).not.toBeInTheDocument();

    // The other column's filter trigger remains enabled and opens normally.
    const amountFilterBtn = screen.getByRole('button', { name: /filter by amount/i });
    expect(amountFilterBtn).not.toBeDisabled();
    jest.spyOn(amountFilterBtn, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      top: 20,
      left: 100,
      right: 200,
      width: 100,
      height: 20,
      x: 100,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect);
    await user.click(amountFilterBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // ─── AC42: headerTitle renders as th title ──────────────────────────────────

  it("renders headerTitle as the title attribute of that column's <th>", () => {
    const columnsWithTitle: ColumnDef<TestItem>[] = [
      { key: 'title', label: 'Title', defaultVisible: true, render: (i) => i.title },
      {
        key: 'amount',
        label: 'Amount',
        defaultVisible: true,
        headerTitle: 'Includes tax',
        render: (i) => String(i.amount),
      },
    ];
    mockUseColumnPreferences.mockReturnValue({
      visibleColumns: new Set(['title', 'amount']),
      columnOrder: ['title', 'amount'],
      toggleColumn: mockToggleColumn,
      moveColumn: mockMoveColumn,
      resetToDefaults: mockResetToDefaults,
    });
    const { container } = renderDataTable({ columns: columnsWithTitle });
    const amountTh = Array.from(container.querySelectorAll('th')).find(
      (th) => th.textContent === 'Amount',
    )!;
    expect(amountTh).toHaveAttribute('title', 'Includes tax');
  });

  // ─── AC43: mobile card containment ──────────────────────────────────────────

  it('renders the expand button and child content inside the same .card element on the mobile card path', () => {
    const { container } = renderDataTable();
    const cards = container.querySelectorAll('.card');
    const card1 = Array.from(cards).find((c) => c.textContent?.includes('Alpha Work'))!;
    expect(card1).toBeTruthy();
    const button = within(card1 as HTMLElement)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;
    expect(card1.contains(button)).toBe(true);
    const childContent = within(card1 as HTMLElement).getByTestId('child-card-child-1a');
    expect(card1.contains(childContent)).toBe(true);
  });

  // Regression: the mobile children container's own `display: flex` CSS used to
  // override the `hidden` attribute, so collapsed children stayed visually
  // present even though `hidden` was correctly set in the DOM. jsdom applies no
  // CSS at all, so a plain `hasAttribute('hidden')` check can't catch this —
  // jest-dom's toBeVisible() is attribute-aware (it treats a `hidden` element as
  // not visible regardless of computed style), which is why it's used here. The
  // actual CSS half of this fix (`.cardChildren[hidden]` in DataTable.module.css)
  // can only be proven by real layout — that's owned by E2E scenario S16 in
  // e2e/tests/invoices/invoices-open-items.spec.ts (Playwright renders real CSS;
  // jsdom does not) — do not remove or weaken that E2E assertion.
  it('the mobile children container is inaccessible (not visible) while collapsed', () => {
    const { container } = renderDataTable({
      expandableRows: makeExpandableRows({ isDefaultExpanded: () => false }),
    });
    const childrenContainer = container.querySelector('#card-children-item-1');
    expect(childrenContainer).toBeInTheDocument();
    expect(childrenContainer).toHaveAttribute('hidden');
    expect(childrenContainer).not.toBeVisible();
  });

  it('mobile expand button toggles aria-expanded and does not fire onRowClick (stopPropagation)', async () => {
    const user = userEvent.setup();
    const onRowClick = jest.fn();
    const { container } = renderDataTable({ onRowClick });
    const cards = container.querySelectorAll('.card');
    const card1 = Array.from(cards).find((c) => c.textContent?.includes('Alpha Work'))!;
    const button = within(card1 as HTMLElement)
      .getAllByRole('button')
      .find((b) => b.hasAttribute('aria-expanded'))!;

    const initialExpanded = button.getAttribute('aria-expanded');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).not.toBe(initialExpanded);
    expect(onRowClick).not.toHaveBeenCalled();

    // Toggling back exercises both branches of the expanded ternary.
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe(initialExpanded);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

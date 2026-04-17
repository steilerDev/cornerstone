/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import type { AreaBudgetSummary } from '@cornerstone/shared';
import { AreaTreeTable } from './AreaTreeTable.js';

// CSS modules mocked via identity-obj-proxy (returns class name as the key)

// i18next is initialized with English translations by setupTests.ts

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Pass-through formatter — makes values easy to assert in tests. */
const fmt = (v: number) => v.toString();

function makeArea(
  overrides: Partial<AreaBudgetSummary> & { areaId: string; name: string },
): AreaBudgetSummary {
  return {
    parentId: null,
    planned: 10000,
    actual: 8000,
    variance: 2000,
    ...overrides,
  };
}

const ROOT_A = makeArea({
  areaId: 'a',
  name: 'Root A',
  planned: 10000,
  actual: 8000,
  variance: 2000,
});
const ROOT_B = makeArea({
  areaId: 'b',
  name: 'Root B',
  planned: 5000,
  actual: 6000,
  variance: -1000,
});
const CHILD_A1 = makeArea({
  areaId: 'a1',
  name: 'Child A1',
  parentId: 'a',
  planned: 3000,
  actual: 2500,
  variance: 500,
});
const GRANDCHILD_A1a = makeArea({
  areaId: 'a1a',
  name: 'Grandchild A1a',
  parentId: 'a1',
  planned: 1000,
  actual: 900,
  variance: 100,
});

// ─── 1. Empty state ─────────────────────────────────────────────────────────

describe('AreaTreeTable — empty state', () => {
  it('renders EmptyState when areas=[] and unassigned=null', () => {
    render(<AreaTreeTable areas={[]} unassigned={null} formatCurrency={fmt} />);

    // The component renders EmptyState which shows the emptyMessage text
    expect(screen.getByText(/no areas have been set up yet/i)).toBeInTheDocument();
  });

  it('does not render a table when areas=[] and unassigned=null', () => {
    render(<AreaTreeTable areas={[]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.queryByRole('treegrid')).not.toBeInTheDocument();
  });

  it('does not show EmptyState when areas=[] but unassigned is present', () => {
    render(
      <AreaTreeTable
        areas={[]}
        unassigned={{ planned: 5000, actual: 4000, variance: 1000 }}
        formatCurrency={fmt}
      />,
    );

    expect(screen.queryByText(/no areas have been set up yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('treegrid')).toBeInTheDocument();
  });
});

// ─── 2. Flat list ────────────────────────────────────────────────────────────

describe('AreaTreeTable — flat list', () => {
  it('renders both root areas', () => {
    render(<AreaTreeTable areas={[ROOT_A, ROOT_B]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByText('Root A')).toBeInTheDocument();
    expect(screen.getByText('Root B')).toBeInTheDocument();
  });

  it('renders planned values for root areas', () => {
    render(<AreaTreeTable areas={[ROOT_A, ROOT_B]} unassigned={null} formatCurrency={fmt} />);

    // ROOT_A planned=10000, ROOT_B planned=5000
    expect(screen.getByText('10000')).toBeInTheDocument();
    expect(screen.getByText('5000')).toBeInTheDocument();
  });

  it('renders actual values for root areas', () => {
    render(<AreaTreeTable areas={[ROOT_A, ROOT_B]} unassigned={null} formatCurrency={fmt} />);

    // ROOT_A actual=8000, ROOT_B actual=6000
    expect(screen.getByText('8000')).toBeInTheDocument();
    expect(screen.getByText('6000')).toBeInTheDocument();
  });

  it('renders variance values for root areas', () => {
    render(<AreaTreeTable areas={[ROOT_A, ROOT_B]} unassigned={null} formatCurrency={fmt} />);

    // ROOT_A variance=2000, ROOT_B variance=-1000
    expect(screen.getByText('2000')).toBeInTheDocument();
    expect(screen.getByText('-1000')).toBeInTheDocument();
  });

  it('root rows have aria-level="1"', () => {
    render(<AreaTreeTable areas={[ROOT_A, ROOT_B]} unassigned={null} formatCurrency={fmt} />);

    const rows = screen.getAllByRole('row').filter((r) => r.getAttribute('aria-level') === '1');
    // 2 root rows + header row (no aria-level) = header row doesn't match
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('leaf root rows have placeholder (no expand button)', () => {
    render(<AreaTreeTable areas={[ROOT_A, ROOT_B]} unassigned={null} formatCurrency={fmt} />);

    // No expand buttons visible when all areas are leaf nodes
    expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument();
  });
});

// ─── 3. Expand/collapse toggle ───────────────────────────────────────────────

describe('AreaTreeTable — expand/collapse toggle', () => {
  it('child is hidden before expand', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.queryByText('Child A1')).not.toBeInTheDocument();
  });

  it('clicking expand reveals the child row', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const expandBtn = screen.getByRole('button', { name: /expand root a/i });
    fireEvent.click(expandBtn);

    expect(screen.getByText('Child A1')).toBeInTheDocument();
  });

  it('clicking collapse hides the child row', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const expandBtn = screen.getByRole('button', { name: /expand root a/i });
    fireEvent.click(expandBtn);
    expect(screen.getByText('Child A1')).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: /collapse root a/i });
    fireEvent.click(collapseBtn);

    expect(screen.queryByText('Child A1')).not.toBeInTheDocument();
  });

  it('expand button has aria-expanded="false" before expanding', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const btn = screen.getByRole('button', { name: /expand root a/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('expand button has aria-expanded="true" after expanding', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const btn = screen.getByRole('button', { name: /expand root a/i });
    fireEvent.click(btn);

    expect(screen.getByRole('button', { name: /collapse root a/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('expand button has aria-controls pointing to the children container', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const btn = screen.getByRole('button', { name: /expand root a/i });
    expect(btn).toHaveAttribute('aria-controls', 'area-children-a');
  });
});

// ─── 4. Nested tree ──────────────────────────────────────────────────────────

describe('AreaTreeTable — nested tree', () => {
  it('initially renders only the root row', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, GRANDCHILD_A1a]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    expect(screen.getByText('Root A')).toBeInTheDocument();
    expect(screen.queryByText('Child A1')).not.toBeInTheDocument();
    expect(screen.queryByText('Grandchild A1a')).not.toBeInTheDocument();
  });

  it('expanding root shows root + child but not grandchild', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, GRANDCHILD_A1a]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));

    expect(screen.getByText('Root A')).toBeInTheDocument();
    expect(screen.getByText('Child A1')).toBeInTheDocument();
    expect(screen.queryByText('Grandchild A1a')).not.toBeInTheDocument();
  });

  it('expanding root and child shows all three levels', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, GRANDCHILD_A1a]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));
    fireEvent.click(screen.getByRole('button', { name: /expand child a1/i }));

    expect(screen.getByText('Root A')).toBeInTheDocument();
    expect(screen.getByText('Child A1')).toBeInTheDocument();
    expect(screen.getByText('Grandchild A1a')).toBeInTheDocument();
  });

  it('child has aria-level="2" after expanding root', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, GRANDCHILD_A1a]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));

    const rows = screen.getAllByRole('row').filter((r) => r.getAttribute('aria-level') === '2');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 5. Expand All / Collapse All ────────────────────────────────────────────

describe('AreaTreeTable — Expand All / Collapse All', () => {
  // Two roots each with a child → 2 non-leaf nodes → showExpandAll = true
  const ROOT_C = makeArea({ areaId: 'c', name: 'Root C' });
  const CHILD_C1 = makeArea({ areaId: 'c1', name: 'Child C1', parentId: 'c' });

  it('Expand all button is visible when more than 1 non-leaf node exists', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, ROOT_C, CHILD_C1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();
  });

  it('clicking Expand all reveals all children', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, ROOT_C, CHILD_C1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));

    expect(screen.getByText('Child A1')).toBeInTheDocument();
    expect(screen.getByText('Child C1')).toBeInTheDocument();
  });

  it('clicking Collapse all (when all expanded) hides all children', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, ROOT_C, CHILD_C1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    // First expand all
    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
    expect(screen.getByText('Child A1')).toBeInTheDocument();

    // Then collapse all (button label changes)
    fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));

    expect(screen.queryByText('Child A1')).not.toBeInTheDocument();
    expect(screen.queryByText('Child C1')).not.toBeInTheDocument();
  });

  it('Expand all button toggles label to Collapse all when fully expanded', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A, CHILD_A1, ROOT_C, CHILD_C1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    expect(screen.getByRole('button', { name: /expand all/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /expand all/i }));

    expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^expand all$/i })).not.toBeInTheDocument();
  });
});

// ─── 6. Expand All button absence ────────────────────────────────────────────

describe('AreaTreeTable — Expand All button absent when not needed', () => {
  it('no Expand all button for a single root with no children', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.queryByRole('button', { name: /expand all/i })).not.toBeInTheDocument();
  });

  it('no Expand all button for a single non-leaf (exactly 1 non-leaf node)', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    // ROOT_A has one child → 1 non-leaf → showExpandAll requires > 1, so no button
    expect(screen.queryByRole('button', { name: /expand all/i })).not.toBeInTheDocument();
  });
});

// ─── 7. Unassigned row present ───────────────────────────────────────────────

describe('AreaTreeTable — unassigned row', () => {
  it('renders unassigned row when unassigned is non-null', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A]}
        unassigned={{ planned: 5000, actual: 4800, variance: 200 }}
        formatCurrency={fmt}
      />,
    );

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders unassigned planned/actual/variance values', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_A]}
        unassigned={{ planned: 5000, actual: 4800, variance: 200 }}
        formatCurrency={fmt}
      />,
    );

    expect(screen.getByText('5000')).toBeInTheDocument();
    expect(screen.getByText('4800')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });
});

// ─── 8. Unassigned row absent ────────────────────────────────────────────────

describe('AreaTreeTable — unassigned row absent', () => {
  it('does not render unassigned row when unassigned=null', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });
});

// ─── 9. Variance color ───────────────────────────────────────────────────────

describe('AreaTreeTable — variance color classes', () => {
  it('positive variance cell has variancePositive class', () => {
    // ROOT_A variance=2000 (positive)
    const { container } = render(
      <AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />,
    );

    // identity-obj-proxy makes className='variancePositive'
    const positiveCells = container.querySelectorAll('[class*="variancePositive"]');
    expect(positiveCells.length).toBeGreaterThan(0);
  });

  it('negative variance cell has varianceNegative class', () => {
    // ROOT_B variance=-1000 (negative)
    const { container } = render(
      <AreaTreeTable areas={[ROOT_B]} unassigned={null} formatCurrency={fmt} />,
    );

    const negativeCells = container.querySelectorAll('[class*="varianceNegative"]');
    expect(negativeCells.length).toBeGreaterThan(0);
  });

  it('unassigned positive variance has variancePositive class', () => {
    const { container } = render(
      <AreaTreeTable
        areas={[]}
        unassigned={{ planned: 5000, actual: 4000, variance: 1000 }}
        formatCurrency={fmt}
      />,
    );

    const positiveCells = container.querySelectorAll('[class*="variancePositive"]');
    expect(positiveCells.length).toBeGreaterThan(0);
  });

  it('unassigned negative variance has varianceNegative class', () => {
    const { container } = render(
      <AreaTreeTable
        areas={[]}
        unassigned={{ planned: 5000, actual: 6000, variance: -1000 }}
        formatCurrency={fmt}
      />,
    );

    const negativeCells = container.querySelectorAll('[class*="varianceNegative"]');
    expect(negativeCells.length).toBeGreaterThan(0);
  });
});

// ─── 10. ARIA attributes ──────────────────────────────────────────────────────

describe('AreaTreeTable — ARIA attributes', () => {
  it('root rows have aria-level="1"', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const rootRow = screen
      .getAllByRole('row')
      .find((r) => r.getAttribute('aria-level') === '1' && r.textContent?.includes('Root A'));
    expect(rootRow).toBeTruthy();
    expect(rootRow).toHaveAttribute('aria-level', '1');
  });

  it('child rows have aria-level="2" after expanding', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));

    const childRow = screen.getAllByRole('row').find((r) => r.getAttribute('aria-level') === '2');
    expect(childRow).toBeTruthy();
  });

  it('expand button has aria-expanded="false" initially', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const btn = screen.getByRole('button', { name: /expand root a/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('expand button has aria-controls="area-children-{id}"', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const btn = screen.getByRole('button', { name: /expand root a/i });
    expect(btn).toHaveAttribute('aria-controls', 'area-children-a');
  });

  it('table has role="treegrid"', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('treegrid')).toBeInTheDocument();
  });
});

// ─── 11. Screen-reader live region ───────────────────────────────────────────

describe('AreaTreeTable — screen reader live region', () => {
  it('role="status" element is present in the DOM', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('live region shows expanded announcement after clicking expand', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const statusEl = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));

    // The component sets announcement synchronously before clearing with setTimeout
    expect(statusEl).toHaveTextContent(/root a/i);
  });

  it('live region shows collapsed announcement after clicking collapse', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    const statusEl = screen.getByRole('status');
    // Expand first
    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));
    // Then collapse
    fireEvent.click(screen.getByRole('button', { name: /collapse root a/i }));

    expect(statusEl).toHaveTextContent(/root a/i);
  });
});

// ─── 12. Leaf node placeholder ───────────────────────────────────────────────

describe('AreaTreeTable — leaf node placeholder', () => {
  it('leaf rows render the expandBtnPlaceholder span, not an expand button', () => {
    render(<AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />);

    // Expand so CHILD_A1 is visible (it's a leaf)
    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));

    // CHILD_A1 is a leaf: its row should NOT have an expand button
    const childRow = screen.getAllByRole('row').find((r) => r.textContent?.includes('Child A1'));
    expect(childRow).toBeTruthy();
    // No button inside the child row
    const btnsInChild = childRow!.querySelectorAll('button');
    expect(btnsInChild.length).toBe(0);
  });

  it('leaf rows have expandBtnPlaceholder class in their name cell', () => {
    const { container } = render(
      <AreaTreeTable areas={[ROOT_A, CHILD_A1]} unassigned={null} formatCurrency={fmt} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /expand root a/i }));

    // After expanding, the leaf child row should contain expandBtnPlaceholder
    // (identity-obj-proxy makes class attributes carry the original key name)
    const placeholders = container.querySelectorAll('[class*="expandBtnPlaceholder"]');
    expect(placeholders.length).toBeGreaterThan(0);
  });
});

// ─── 13. Keyboard ArrowDown ───────────────────────────────────────────────────

describe('AreaTreeTable — keyboard ArrowDown', () => {
  it('ArrowDown moves focus to the next expand button', () => {
    // Two parent nodes with children → 2 expand buttons visible
    const ROOT_D = makeArea({ areaId: 'd', name: 'Root D' });
    const CHILD_D1 = makeArea({ areaId: 'd1', name: 'Child D1', parentId: 'd' });
    const ROOT_E = makeArea({ areaId: 'e', name: 'Root E' });
    const CHILD_E1 = makeArea({ areaId: 'e1', name: 'Child E1', parentId: 'e' });

    render(
      <AreaTreeTable
        areas={[ROOT_D, CHILD_D1, ROOT_E, CHILD_E1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    const [firstBtn] = screen.getAllByRole('button', { name: /expand root/i });
    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);

    fireEvent.keyDown(firstBtn, { key: 'ArrowDown' });

    // Focus should have moved — the second expand button is now active
    const allExpandBtns = screen.getAllByRole('button', { name: /expand root/i });
    expect(document.activeElement).toBe(allExpandBtns[1]);
  });
});

// ─── 14. Keyboard Home/End ───────────────────────────────────────────────────

describe('AreaTreeTable — keyboard Home/End', () => {
  const ROOT_F = makeArea({ areaId: 'f', name: 'Root F' });
  const CHILD_F1 = makeArea({ areaId: 'f1', name: 'Child F1', parentId: 'f' });
  const ROOT_G = makeArea({ areaId: 'g', name: 'Root G' });
  const CHILD_G1 = makeArea({ areaId: 'g1', name: 'Child G1', parentId: 'g' });

  it('Home key focuses the first expand button', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_F, CHILD_F1, ROOT_G, CHILD_G1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    const allBtns = screen.getAllByRole('button', { name: /expand root/i });
    const lastBtn = allBtns[allBtns.length - 1];
    lastBtn.focus();

    fireEvent.keyDown(lastBtn, { key: 'Home' });

    expect(document.activeElement).toBe(allBtns[0]);
  });

  it('End key focuses the last visible expand button', () => {
    render(
      <AreaTreeTable
        areas={[ROOT_F, CHILD_F1, ROOT_G, CHILD_G1]}
        unassigned={null}
        formatCurrency={fmt}
      />,
    );

    const allBtns = screen.getAllByRole('button', { name: /expand root/i });
    allBtns[0].focus();

    fireEvent.keyDown(allBtns[0], { key: 'End' });

    expect(document.activeElement).toBe(allBtns[allBtns.length - 1]);
  });
});

// ─── Column headers ──────────────────────────────────────────────────────────

describe('AreaTreeTable — column headers', () => {
  it('renders Area column header', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('columnheader', { name: /area/i })).toBeInTheDocument();
  });

  it('renders Planned column header', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('columnheader', { name: /planned/i })).toBeInTheDocument();
  });

  it('renders Actual column header', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('columnheader', { name: /actual/i })).toBeInTheDocument();
  });

  it('renders Variance column header', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('columnheader', { name: /variance/i })).toBeInTheDocument();
  });
});

// ─── Section heading ─────────────────────────────────────────────────────────

describe('AreaTreeTable — section heading', () => {
  it('renders the "Area Breakdown" section heading', () => {
    render(<AreaTreeTable areas={[ROOT_A]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('heading', { name: /area breakdown/i })).toBeInTheDocument();
  });

  it('renders the heading in empty state too', () => {
    render(<AreaTreeTable areas={[]} unassigned={null} formatCurrency={fmt} />);

    expect(screen.getByRole('heading', { name: /area breakdown/i })).toBeInTheDocument();
  });
});

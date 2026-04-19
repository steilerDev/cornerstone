import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EnumOption, EnumHierarchyItem } from '../DataTable.js';
import { EnumFilter } from './EnumFilter.js';

/**
 * Unit tests for EnumFilter arbitrary-depth hierarchy support.
 *
 * Story #1294 — EnumFilter arbitrary-depth hierarchy.
 * Covers DFS render order, inline --enum-depth CSS variables, cascade toggle
 * add/remove, indeterminate state, Select All exclusion, and fallthrough for
 * options absent from the hierarchy.
 *
 * Does NOT duplicate flat-list or sentinel tests (EnumFilter.test.tsx /
 * EnumFilter.sentinel.test.tsx cover those surfaces).
 *
 * Note on --enum-depth assertions:
 * React sets the CSS custom property via style={{ '--enum-depth': depth }}
 * where depth is a number. JSDOM's CSSStyleDeclaration does not store custom
 * properties at bracket-access indices, so toHaveStyle({ '--enum-depth': ... })
 * normalises the expected value to '' (always passes). Instead we read the
 * property directly via element.style.getPropertyValue('--enum-depth'), which
 * correctly returns the set value as a string (e.g. "0", "1", "2").
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

// 3-level: Root → Child A → Grandchild AA; Root → Child B (leaf)
const OPTIONS_3_LEVEL: EnumOption[] = [
  { value: 'root', label: 'Root' },
  { value: 'child-a', label: 'Child A' },
  { value: 'child-b', label: 'Child B' },
  { value: 'grandchild-aa', label: 'Grandchild AA' },
];
const HIERARCHY_3_LEVEL: EnumHierarchyItem[] = [
  { id: 'root', parentId: null },
  { id: 'child-a', parentId: 'root' },
  { id: 'child-b', parentId: 'root' },
  { id: 'grandchild-aa', parentId: 'child-a' },
];

// 4-level: L0 → L1 → L2 → L3
const OPTIONS_4_LEVEL: EnumOption[] = [
  { value: 'l0', label: 'Level 0' },
  { value: 'l1', label: 'Level 1' },
  { value: 'l2', label: 'Level 2' },
  { value: 'l3', label: 'Level 3' },
];
const HIERARCHY_4_LEVEL: EnumHierarchyItem[] = [
  { id: 'l0', parentId: null },
  { id: 'l1', parentId: 'l0' },
  { id: 'l2', parentId: 'l1' },
  { id: 'l3', parentId: 'l2' },
];

// Mixed (two roots, one with a child)
const OPTIONS_MIXED: EnumOption[] = [
  { value: 'alpha', label: 'Alpha' },
  { value: 'alpha-child', label: 'Alpha Child' },
  { value: 'beta', label: 'Beta' },
];
const HIERARCHY_MIXED: EnumHierarchyItem[] = [
  { id: 'alpha', parentId: null },
  { id: 'alpha-child', parentId: 'alpha' },
  { id: 'beta', parentId: null },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return the raw value of --enum-depth set via inline style on the label
 * element whose `for` attribute matches `enum-{idSuffix}`.
 *
 * Uses element.style.getPropertyValue() because JSDOM does not support custom
 * properties via CSSStyleDeclaration bracket-index access (which toHaveStyle
 * relies on for normalisation). Returns null when the label element is absent.
 */
function getLabelDepth(idSuffix: string): string | null {
  const label = document.querySelector(`label[for="enum-${idSuffix}"]`) as HTMLElement | null;
  if (!label) return null;
  return label.style.getPropertyValue('--enum-depth');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EnumFilter — arbitrary-depth hierarchy', () => {
  // ── Scenario 1: 3-level — all 4 nodes render ─────────────────────────────

  it('3-level: all 4 nodes render', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Child A')).toBeInTheDocument();
    expect(screen.getByText('Child B')).toBeInTheDocument();
    expect(screen.getByText('Grandchild AA')).toBeInTheDocument();
  });

  // ── Scenario 2: 3-level — DFS render order ───────────────────────────────

  it('3-level: checkboxes appear in DFS order (Root, Child A, Grandchild AA, Child B)', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    // DFS order: root (group), child-a (group), grandchild-aa (leaf), child-b (leaf)
    expect(checkboxes[0]).toHaveAttribute('aria-label', 'Root (group)');
    expect(checkboxes[1]).toHaveAttribute('aria-label', 'Child A (group)');
    expect(checkboxes[2]).toHaveAttribute('aria-label', 'Grandchild AA');
    expect(checkboxes[3]).toHaveAttribute('aria-label', 'Child B');
  });

  // ── Scenario 3: 3-level — inline --enum-depth CSS variable ───────────────

  it('3-level: root label has --enum-depth "0"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );
    expect(document.querySelector('label[for="enum-root"]')).not.toBeNull();
    expect(getLabelDepth('root')).toBe('0');
  });

  it('3-level: child-a label has --enum-depth "1"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );
    expect(document.querySelector('label[for="enum-child-a"]')).not.toBeNull();
    expect(getLabelDepth('child-a')).toBe('1');
  });

  it('3-level: grandchild-aa label has --enum-depth "2"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );
    expect(document.querySelector('label[for="enum-grandchild-aa"]')).not.toBeNull();
    expect(getLabelDepth('grandchild-aa')).toBe('2');
  });

  // ── Scenario 4: 4-level — all 4 nodes render + depths 0/1/2/3 ────────────

  it('4-level: all 4 nodes render', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_4_LEVEL}
        hierarchy={HIERARCHY_4_LEVEL}
      />,
    );
    expect(screen.getByText('Level 0')).toBeInTheDocument();
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(screen.getByText('Level 2')).toBeInTheDocument();
    expect(screen.getByText('Level 3')).toBeInTheDocument();
  });

  it('4-level: l0 has depth "0"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_4_LEVEL}
        hierarchy={HIERARCHY_4_LEVEL}
      />,
    );
    expect(getLabelDepth('l0')).toBe('0');
  });

  it('4-level: l1 has depth "1"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_4_LEVEL}
        hierarchy={HIERARCHY_4_LEVEL}
      />,
    );
    expect(getLabelDepth('l1')).toBe('1');
  });

  it('4-level: l2 has depth "2"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_4_LEVEL}
        hierarchy={HIERARCHY_4_LEVEL}
      />,
    );
    expect(getLabelDepth('l2')).toBe('2');
  });

  it('4-level: l3 has depth "3"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_4_LEVEL}
        hierarchy={HIERARCHY_4_LEVEL}
      />,
    );
    expect(getLabelDepth('l3')).toBe('3');
  });

  // ── Scenario 5: Selecting root cascades to ALL descendants (3-level) ──────

  it('clicking root adds root + all 3 descendants to onChange value', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Root (group)' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const callArg = (mockOnChange.mock.calls[0] as [string])[0];
    const parts = callArg.split(',');
    expect(parts).toHaveLength(4);
    expect(parts).toContain('root');
    expect(parts).toContain('child-a');
    expect(parts).toContain('child-b');
    expect(parts).toContain('grandchild-aa');
  });

  // ── Scenario 6: Selecting middle node cascades to its subtree only ────────

  it('clicking child-a adds child-a + grandchild-aa but NOT root or child-b', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Child A (group)' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const callArg = (mockOnChange.mock.calls[0] as [string])[0];
    const parts = callArg.split(',');
    expect(parts).toContain('child-a');
    expect(parts).toContain('grandchild-aa');
    expect(parts).not.toContain('root');
    expect(parts).not.toContain('child-b');
  });

  // ── Scenario 7: Unchecking root removes all descendants ──────────────────

  it('unchecking root when all 4 are selected calls onChange with ""', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value="root,child-a,child-b,grandchild-aa"
        onChange={mockOnChange}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Root (group)' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const callArg = (mockOnChange.mock.calls[0] as [string])[0];
    expect(callArg).toBe('');
  });

  // ── Scenario 8: Unchecking middle node removes subtree, preserves siblings ─

  it('unchecking child-a removes child-a + grandchild-aa, preserves root + child-b', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value="root,child-a,child-b,grandchild-aa"
        onChange={mockOnChange}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Child A (group)' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const callArg = (mockOnChange.mock.calls[0] as [string])[0];
    const parts = callArg.split(',');
    expect(parts).toContain('root');
    expect(parts).toContain('child-b');
    expect(parts).not.toContain('child-a');
    expect(parts).not.toContain('grandchild-aa');
  });

  // ── Scenario 9: Indeterminate when only grandchild selected ──────────────

  it('root and child-a are indeterminate when only grandchild-aa is selected', () => {
    render(
      <EnumFilter
        value="grandchild-aa"
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );

    const rootInput = document.getElementById('enum-root') as HTMLInputElement;
    const childAInput = document.getElementById('enum-child-a') as HTMLInputElement;

    expect(rootInput).not.toBeNull();
    expect(childAInput).not.toBeNull();
    expect(rootInput.indeterminate).toBe(true);
    expect(childAInput.indeterminate).toBe(true);
  });

  it('child-b is NOT indeterminate when only grandchild-aa is selected (child-b is a leaf sibling)', () => {
    render(
      <EnumFilter
        value="grandchild-aa"
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
      />,
    );

    const childBInput = document.getElementById('enum-child-b') as HTMLInputElement;
    expect(childBInput).not.toBeNull();
    // child-b is a leaf (no children), so ref is never stored and indeterminate is never set
    expect(childBInput.indeterminate).toBe(false);
  });

  // ── Scenario 10: Select All excludes __none__ ─────────────────────────────

  it('Select All with enumIncludeNone: result CSV does not contain __none__ but contains all 4 option values', async () => {
    const user = userEvent.setup();
    const mockOnChange = jest.fn();
    render(
      <EnumFilter
        value=""
        onChange={mockOnChange}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
        enumIncludeNone={true}
        enumNoneLabel="No Area"
      />,
    );

    await user.click(screen.getByRole('button', { name: /select all/i }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const callArg = (mockOnChange.mock.calls[0] as [string])[0];
    expect(callArg).not.toContain('__none__');
    const parts = callArg.split(',');
    expect(parts).toContain('root');
    expect(parts).toContain('child-a');
    expect(parts).toContain('child-b');
    expect(parts).toContain('grandchild-aa');
  });

  // ── Scenario 11: Sentinel still renders alongside hierarchy ──────────────

  it('sentinel renders when enumIncludeNone=true; total checkboxes = 5 (4 options + sentinel)', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_3_LEVEL}
        hierarchy={HIERARCHY_3_LEVEL}
        enumIncludeNone={true}
        enumNoneLabel="No Area"
      />,
    );

    const sentinel = document.getElementById('enum-__none__');
    expect(sentinel).not.toBeNull();
    expect(sentinel?.tagName).toBe('INPUT');
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });

  // ── Scenario 12: Flat list (no hierarchy prop) — all depths 0 ────────────

  it('flat list (no hierarchy): all 3 option labels render and each has --enum-depth "0"', () => {
    const FLAT_OPTIONS: EnumOption[] = [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'pending', label: 'Pending' },
    ];

    render(<EnumFilter value="" onChange={jest.fn()} options={FLAT_OPTIONS} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    // Flat-list path sets depth: 0 for every item.
    // React serialises the numeric 0 to the string "0" in the style attribute.
    expect(getLabelDepth('active')).toBe('0');
    expect(getLabelDepth('inactive')).toBe('0');
    expect(getLabelDepth('pending')).toBe('0');
  });

  // ── Scenario 13: Mixed tree — beta (leaf root) at depth 0 ────────────────

  it('mixed tree: beta (leaf root) label has --enum-depth "0"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_MIXED}
        hierarchy={HIERARCHY_MIXED}
      />,
    );

    expect(document.querySelector('label[for="enum-beta"]')).not.toBeNull();
    expect(getLabelDepth('beta')).toBe('0');
  });

  it('mixed tree: alpha-child (depth 1) label has --enum-depth "1"', () => {
    render(
      <EnumFilter
        value=""
        onChange={jest.fn()}
        options={OPTIONS_MIXED}
        hierarchy={HIERARCHY_MIXED}
      />,
    );

    expect(document.querySelector('label[for="enum-alpha-child"]')).not.toBeNull();
    expect(getLabelDepth('alpha-child')).toBe('1');
  });

  // ── Scenario 14: Option in flat list but NOT in hierarchy → depth 0 ───────

  it('options absent from hierarchy fall through at depth 0', () => {
    // 5 options; hierarchy covers only 3
    const options: EnumOption[] = [
      { value: 'p', label: 'Parent' },
      { value: 'c', label: 'Child' },
      { value: 'in-hier', label: 'InHierarchy' },
      { value: 'orphan-1', label: 'Orphan One' },
      { value: 'orphan-2', label: 'Orphan Two' },
    ];
    const hierarchy: EnumHierarchyItem[] = [
      { id: 'p', parentId: null },
      { id: 'c', parentId: 'p' },
      { id: 'in-hier', parentId: null },
      // orphan-1 and orphan-2 intentionally absent from hierarchy
    ];

    render(<EnumFilter value="" onChange={jest.fn()} options={options} hierarchy={hierarchy} />);

    // All 5 options must render
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.getByText('InHierarchy')).toBeInTheDocument();
    expect(screen.getByText('Orphan One')).toBeInTheDocument();
    expect(screen.getByText('Orphan Two')).toBeInTheDocument();

    // Orphan options not in hierarchy fall through at depth 0
    expect(document.querySelector('label[for="enum-orphan-1"]')).not.toBeNull();
    expect(document.querySelector('label[for="enum-orphan-2"]')).not.toBeNull();
    expect(getLabelDepth('orphan-1')).toBe('0');
    expect(getLabelDepth('orphan-2')).toBe('0');
  });
});

/**
 * @jest-environment jsdom
 *
 * Unit tests for AreaPicker component.
 *
 * Mock strategy:
 * - jest.unstable_mockModule is used for CI (where it intercepts ESM modules correctly).
 * - SearchPicker is mocked to capture the props passed to it, following the canonical
 *   OrientationPicker.test.tsx pattern.
 * - react-i18next is mocked to return translation keys as-is.
 *
 * Key behaviors tested:
 *   - renderSecondary: null for top-level, parent name for depth-1, "Root › Mid" for depth-2
 *   - renderItem: em-dash-indented for nested, bare for top-level
 *   - renderSelectedLabel: bare area name (no em-dash) for any depth
 *   - searchFn: empty → full tree, parent match → parent+descendants, shared leaf → all matches
 *   - initialTitle: bare name for pre-populated value (derived from value prop via tree lookup)
 *   - onChange is passed through directly to the parent (no internal wrapper state)
 *   - nullable=true → specialOptions has no-area entry; nullable=false → undefined
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { AreaResponse } from '@cornerstone/shared';
import type { AreaPickerProps } from './AreaPicker.js';
import type { TreeNode } from '../../lib/areaTreeUtils.js';

// ─── Module-scope captured props ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSearchFn: ((query: string) => Promise<any[]>) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedRenderItem: ((item: any) => { id: string; label: string }) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedRenderSecondary: ((item: any) => string | null) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedRenderSelectedLabel: ((item: any) => string) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSpecialOptions: any[] | undefined = undefined;
let capturedOnChange: ((id: string) => void) | null = null;
let capturedInitialTitle: string | undefined = undefined;
let capturedValue: string = '';

jest.unstable_mockModule('../SearchPicker/SearchPicker.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SearchPicker: (props: any) => {
    capturedSearchFn = props.searchFn;
    capturedRenderItem = props.renderItem;
    capturedRenderSecondary = props.renderSecondary;
    capturedRenderSelectedLabel = props.renderSelectedLabel;
    capturedSpecialOptions = props.specialOptions;
    capturedOnChange = props.onChange;
    capturedInitialTitle = props.initialTitle;
    capturedValue = props.value;
    return (
      <div
        data-testid="search-picker-mock"
        data-value={props.value}
        data-placeholder={props.placeholder}
        data-show-items-on-focus={String(props.showItemsOnFocus)}
        data-initial-title={props.initialTitle ?? ''}
      />
    );
  },
}));

jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ─── Dynamic import (after mocks) ────────────────────────────────────────────

let AreaPicker: React.ComponentType<AreaPickerProps>;

beforeEach(async () => {
  if (!AreaPicker) {
    const mod = await import('./AreaPicker.js');
    AreaPicker = mod.AreaPicker;
  }
  capturedSearchFn = null;
  capturedRenderItem = null;
  capturedRenderSecondary = null;
  capturedRenderSelectedLabel = null;
  capturedSpecialOptions = undefined;
  capturedOnChange = null;
  capturedInitialTitle = undefined;
  capturedValue = '';
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeArea = (
  overrides: Partial<AreaResponse> & { id: string; name: string },
): AreaResponse => {
  const defaults: AreaResponse = {
    id: overrides.id,
    name: overrides.name,
    parentId: null,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { ...defaults, ...overrides };
};

// Three-level tree: root → mid → leaf
const ROOT = makeArea({ id: 'root', name: 'Ground Floor', sortOrder: 0 });
const MID = makeArea({ id: 'mid', name: 'West Wing', parentId: 'root', sortOrder: 0 });
const LEAF = makeArea({ id: 'leaf', name: 'Bedroom', parentId: 'mid', sortOrder: 0 });
const SIBLING = makeArea({ id: 'sibling', name: 'Kitchen', parentId: 'root', sortOrder: 1 });

const THREE_LEVEL_AREAS = [ROOT, MID, LEAF, SIBLING];

describe('AreaPicker', () => {
  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders without crashing and renders the SearchPicker mock', () => {
    render(<AreaPicker areas={[]} value="" onChange={jest.fn()} />);
    expect(screen.getByTestId('search-picker-mock')).toBeTruthy();
  });

  it('value prop is forwarded to SearchPicker', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="root" onChange={jest.fn()} />);
    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-value')).toBe('root');
  });

  it('placeholder is set to the selectArea translation key', () => {
    render(<AreaPicker areas={[]} value="" onChange={jest.fn()} />);
    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-placeholder')).toBe('aria.selectArea');
  });

  it('showItemsOnFocus is true', () => {
    render(<AreaPicker areas={[]} value="" onChange={jest.fn()} />);
    const picker = screen.getByTestId('search-picker-mock');
    expect(picker.getAttribute('data-show-items-on-focus')).toBe('true');
  });

  // ─── renderSecondary ──────────────────────────────────────────────────────

  it('renderSecondary returns null for a top-level area (no ancestors)', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const rootNode: TreeNode = { depth: 0, area: ROOT };
    const result = capturedRenderSecondary?.(rootNode);
    expect(result).toBeNull();
  });

  it('renderSecondary returns parent name for a depth-1 area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const midNode: TreeNode = { depth: 1, area: MID };
    const result = capturedRenderSecondary?.(midNode);
    expect(result).toBe('Ground Floor');
  });

  it('renderSecondary returns "Root › Mid" root-first path for a depth-2 area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const leafNode: TreeNode = { depth: 2, area: LEAF };
    const result = capturedRenderSecondary?.(leafNode);
    // U+203A separator
    expect(result).toBe('Ground Floor › West Wing');
  });

  it('renderSecondary uses › (U+203A) separator, not >', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const leafNode: TreeNode = { depth: 2, area: LEAF };
    const result = capturedRenderSecondary?.(leafNode) ?? '';
    expect(result).toContain('›');
    expect(result).not.toContain('>');
  });

  // ─── renderItem ───────────────────────────────────────────────────────────

  it('renderItem returns bare name for a top-level area (depth 0)', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const rootNode: TreeNode = { depth: 0, area: ROOT };
    const item = capturedRenderItem?.(rootNode);
    expect(item?.id).toBe('root');
    expect(item?.label).toBe('Ground Floor');
    // No em-dash prefix
    expect(item?.label).not.toContain('—');
  });

  it('renderItem returns em-dash-indented label for depth-1 area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const midNode: TreeNode = { depth: 1, area: MID };
    const item = capturedRenderItem?.(midNode);
    expect(item?.id).toBe('mid');
    // One em-dash + space prefix
    expect(item?.label).toBe('— West Wing');
  });

  it('renderItem returns double-em-dash indent for depth-2 area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const leafNode: TreeNode = { depth: 2, area: LEAF };
    const item = capturedRenderItem?.(leafNode);
    expect(item?.id).toBe('leaf');
    // Two em-dashes (depth 2 × "— ")
    expect(item?.label).toBe('— — Bedroom');
  });

  // ─── renderSelectedLabel ──────────────────────────────────────────────────

  it('renderSelectedLabel returns bare area name (no em-dash) for a top-level area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    const rootNode: TreeNode = { depth: 0, area: ROOT };
    const label = capturedRenderSelectedLabel?.(rootNode);
    expect(label).toBe('Ground Floor');
    expect(label).not.toContain('—');
  });

  it('renderSelectedLabel returns bare area name (no em-dash) for a nested area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    // Depth-1 node: renderItem would return "— West Wing", renderSelectedLabel should return bare "West Wing"
    const midNode: TreeNode = { depth: 1, area: MID };
    const label = capturedRenderSelectedLabel?.(midNode);
    expect(label).toBe('West Wing');
    expect(label).not.toContain('—');
  });

  it('renderSelectedLabel returns bare area name (no em-dash) for a depth-2 area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    // Depth-2 node: renderItem would return "— — Bedroom", renderSelectedLabel should return bare "Bedroom"
    const leafNode: TreeNode = { depth: 2, area: LEAF };
    const label = capturedRenderSelectedLabel?.(leafNode);
    expect(label).toBe('Bedroom');
    expect(label).not.toContain('—');
  });

  // ─── initialTitle ─────────────────────────────────────────────────────────
  // initialTitle is derived purely from the value prop via tree lookup (no internal state).
  // It equals the bare area name of the matching node when found, undefined otherwise.

  it('initialTitle shows bare area name for a pre-populated value', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="mid" onChange={jest.fn()} />);
    // selectedNode found: West Wing → initialTitle = "West Wing" (bare, not indented)
    expect(capturedInitialTitle).toBe('West Wing');
  });

  it('initialTitle is undefined when value is empty string', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);
    // No selectedNode for '' → initialTitle undefined
    expect(capturedInitialTitle).toBeUndefined();
  });

  it('initialTitle is undefined when value does not match any area', () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="no-such-id" onChange={jest.fn()} />);
    // No node found for unknown id → initialTitle undefined
    expect(capturedInitialTitle).toBeUndefined();
  });

  // ─── onChange forwarding ──────────────────────────────────────────────────
  // AreaPicker no longer uses an internal handleChange wrapper or selectedBareTitle state.
  // The parent onChange prop is passed directly through to SearchPicker.

  it('onChange is passed directly to SearchPicker (captured onChange IS the parent prop)', () => {
    const onChangeMock = jest.fn<(id: string) => void>();
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={onChangeMock} />);

    // capturedOnChange is what SearchPicker received; calling it must call the parent directly
    act(() => {
      capturedOnChange?.('leaf');
    });

    expect(onChangeMock).toHaveBeenCalledWith('leaf');
    expect(onChangeMock).toHaveBeenCalledTimes(1);
  });

  it('onChange called with nested area id forwards the id unchanged (no transformation)', () => {
    const onChangeMock = jest.fn<(id: string) => void>();
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={onChangeMock} />);

    act(() => {
      capturedOnChange?.('leaf');
    });

    // The id forwarded must be the raw area id, not indented or transformed
    expect(onChangeMock).toHaveBeenCalledWith('leaf');
  });

  // ─── nullable prop ────────────────────────────────────────────────────────

  it('nullable=true — specialOptions has one entry with id="" (no-area)', () => {
    render(<AreaPicker areas={[]} value="" onChange={jest.fn()} nullable={true} />);
    expect(capturedSpecialOptions).toBeDefined();
    expect(capturedSpecialOptions).toHaveLength(1);
    expect(capturedSpecialOptions![0]).toMatchObject({ id: '' });
    // Label is translation key for noArea
    expect(capturedSpecialOptions![0].label).toBe('aria.noArea');
  });

  it('nullable=false — specialOptions is undefined', () => {
    render(<AreaPicker areas={[]} value="" onChange={jest.fn()} nullable={false} />);
    expect(capturedSpecialOptions).toBeUndefined();
  });

  it('nullable defaults to false — specialOptions is undefined', () => {
    render(<AreaPicker areas={[]} value="" onChange={jest.fn()} />);
    expect(capturedSpecialOptions).toBeUndefined();
  });

  // ─── searchFn ─────────────────────────────────────────────────────────────

  it('searchFn with empty string returns full tree (all areas)', async () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);

    let results: TreeNode[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('')) ?? [];
    });

    // Empty query → full tree → all 4 areas
    expect(results).toHaveLength(4);
  });

  it('searchFn with parent name returns parent + all descendants', async () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);

    let results: TreeNode[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('ground floor')) ?? [];
    });

    // 'ground floor' matches ROOT → include root, mid, leaf, sibling (all descendants)
    const ids = results.map((n: TreeNode) => n.area.id);
    expect(ids).toContain('root');
    expect(ids).toContain('mid');
    expect(ids).toContain('leaf');
    expect(ids).toContain('sibling');
  });

  it('searchFn with leaf name returns only that leaf (not unrelated areas)', async () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);

    let results: TreeNode[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('bedroom')) ?? [];
    });

    const ids = results.map((n: TreeNode) => n.area.id);
    expect(ids).toContain('leaf');
    expect(ids).not.toContain('root');
    expect(ids).not.toContain('mid');
    expect(ids).not.toContain('sibling');
  });

  it('searchFn with name shared across multiple parents returns all matches', async () => {
    // Two areas both named "Bathroom" under different parents
    const bath1 = makeArea({ id: 'bath1', name: 'Bathroom', parentId: 'root', sortOrder: 2 });
    const bath2 = makeArea({ id: 'bath2', name: 'Bathroom', parentId: 'mid', sortOrder: 2 });
    const areas = [ROOT, MID, bath1, bath2];

    render(<AreaPicker areas={areas} value="" onChange={jest.fn()} />);

    let results: TreeNode[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('bathroom')) ?? [];
    });

    const ids = results.map((n: TreeNode) => n.area.id);
    expect(ids).toContain('bath1');
    expect(ids).toContain('bath2');
    // Parents not matched directly
    expect(ids).not.toContain('root');
    expect(ids).not.toContain('mid');
  });

  it('searchFn with no match returns empty array', async () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);

    let results: TreeNode[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('zzz-no-match-zzz')) ?? [];
    });

    expect(results).toEqual([]);
  });

  it('searchFn is case-insensitive', async () => {
    render(<AreaPicker areas={THREE_LEVEL_AREAS} value="" onChange={jest.fn()} />);

    let results: TreeNode[] = [];
    await act(async () => {
      results = (await capturedSearchFn?.('BEDROOM')) ?? [];
    });

    expect(results.map((n: TreeNode) => n.area.id)).toContain('leaf');
  });
});

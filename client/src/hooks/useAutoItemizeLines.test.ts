/**
 * @jest-environment jsdom
 *
 * Unit tests for useAutoItemizeLines: the row state of the Split with AI pages' cost line grid
 * (load, edits, selection, merge with retry/undo, default funding source, validation, commit
 * context).
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ExtractedLine, PaperlessDocumentSearchResult } from '@cornerstone/shared';
import type { CostLineGridRow } from '../components/CostLineForm/types.js';

// ─── Mocks (before dynamic imports) ──────────────────────────────────────────

const mockLocaleValue = { resolvedLocale: 'en', vatRate: 0.19 };

jest.unstable_mockModule('../contexts/LocaleContext.js', () => ({
  useLocale: () => mockLocaleValue,
}));

const stableT = (key: string, opts?: Record<string, unknown>) =>
  opts && 'count' in opts ? `${key}:${String(opts.count)}` : key;
jest.unstable_mockModule('react-i18next', () => ({
  useTranslation: () => ({ t: stableT }),
}));

const mockOptions = {
  categories: [{ id: 'cat-1', name: 'Wood' }],
  sources: [{ id: 'src-1', name: 'Main' }],
  categoryOptions: [],
  sourceOptions: [],
  discretionarySourceId: 'disc-1' as string | null,
  loading: false,
  failed: false,
};
jest.unstable_mockModule('../components/CostLineForm/useCostLineOptions.js', () => ({
  useCostLineOptions: () => mockOptions,
}));

type MergeResult = {
  description: string;
  category: string | null;
  budgetCategoryId: string | null;
};
const mockMergeLines = jest.fn<(body: unknown) => Promise<MergeResult>>();
jest.unstable_mockModule('../lib/invoiceAutoItemizeApi.js', () => ({
  mergeLines: mockMergeLines,
}));

const { useAutoItemizeLines, AUTO_ITEMIZE_GRID_PREFIX, AUTO_ITEMIZE_GRID_OPTIONS } =
  await import('./useAutoItemizeLines.js');
const { blankGridRow } = await import('../components/CostLineForm/costLineGridModel.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function line(overrides: Partial<ExtractedLine> = {}): ExtractedLine {
  return {
    description: 'Oak boards',
    totalAmount: 100,
    includesVat: false,
    confidence: 0.8,
    ...overrides,
  } as ExtractedLine;
}

type Hook = ReturnType<typeof useAutoItemizeLines>;

function setup(props: Parameters<typeof useAutoItemizeLines>[0] = {}) {
  return renderHook((p: Parameters<typeof useAutoItemizeLines>[0]) => useAutoItemizeLines(p), {
    initialProps: props,
  });
}

function loaded(lines: ExtractedLine[], props: Parameters<typeof useAutoItemizeLines>[0] = {}) {
  const view = setup(props);
  act(() => view.result.current.load(lines));
  return view;
}

function realRows(hook: Hook): CostLineGridRow[] {
  return hook.rows.filter((r) => r.description !== '' || r.unitPrice !== '');
}

function select(view: { result: { current: Hook } }, ids: string[]) {
  for (const id of ids) act(() => view.result.current.onToggleSelect(id));
}

beforeEach(() => {
  jest.resetAllMocks();
  mockLocaleValue.resolvedLocale = 'en';
  mockLocaleValue.vatRate = 0.19;
  mockOptions.discretionarySourceId = 'disc-1';
  mockOptions.sources = [{ id: 'src-1', name: 'Main' }];
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('initial state', () => {
  it('starts with one blank row, no data, no selection and no errors shown', () => {
    const { result } = setup();
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]!.description).toBe('');
    expect(result.current.data.size).toBe(0);
    expect(result.current.selectedRowIds.size).toBe(0);
    expect(result.current.showAllErrors).toBe(false);
    expect(result.current.assignAll).toBeNull();
    expect(result.current.options).toBe(mockOptions);
  });

  it('exports the grid contract used by the pages', () => {
    expect(AUTO_ITEMIZE_GRID_PREFIX).toBe('auto-itemize-grid');
    expect(AUTO_ITEMIZE_GRID_OPTIONS).toMatchObject({ include: true, select: true, targets: true });
  });
});

describe('load', () => {
  it('turns extracted lines into rows plus a trailing blank and keeps the side data', () => {
    const { result } = loaded([line(), line({ description: 'Nails', totalAmount: 5 })]);
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows[0]!.description).toBe('Oak boards');
    expect(result.current.rows[1]!.description).toBe('Nails');
    const first = result.current.rows[0]!.rowId;
    expect(result.current.data.get(first)?.extracted.description).toBe('Oak boards');
  });

  it('clears the selection and replaces earlier rows on a second load', () => {
    const view = loaded([line(), line({ description: 'B' })]);
    select(view, [view.result.current.rows[0]!.rowId]);
    expect(view.result.current.selectedRowIds.size).toBe(1);
    act(() => view.result.current.load([line({ description: 'Only' })]));
    expect(view.result.current.selectedRowIds.size).toBe(0);
    expect(realRows(view.result.current).map((r) => r.description)).toEqual(['Only']);
  });

  it('formats numbers with the German decimal comma in the de locale', () => {
    mockLocaleValue.resolvedLocale = 'de';
    const { result } = loaded([line({ quantity: 1.5, unit: 'm', unitPrice: 2, totalAmount: 3 })]);
    expect(result.current.rows[0]!.quantity).toBe('1,5');
  });
});

describe('default funding source', () => {
  it('fills a new, non-blank row without a source with the discretionary source', () => {
    const { result } = loaded([line()]);
    expect(result.current.rows[0]!.budgetSourceId).toBe('disc-1');
    // The blank row stays untouched.
    expect(result.current.rows[1]!.budgetSourceId).toBeNull();
  });

  it('prefers the invoice default, then the first source, and leaves rows alone without any', () => {
    const withDefault = loaded([line()], { defaultBudgetSourceId: 'def-1' });
    expect(withDefault.result.current.rows[0]!.budgetSourceId).toBe('def-1');

    mockOptions.discretionarySourceId = null;
    const first = loaded([line()]);
    expect(first.result.current.rows[0]!.budgetSourceId).toBe('src-1');

    mockOptions.sources = [];
    const none = loaded([line()]);
    expect(none.result.current.rows[0]!.budgetSourceId).toBeNull();
  });

  it('keeps a source the extraction already chose and does not touch linked rows', () => {
    const { result } = loaded([line({ budgetSourceId: 'src-9' })]);
    expect(result.current.rows[0]!.budgetSourceId).toBe('src-9');
    const linked: CostLineGridRow = {
      ...result.current.rows[0]!,
      budgetSourceId: null,
      existingLine: { id: 'bl', type: 'work_item', description: null, gross: 5 },
    };
    act(() => result.current.onRowsChange([linked, result.current.rows[1]!]));
    expect(result.current.rows[0]!.budgetSourceId).toBeNull();
  });
});

describe('onRowsChange / replaceRows', () => {
  it('reports an edit but not the grid appending its trailing blank row', () => {
    const onFieldsEdited = jest.fn();
    const { result } = setup({ onFieldsEdited });
    const current = result.current.rows;
    act(() => result.current.onRowsChange([...current, blankGridRow('extra')]));
    expect(onFieldsEdited).not.toHaveBeenCalled();
    act(() => result.current.onRowsChange([{ ...current[0]!, description: 'typed' }]));
    expect(onFieldsEdited).toHaveBeenCalledTimes(1);
  });

  it('works without an onFieldsEdited callback', () => {
    const { result } = setup();
    expect(() =>
      act(() => result.current.onRowsChange([{ ...result.current.rows[0]!, description: 'x' }])),
    ).not.toThrow();
  });

  it('drops removed rows from the selection and keeps the same set when nothing was removed', () => {
    const view = loaded([line(), line({ description: 'B' })]);
    const [a, b] = view.result.current.rows;
    select(view, [a!.rowId, b!.rowId]);
    const before = view.result.current.selectedRowIds;
    act(() => view.result.current.onRowsChange(view.result.current.rows));
    expect(view.result.current.selectedRowIds).toBe(before);
    act(() => view.result.current.onRowsChange([b!]));
    expect([...view.result.current.selectedRowIds]).toEqual([b!.rowId]);
  });

  it('replaceRows writes rows back without counting as an edit', () => {
    const onFieldsEdited = jest.fn();
    const { result } = setup({ onFieldsEdited });
    act(() => result.current.replaceRows([{ ...result.current.rows[0]!, description: 'back' }]));
    expect(result.current.rows[0]!.description).toBe('back');
    expect(onFieldsEdited).not.toHaveBeenCalled();
  });
});

describe('selection', () => {
  it('toggles a row on and off and clears the selection', () => {
    const view = loaded([line()]);
    const id = view.result.current.rows[0]!.rowId;
    select(view, [id]);
    expect(view.result.current.selectedRowIds.has(id)).toBe(true);
    select(view, [id]);
    expect(view.result.current.selectedRowIds.has(id)).toBe(false);
    select(view, [id]);
    act(() => view.result.current.onClearSelection());
    expect(view.result.current.selectedRowIds.size).toBe(0);
  });

  it('ignores unknown rows, linked rows and rows with a notice', () => {
    const view = loaded([line(), line({ description: 'B' })]);
    const [a, b] = view.result.current.rows;
    act(() =>
      view.result.current.replaceRows([
        { ...a!, existingLine: { id: 'x', type: 'work_item', description: null, gross: 1 } },
        { ...b!, notice: { tone: 'busy', text: 'merging' } },
      ]),
    );
    select(view, ['missing', a!.rowId, b!.rowId]);
    expect(view.result.current.selectedRowIds.size).toBe(0);
  });
});

describe('merge', () => {
  const merged: MergeResult = {
    description: 'Wood and nails',
    category: 'Wood',
    budgetCategoryId: 'cat-1',
  };

  function twoRows(props: Parameters<typeof useAutoItemizeLines>[0] = {}) {
    const view = loaded(
      [
        line({ description: 'Boards', totalAmount: 100, vendorName: 'Acme', confidence: 0.9 }),
        line({ description: 'Nails', totalAmount: 10, vendorName: 'acme', confidence: 0.5 }),
        line({ description: 'Paint', totalAmount: 7 }),
      ],
      props,
    );
    const [a, b, c] = view.result.current.rows;
    return { view, a: a!, b: b!, c: c! };
  }

  it('does nothing with fewer than two selected rows', () => {
    const onMergeStart = jest.fn();
    const { view, a } = twoRows({ onMergeStart });
    select(view, [a.rowId]);
    act(() => view.result.current.onMergeSelected());
    expect(onMergeStart).not.toHaveBeenCalled();
    expect(mockMergeLines).not.toHaveBeenCalled();
  });

  it('replaces the selected rows by one busy row, then fills it from the merge response', async () => {
    jest.useFakeTimers();
    try {
      mockMergeLines.mockResolvedValue(merged);
      const onMergeStart = jest.fn();
      const onMergeSuccess = jest.fn();
      const onFieldsEdited = jest.fn();
      const { view, a, b, c } = twoRows({
        onMergeStart,
        onMergeSuccess,
        onFieldsEdited,
        documentSummary: 'Delivery note',
      });
      select(view, [a.rowId, b.rowId]);
      act(() => view.result.current.onMergeSelected());

      expect(onMergeStart).toHaveBeenCalledWith(2);
      // Only the numbers stay in code: gross 119 + 11.9 = 130.9.
      const rowsNow = realRows(view.result.current);
      expect(rowsNow.map((r) => r.rowId)).toContain(c.rowId);
      expect(rowsNow).toHaveLength(2);
      const mergedRow = rowsNow[0]!;
      expect(mergedRow.unitPrice).toBe('130.9');
      expect(mergedRow.includesVat).toBe(true);
      expect(mergedRow.aiCertainty).toBe(0.5);
      expect(view.result.current.selectedRowIds.size).toBe(0);
      expect(view.result.current.data.get(mergedRow.rowId)?.mergeSources).toHaveLength(2);
      expect(view.result.current.data.get(mergedRow.rowId)?.extracted.vendorName).toBe('Acme');
      expect(mockMergeLines).toHaveBeenCalledWith({
        descriptions: ['Boards', 'Nails'],
        documentSummary: 'Delivery note',
        availableCategories: ['Wood'],
      });

      // The merged row carries a busy notice while the request runs? It resolved already below.
      const target = document.createElement('input');
      target.setAttribute(
        'data-testid',
        `${AUTO_ITEMIZE_GRID_PREFIX}-description-${mergedRow.rowId}`,
      );
      document.body.appendChild(target);

      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        jest.runAllTimers();
      });

      const after = view.result.current.rows.find((r) => r.rowId === mergedRow.rowId)!;
      expect(after.description).toBe('Wood and nails');
      expect(after.budgetCategoryId).toBe('cat-1');
      expect(after.notice).toBeUndefined();
      expect(view.result.current.data.get(mergedRow.rowId)?.extracted).toMatchObject({
        description: 'Wood and nails',
        category: 'Wood',
      });
      expect(onMergeSuccess).toHaveBeenCalledTimes(1);
      expect(onFieldsEdited).toHaveBeenCalled();
      expect(document.activeElement).toBe(target);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows a busy notice with the row count while the merge request is pending', () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const { view, a, b } = twoRows();
    select(view, [a.rowId, b.rowId]);
    act(() => view.result.current.onMergeSelected());
    const mergedRow = realRows(view.result.current)[0]!;
    expect(mergedRow.notice).toEqual({ tone: 'busy', text: 'autoItemize.mergingCaption:2' });
  });

  it('uses the invoice default source for the merged row, else the first row source', () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const withDefault = twoRows({ defaultBudgetSourceId: 'def-1' });
    select(withDefault.view, [withDefault.a.rowId, withDefault.b.rowId]);
    act(() => withDefault.view.result.current.onMergeSelected());
    expect(realRows(withDefault.view.result.current)[0]!.budgetSourceId).toBe('def-1');

    const without = twoRows();
    select(without.view, [without.a.rowId, without.b.rowId]);
    act(() => without.view.result.current.onMergeSelected());
    expect(realRows(without.view.result.current)[0]!.budgetSourceId).toBe('disc-1');
  });

  it('falls back to the project categories and tolerates rows without side data', () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const view = loaded([line({ category: undefined }), line({ category: undefined })]);
    const [a, b] = view.result.current.rows;
    // Rows typed by hand have no extraction data; their certainty counts as 1.
    act(() =>
      view.result.current.replaceRows([
        { ...a!, aiCertainty: undefined },
        { ...b!, aiCertainty: undefined },
      ]),
    );
    act(() => view.result.current.load([]));
    act(() =>
      view.result.current.replaceRows([
        { ...blankGridRow('h1'), description: 'Hand A', unitPrice: '10' },
        { ...blankGridRow('h2'), description: 'Hand B', unitPrice: '5' },
      ]),
    );
    select(view, ['h1', 'h2']);
    act(() => view.result.current.onMergeSelected());
    expect(mockMergeLines).toHaveBeenCalledWith(
      expect.objectContaining({
        availableCategories: ['Wood'],
        descriptions: ['Hand A', 'Hand B'],
      }),
    );
    expect(realRows(view.result.current)[0]!.aiCertainty).toBe(1);
  });

  it('merges at the position of the first selected row', () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const { view, a, b, c } = twoRows();
    select(view, [b.rowId, c.rowId]);
    act(() => view.result.current.onMergeSelected());
    const ids = view.result.current.rows.map((r) => r.rowId);
    expect(ids[0]).toBe(a.rowId);
    expect(ids).not.toContain(b.rowId);
    expect(ids).not.toContain(c.rowId);
  });

  it('shows an error notice with Undo and Retry when the merge fails, and focuses Retry', async () => {
    jest.useFakeTimers();
    try {
      mockMergeLines.mockRejectedValue(new Error('LLM down'));
      const { view, a, b } = twoRows();
      select(view, [a.rowId, b.rowId]);
      act(() => view.result.current.onMergeSelected());
      const mergedId = realRows(view.result.current)[0]!.rowId;
      const retry = document.createElement('button');
      retry.setAttribute('data-testid', `${AUTO_ITEMIZE_GRID_PREFIX}-notice-retry-${mergedId}`);
      document.body.appendChild(retry);

      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        jest.runAllTimers();
      });

      const notice = view.result.current.rows.find((r) => r.rowId === mergedId)!.notice!;
      expect(notice.tone).toBe('error');
      expect(notice.text).toBe('autoItemize.mergeErrorMessage');
      expect(notice.actions?.map((x) => x.id)).toEqual(['undo', 'retry']);
      expect(document.activeElement).toBe(retry);
    } finally {
      jest.useRealTimers();
    }
  });

  it('Retry sends the merge again and clears the error on success', async () => {
    mockMergeLines.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(merged);
    const { view, a, b } = twoRows();
    select(view, [a.rowId, b.rowId]);
    act(() => view.result.current.onMergeSelected());
    const mergedId = realRows(view.result.current)[0]!.rowId;
    await waitFor(() =>
      expect(view.result.current.rows.find((r) => r.rowId === mergedId)!.notice?.tone).toBe(
        'error',
      ),
    );

    act(() => view.result.current.onNoticeAction(mergedId, 'retry'));
    expect(view.result.current.rows.find((r) => r.rowId === mergedId)!.notice?.tone).toBe('busy');
    await waitFor(() =>
      expect(view.result.current.rows.find((r) => r.rowId === mergedId)!.description).toBe(
        'Wood and nails',
      ),
    );
    expect(mockMergeLines).toHaveBeenCalledTimes(2);
  });

  it('Undo restores the original rows and their side data', async () => {
    mockMergeLines.mockRejectedValue(new Error('down'));
    const onFieldsEdited = jest.fn();
    const { view, a, b, c } = twoRows({ onFieldsEdited });
    select(view, [a.rowId, b.rowId]);
    act(() => view.result.current.onMergeSelected());
    const mergedId = realRows(view.result.current)[0]!.rowId;
    await waitFor(() =>
      expect(view.result.current.rows.find((r) => r.rowId === mergedId)!.notice?.tone).toBe(
        'error',
      ),
    );
    onFieldsEdited.mockClear();

    act(() => view.result.current.onNoticeAction(mergedId, 'undo'));
    const ids = view.result.current.rows.map((r) => r.rowId);
    expect(ids.slice(0, 3)).toEqual([a.rowId, b.rowId, c.rowId]);
    expect(view.result.current.data.has(mergedId)).toBe(false);
    expect(view.result.current.data.get(a.rowId)?.extracted.description).toBe('Boards');
    expect(onFieldsEdited).toHaveBeenCalledTimes(1);
  });

  it('ignores notice actions for rows that were not merged and unknown actions', async () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const { view, a, b } = twoRows();
    const before = view.result.current.rows;
    act(() => view.result.current.onNoticeAction('nope', 'retry'));
    expect(view.result.current.rows).toBe(before);
    select(view, [a.rowId, b.rowId]);
    act(() => view.result.current.onMergeSelected());
    const mergedId = realRows(view.result.current)[0]!.rowId;
    const rowsNow = view.result.current.rows;
    act(() => view.result.current.onNoticeAction(mergedId, 'other'));
    expect(view.result.current.rows).toBe(rowsNow);
  });

  it('Undo of a row that is no longer in the grid leaves the rows unchanged', async () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const { view, a, b } = twoRows();
    select(view, [a.rowId, b.rowId]);
    act(() => view.result.current.onMergeSelected());
    const mergedId = realRows(view.result.current)[0]!.rowId;
    act(() => view.result.current.replaceRows([blankGridRow('only')]));
    const before = view.result.current.rows;
    act(() => view.result.current.onNoticeAction(mergedId, 'undo'));
    expect(view.result.current.rows).toBe(before);
  });

  it('a merge response for a row that was removed meanwhile changes nothing', async () => {
    let resolve: (value: MergeResult) => void = () => {};
    mockMergeLines.mockReturnValue(new Promise((r) => (resolve = r)));
    const { view, a, b } = twoRows();
    select(view, [a.rowId, b.rowId]);
    act(() => view.result.current.onMergeSelected());
    const mergedId = realRows(view.result.current)[0]!.rowId;
    act(() => view.result.current.replaceRows([blankGridRow('only')]));
    act(() => view.result.current.load([]));
    await act(async () => {
      resolve(merged);
      await Promise.resolve();
    });
    expect(view.result.current.data.has(mergedId)).toBe(false);
  });
});

describe('applyBudgetSource', () => {
  it('sets the source on new-line rows, counts them and mirrors it into merge sources', async () => {
    mockMergeLines.mockReturnValue(new Promise(() => {}));
    const view = loaded([line(), line({ description: 'B' }), line({ description: 'C' })]);
    const [a, b, c] = view.result.current.rows;
    act(() =>
      view.result.current.replaceRows([
        a!,
        b!,
        { ...c!, existingLine: { id: 'x', type: 'work_item', description: null, gross: 1 } },
        view.result.current.rows[3]!,
      ]),
    );
    select(view, [a!.rowId, b!.rowId]);
    act(() => view.result.current.onMergeSelected());

    let count = -1;
    act(() => {
      count = view.result.current.applyBudgetSource('src-new');
    });
    // The merged row counts; the linked row and the blank row do not.
    expect(count).toBe(1);
    const mergedRow = realRows(view.result.current)[0]!;
    expect(mergedRow.budgetSourceId).toBe('src-new');
    const sources = view.result.current.data.get(mergedRow.rowId)?.mergeSources;
    expect(sources?.every((s) => s.row.budgetSourceId === 'src-new')).toBe(true);
    // Rows without merge sources keep their data entry.
    expect(view.result.current.data.get(c!.rowId)).toBeDefined();
  });
});

describe('validate', () => {
  it('returns true and shows errors for valid rows without focusing anything', () => {
    const rafSpy = jest.spyOn(globalThis, 'requestAnimationFrame');
    const { result } = loaded([line()]);
    let valid = false;
    act(() => {
      valid = result.current.validate();
    });
    expect(valid).toBe(true);
    expect(result.current.showAllErrors).toBe(true);
    expect(rafSpy).not.toHaveBeenCalled();
    rafSpy.mockRestore();
  });

  it('returns false for an invalid row and focuses the first invalid cell', () => {
    const rafSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const grid = document.createElement('div');
    grid.setAttribute('data-testid', AUTO_ITEMIZE_GRID_PREFIX);
    const input = document.createElement('input');
    input.setAttribute('aria-invalid', 'true');
    grid.appendChild(input);
    document.body.appendChild(grid);

    const { result } = loaded([line({ description: '' })]);
    let valid = true;
    act(() => {
      valid = result.current.validate();
    });
    expect(valid).toBe(false);
    expect(document.activeElement).toBe(input);
    rafSpy.mockRestore();
  });

  it('does not throw when no invalid cell is in the DOM', () => {
    const rafSpy = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    const { result } = loaded([line({ description: '' })]);
    act(() => {
      result.current.validate();
    });
    rafSpy.mockRestore();
  });
});

describe('commitContext', () => {
  it('reports Assign all to, locale, VAT rate, document type and sources', () => {
    const doc = { documentType: 'Invoice' } as PaperlessDocumentSearchResult;
    const { result } = setup({ document: doc, defaultBudgetSourceId: 'def-1' });
    const target = { type: 'work_item' as const, id: 'wi-1', label: 'Task' };
    act(() => result.current.setAssignAll(target));
    expect(result.current.commitContext()).toEqual({
      assignAll: target,
      locale: 'en',
      vatRate: 0.19,
      documentType: 'Invoice',
      defaultBudgetSourceId: 'def-1',
      discretionarySourceId: 'disc-1',
    });
  });

  it('falls back to null sources and an undefined document type', () => {
    mockOptions.discretionarySourceId = null;
    const { result } = setup();
    expect(result.current.commitContext()).toMatchObject({
      documentType: undefined,
      defaultBudgetSourceId: null,
      discretionarySourceId: null,
    });
  });
});

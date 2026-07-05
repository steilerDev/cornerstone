/**
 * @jest-environment jsdom
 *
 * Unit tests for useAutoItemizeLines hook.
 *
 * Tests handler behaviour, confidence derivation, and onFieldsEdited callback.
 * useBudgetLinePicker is mocked so no real API calls are made.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mocks (before static imports) ──────────────────────────────────────────

const mockOpenPicker = jest.fn();
const mockClosePicker = jest.fn();
const mockInitializeStaticData = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

let mockPickerStateOverride: Record<string, unknown> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnLineCreatedFn = (...args: any[]) => void;
let capturedOnLineCreated: OnLineCreatedFn | null = null;

jest.unstable_mockModule('./useBudgetLinePicker.js', () => ({
  useBudgetLinePicker: ({ onLineCreated }: { onLineCreated: OnLineCreatedFn }) => {
    capturedOnLineCreated = onLineCreated;
    return {
      pickerState: {
        isOpen: false,
        step: 1,
        type: 'work_item',
        itemId: 'wi-1',
        itemTitle: 'Kitchen',
        isLoading: false,
        error: null,
        budgetLines: [],
        budgetSources: [{ id: 'src-1', name: 'Main', isDiscretionary: true }],
        vendors: [{ id: 'v-1', name: 'Builder Co', trade: null }],
        categories: [{ id: 'cat-1', name: 'Cat 1' }],
        showCreateForm: false,
        createError: null,
        createForm: undefined,
        ...mockPickerStateOverride,
      },
      openPicker: mockOpenPicker,
      closePicker: mockClosePicker,
      handleSelectItem: jest.fn(),
      showCreateBudgetLineForm: jest.fn(),
      handleCreateBudgetLine: jest.fn(),
      setPickerState: jest.fn(),
      initializeStaticData: mockInitializeStaticData,
      createBudgetLineButtonRef: { current: null },
    };
  },
}));

jest.unstable_mockModule('../contexts/LocaleContext.js', () => ({
  LocaleProvider: ({ children }: { children: unknown }) => children,
  useLocale: () => ({ locale: 'en', setLocale: jest.fn() }),
}));

// ─── Mock: invoiceAutoItemizeApi (mergeLines) — Story #1797 ───────────────────

const mockMergeLines =
  jest.fn<
    (
      body: unknown,
    ) => Promise<{ description: string; category: string | null; budgetCategoryId: string | null }>
  >();

jest.unstable_mockModule('../lib/invoiceAutoItemizeApi.js', () => ({
  mergeLines: mockMergeLines,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeLine(overrides: Record<string, any> = {}): any {
  return {
    rowId: 'r1',
    description: 'Tile work',
    totalAmount: 300,
    includesVat: true,
    confidence: 0.9,
    quantity: null,
    unit: null,
    unitPrice: null,
    vatRate: null,
    vendorName: null,
    included: true,
    budgetCategoryId: 'cat-1',
    budgetSourceId: 'src-1',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeOptions(overrides: Record<string, any> = {}) {
  return {
    invoiceId: 'inv-1',
    invoiceAmount: 1000,
    document: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useAutoItemizeLines', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let useAutoItemizeLines: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPickerStateOverride = {};
    capturedOnLineCreated = null;
    mockMergeLines.mockReset();
    ({ useAutoItemizeLines } = await import('./useAutoItemizeLines.js'));
  });

  it('calls initializeStaticData on mount', () => {
    renderHook(() => useAutoItemizeLines(makeOptions()));
    expect(mockInitializeStaticData).toHaveBeenCalledTimes(1);
  });

  it('starts with empty lines', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
    expect(result.current.lines).toEqual([]);
  });

  it('onToggleInclude flips the included flag', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine({ included: true })]);
    });
    act(() => {
      result.current.handlers.onToggleInclude('r1');
    });

    expect(result.current.lines[0].included).toBe(false);
  });

  it('onFieldChange updates a string field and calls onFieldsEdited', () => {
    const onFieldsEdited = jest.fn();
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onFieldsEdited })));

    act(() => {
      result.current.setLines([makeLine({ description: 'old' })]);
    });
    act(() => {
      result.current.handlers.onFieldChange('r1', 'description', 'new');
    });

    expect(result.current.lines[0].description).toBe('new');
    expect(onFieldsEdited).toHaveBeenCalledTimes(1);
  });

  it('onFieldChange coerces quantity string → null for empty string', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine({ quantity: 5 })]);
    });
    act(() => {
      result.current.handlers.onFieldChange('r1', 'quantity', '');
    });

    expect(result.current.lines[0].quantity).toBeNull();
  });

  it('onFieldChange coerces quantity string → number', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine()]);
    });
    act(() => {
      result.current.handlers.onFieldChange('r1', 'quantity', '3.5');
    });

    expect(result.current.lines[0].quantity).toBe(3.5);
  });

  it('onAssign opens the picker', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
    act(() => {
      result.current.handlers.onAssign('r1');
    });
    expect(mockOpenPicker).toHaveBeenCalledTimes(1);
  });

  it('onSelectBudgetLine assigns the line and closes the picker', () => {
    const onFieldsEdited = jest.fn();
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onFieldsEdited })));

    act(() => {
      result.current.setLines([makeLine()]);
      result.current.handlers.onAssign('r1'); // set activeRowId
    });

    act(() => {
      result.current.handlers.onSelectBudgetLine({
        id: 'wib-1',
        workItemId: 'wi-1',
        description: 'My line',
      });
    });

    expect(result.current.lines[0]).toMatchObject({
      assignedBudgetLineId: 'wib-1',
      assignedBudgetLineType: 'work_item',
    });
    expect(mockClosePicker).toHaveBeenCalledTimes(1);
    expect(onFieldsEdited).toHaveBeenCalled();
  });

  it('onClearAssign resets assignment and calls onFieldsEdited', () => {
    const onFieldsEdited = jest.fn();
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onFieldsEdited })));

    act(() => {
      result.current.setLines([
        makeLine({ assignedBudgetLineId: 'old', assignedBudgetLineType: 'work_item' }),
      ]);
    });
    act(() => {
      result.current.handlers.onClearAssign('r1');
    });

    expect(result.current.lines[0].assignedBudgetLineId).toBeUndefined();
    expect(onFieldsEdited).toHaveBeenCalled();
  });

  it('onInlineDraftChange merges updates and calls onFieldsEdited', () => {
    const onFieldsEdited = jest.fn();
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onFieldsEdited })));

    act(() => {
      result.current.setLines([
        makeLine({
          inlineCreatedBudgetLineDraft: {
            description: 'old',
            confidence: 'invoice',
            plannedAmount: '100',
            budgetCategoryId: '',
            budgetSourceId: '',
            vendorId: '',
            pricingMode: 'direct',
            quantity: '',
            unit: '',
            unitPrice: '',
            includesVat: true,
          },
        }),
      ]);
    });
    act(() => {
      result.current.handlers.onInlineDraftChange('r1', { description: 'updated' });
    });

    expect(result.current.lines[0].inlineCreatedBudgetLineDraft?.description).toBe('updated');
    expect(onFieldsEdited).toHaveBeenCalled();
  });

  // ─── Confidence derivation ──────────────────────────────────────────────────

  it('derives invoice confidence + hides field when documentType=Invoice', () => {
    const { result } = renderHook(() =>
      useAutoItemizeLines(
        makeOptions({
          document: {
            documentType: 'Invoice',
            id: 1,
            title: 'Doc',
            content: null,
            tags: [],
            created: null,
            added: null,
            modified: null,
            correspondent: null,
            archiveSerialNumber: null,
            originalFileName: null,
            pageCount: null,
            searchHit: null,
          },
        }),
      ),
    );

    act(() => {
      result.current.setLines([makeLine()]);
      result.current.handlers.onAssign('r1');
    });
    act(() => {
      result.current.handlers.onQueueNewBudgetLine();
    });

    expect(result.current.lines[0]?.inlineCreatedBudgetLineDraft?.confidence).toBe('invoice');
    expect(result.current.lines[0]?.inlineHideConfidence).toBe(true);
  });

  it('derives quote confidence + hides field when documentType=Quotation', () => {
    const { result } = renderHook(() =>
      useAutoItemizeLines(
        makeOptions({
          document: {
            documentType: 'Quotation',
            id: 1,
            title: 'Doc',
            content: null,
            tags: [],
            created: null,
            added: null,
            modified: null,
            correspondent: null,
            archiveSerialNumber: null,
            originalFileName: null,
            pageCount: null,
            searchHit: null,
          },
        }),
      ),
    );

    act(() => {
      result.current.setLines([makeLine()]);
      result.current.handlers.onAssign('r1');
    });
    act(() => {
      result.current.handlers.onQueueNewBudgetLine();
    });

    expect(result.current.lines[0]?.inlineCreatedBudgetLineDraft?.confidence).toBe('quote');
    expect(result.current.lines[0]?.inlineHideConfidence).toBe(true);
  });

  it('falls back to score-based confidence (≥0.85 → invoice) when no doc type', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine({ confidence: 0.95 })]);
      result.current.handlers.onAssign('r1');
    });
    act(() => {
      result.current.handlers.onQueueNewBudgetLine();
    });

    expect(result.current.lines[0]?.inlineCreatedBudgetLineDraft?.confidence).toBe('invoice');
    expect(result.current.lines[0]?.inlineHideConfidence).toBe(false);
  });

  it('score 0.7 → quote', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine({ confidence: 0.7 })]);
      result.current.handlers.onAssign('r1');
    });
    act(() => {
      result.current.handlers.onQueueNewBudgetLine();
    });

    expect(result.current.lines[0]?.inlineCreatedBudgetLineDraft?.confidence).toBe('quote');
  });

  it('score 0.4 → professional_estimate', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine({ confidence: 0.4 })]);
      result.current.handlers.onAssign('r1');
    });
    act(() => {
      result.current.handlers.onQueueNewBudgetLine();
    });

    expect(result.current.lines[0]?.inlineCreatedBudgetLineDraft?.confidence).toBe(
      'professional_estimate',
    );
  });

  it('score 0.1 → own_estimate', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([makeLine({ confidence: 0.1 })]);
      result.current.handlers.onAssign('r1');
    });
    act(() => {
      result.current.handlers.onQueueNewBudgetLine();
    });

    expect(result.current.lines[0]?.inlineCreatedBudgetLineDraft?.confidence).toBe('own_estimate');
  });

  // ─── onLineCreated (picker callback) ────────────────────────────────────────

  it('onLineCreated (from picker) assigns the created line to the active row', () => {
    const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));

    act(() => {
      result.current.setLines([
        makeLine({
          assignedItemId: 'wi-1',
          assignedItemType: 'work_item',
          inlineCreatedBudgetLineDraft: {},
        }),
      ]);
      result.current.handlers.onAssign('r1'); // sets activeRowId
    });

    expect(capturedOnLineCreated).not.toBeNull();

    act(() => {
      capturedOnLineCreated!({ id: 'created-id', workItemId: 'wi-1', description: 'Created' });
    });

    expect(result.current.lines[0]).toMatchObject({
      assignedBudgetLineId: 'created-id',
      assignedBudgetLineType: 'work_item',
      inlineCreatedBudgetLineDraft: undefined,
    });
  });

  // ─── Story #1797: merge selection + merge lifecycle ─────────────────────────

  describe('selection handlers', () => {
    it('onToggleSelect adds a rowId to selectedRowIds', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' }), makeLine({ rowId: 'r2' })]);
      });

      act(() => {
        result.current.onToggleSelect('r1');
      });

      expect(result.current.selectedRowIds.has('r1')).toBe(true);
    });

    it('onToggleSelect removes a rowId already in selectedRowIds (toggle off)', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' })]);
      });

      act(() => {
        result.current.onToggleSelect('r1');
      });
      expect(result.current.selectedRowIds.has('r1')).toBe(true);

      act(() => {
        result.current.onToggleSelect('r1');
      });
      expect(result.current.selectedRowIds.has('r1')).toBe(false);
    });

    it('onToggleSelect does not select a row that already has an assignedBudgetLineId', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1', assignedBudgetLineId: 'wib-1' })]);
      });

      act(() => {
        result.current.onToggleSelect('r1');
      });

      expect(result.current.selectedRowIds.has('r1')).toBe(false);
    });

    it('onToggleSelect does not select a row with an inlineCreatedBudgetLineDraft', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1', inlineCreatedBudgetLineDraft: { description: 'draft' } }),
        ]);
      });

      act(() => {
        result.current.onToggleSelect('r1');
      });

      expect(result.current.selectedRowIds.has('r1')).toBe(false);
    });

    it('onClearSelection empties selectedRowIds', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' }), makeLine({ rowId: 'r2' })]);
      });
      act(() => {
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });
      expect(result.current.selectedRowIds.size).toBe(2);

      act(() => {
        result.current.onClearSelection();
      });

      expect(result.current.selectedRowIds.size).toBe(0);
    });
  });

  describe('onMergeSelected', () => {
    it('does nothing when fewer than 2 rows are selected', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' }), makeLine({ rowId: 'r2' })]);
        result.current.onToggleSelect('r1');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      expect(mockMergeLines).not.toHaveBeenCalled();
      expect(result.current.lines).toHaveLength(2);
    });

    it('splices the merged placeholder row at the index of the first selected line', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {})); // never resolves — inspect sync state only
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1', description: 'A' }),
          makeLine({ rowId: 'r2', description: 'B' }),
          makeLine({ rowId: 'r3', description: 'C' }),
        ]);
        // Select the 2nd and 3rd rows (index 1 and 2) — merged row should land at index 1
        result.current.onToggleSelect('r2');
        result.current.onToggleSelect('r3');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      // r1 stays at index 0; the merged placeholder replaces r2/r3 starting at index 1
      expect(result.current.lines).toHaveLength(2);
      expect(result.current.lines[0]?.rowId).toBe('r1');
      expect(result.current.lines[1]?.mergeStatus).toBe('pending');
    });

    it('sets mergeStatus="pending" on the new row synchronously (before the API call resolves)', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' }), makeLine({ rowId: 'r2' })]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      expect(result.current.lines[0]?.mergeStatus).toBe('pending');
    });

    it('clears the selection synchronously when merge starts', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' }), makeLine({ rowId: 'r2' })]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      expect(result.current.selectedRowIds.size).toBe(0);
    });

    it('records the original selected lines as mergeSourceLines on the new row', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1', description: 'Tile work' }),
          makeLine({ rowId: 'r2', description: 'Grout' }),
        ]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      const mergedLine = result.current.lines[0];
      expect(mergedLine?.mergeSourceLines).toHaveLength(2);
      expect(mergedLine?.mergeSourceLines?.map((l: { rowId: string }) => l.rowId)).toEqual([
        'r1',
        'r2',
      ]);
    });

    it('calls mergeLines with descriptions and NO numeric fields (totalAmount/quantity/unitPrice/includesVat)', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1', description: 'Tile work', totalAmount: 300 }),
          makeLine({ rowId: 'r2', description: 'Grout', totalAmount: 100 }),
        ]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      expect(mockMergeLines).toHaveBeenCalledTimes(1);
      const callArg = mockMergeLines.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg.descriptions).toEqual(['Tile work', 'Grout']);
      expect(callArg).not.toHaveProperty('totalAmount');
      expect(callArg).not.toHaveProperty('quantity');
      expect(callArg).not.toHaveProperty('unitPrice');
      expect(callArg).not.toHaveProperty('includesVat');
    });

    it('passes documentSummary through to mergeLines', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() =>
        useAutoItemizeLines(makeOptions({ documentSummary: 'Bathroom renovation' })),
      );
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' }), makeLine({ rowId: 'r2' })]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      const callArg = mockMergeLines.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArg.documentSummary).toBe('Bathroom renovation');
    });

    it('calls onMergeStart with the number of selected lines', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const onMergeStart = jest.fn();
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onMergeStart })));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1' }),
          makeLine({ rowId: 'r2' }),
          makeLine({ rowId: 'r3' }),
        ]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
        result.current.onToggleSelect('r3');
      });

      act(() => {
        result.current.onMergeSelected();
      });

      expect(onMergeStart).toHaveBeenCalledWith(3);
    });

    it('on success: populates the row description and calls onMergeSuccess', async () => {
      mockMergeLines.mockResolvedValue({
        description: 'Tile work and grout',
        category: 'Cat 1',
        budgetCategoryId: 'cat-1',
      });
      const onMergeSuccess = jest.fn();
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onMergeSuccess })));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1', description: 'Tile work' }),
          makeLine({ rowId: 'r2', description: 'Grout' }),
        ]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      await act(async () => {
        result.current.onMergeSelected();
      });

      await waitFor(() => {
        expect(result.current.lines[0]?.description).toBe('Tile work and grout');
      });
      expect(result.current.lines[0]?.mergeStatus).toBeUndefined();
      expect(result.current.lines[0]?.mergeSourceLines).toBeUndefined();
      expect(onMergeSuccess).toHaveBeenCalledTimes(1);
    });

    it('on failure: sets mergeStatus="error" and retains mergeSourceLines for retry/undo', async () => {
      mockMergeLines.mockRejectedValue(new Error('LLM unreachable'));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r1', description: 'Tile work' }),
          makeLine({ rowId: 'r2', description: 'Grout' }),
        ]);
        result.current.onToggleSelect('r1');
        result.current.onToggleSelect('r2');
      });

      await act(async () => {
        result.current.onMergeSelected();
        // allow the rejected promise microtask to settle
        await Promise.resolve().then(() => Promise.resolve());
      });

      await waitFor(() => {
        expect(result.current.lines[0]?.mergeStatus).toBe('error');
      });
      expect(result.current.lines[0]?.mergeSourceLines).toHaveLength(2);
    });
  });

  describe('onRetryMerge', () => {
    it('re-invokes mergeLines using the same mergeSourceLines snapshot', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({
            rowId: 'merged-1',
            mergeStatus: 'error',
            mergeSourceLines: [
              makeLine({ rowId: 'src-1', description: 'Tile work' }),
              makeLine({ rowId: 'src-2', description: 'Grout' }),
            ],
          }),
        ]);
      });

      act(() => {
        result.current.onRetryMerge('merged-1');
      });

      expect(mockMergeLines).toHaveBeenCalledTimes(1);
      const callArg = mockMergeLines.mock.calls[0]![0] as { descriptions: string[] };
      expect(callArg.descriptions).toEqual(['Tile work', 'Grout']);
    });

    it('resets mergeStatus back to "pending" before re-calling mergeLines', () => {
      mockMergeLines.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({
            rowId: 'merged-1',
            mergeStatus: 'error',
            mergeSourceLines: [makeLine({ rowId: 'src-1' }), makeLine({ rowId: 'src-2' })],
          }),
        ]);
      });

      act(() => {
        result.current.onRetryMerge('merged-1');
      });

      expect(result.current.lines[0]?.mergeStatus).toBe('pending');
    });

    it('does nothing when the row has no mergeSourceLines', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' })]);
      });

      act(() => {
        result.current.onRetryMerge('r1');
      });

      expect(mockMergeLines).not.toHaveBeenCalled();
    });
  });

  describe('onUndoMerge', () => {
    it('restores the original N source rows at the original index', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([
          makeLine({ rowId: 'r0', description: 'Before' }),
          makeLine({
            rowId: 'merged-1',
            mergeStatus: 'error',
            mergeSourceLines: [
              makeLine({ rowId: 'src-1', description: 'Tile work' }),
              makeLine({ rowId: 'src-2', description: 'Grout' }),
              makeLine({ rowId: 'src-3', description: 'Adhesive' }),
            ],
          }),
          makeLine({ rowId: 'r-after', description: 'After' }),
        ]);
      });

      act(() => {
        result.current.onUndoMerge('merged-1');
      });

      expect(result.current.lines).toHaveLength(4);
      expect(result.current.lines.map((l: { rowId: string }) => l.rowId)).toEqual([
        'r0',
        'src-1',
        'src-2',
        'src-3',
        'r-after',
      ]);
    });

    it('does nothing when the row has no mergeSourceLines', () => {
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions()));
      act(() => {
        result.current.setLines([makeLine({ rowId: 'r1' })]);
      });

      act(() => {
        result.current.onUndoMerge('r1');
      });

      expect(result.current.lines).toHaveLength(1);
      expect(result.current.lines[0]?.rowId).toBe('r1');
    });

    it('calls onFieldsEdited after undo', () => {
      const onFieldsEdited = jest.fn();
      const { result } = renderHook(() => useAutoItemizeLines(makeOptions({ onFieldsEdited })));
      act(() => {
        result.current.setLines([
          makeLine({
            rowId: 'merged-1',
            mergeStatus: 'error',
            mergeSourceLines: [makeLine({ rowId: 'src-1' }), makeLine({ rowId: 'src-2' })],
          }),
        ]);
      });

      act(() => {
        result.current.onUndoMerge('merged-1');
      });

      expect(onFieldsEdited).toHaveBeenCalled();
    });
  });
});

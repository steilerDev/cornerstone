/**
 * @jest-environment jsdom
 *
 * Unit tests for useAutoItemizeLines hook.
 *
 * Tests handler behaviour, confidence derivation, and onFieldsEdited callback.
 * useBudgetLinePicker is mocked so no real API calls are made.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';

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
});

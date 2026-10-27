/**
 * @jest-environment jsdom
 *
 * The Convert page's document hook (#2240): Paperless/AI availability, the selected document,
 * and `analyze`, which turns a read document into candidate values for the form.
 * Boundaries mocked: the Paperless status, config and auto-itemize preview clients.
 *
 * Mutations these tests catch:
 *  - treating a configured but unreachable Paperless as available;
 *  - a failed status/config request leaving the card on;
 *  - an extracted total taken in major units (float sums) instead of cents;
 *  - accepting a non-ISO date from the reader;
 *  - a read that finishes after Remove / Change document / unmount still writing its result;
 *  - a second Read while one runs starting another request.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type {
  AppConfigResponse,
  AutoItemizePreviewResponse,
  PaperlessStatusResponse,
} from '@cornerstone/shared';
import i18n from '../../i18n/index.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as ConfigApiTypes from '../../lib/configApi.js';
import type * as AutoItemizeApiTypes from '../../lib/invoiceAutoItemizeApi.js';

const mockGetPaperlessStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
const mockFetchConfig = jest.fn<typeof ConfigApiTypes.fetchConfig>();
const mockPreviewAutoItemize = jest.fn<typeof AutoItemizeApiTypes.previewAutoItemize>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
}));
jest.unstable_mockModule('../../lib/configApi.js', () => ({ fetchConfig: mockFetchConfig }));
jest.unstable_mockModule('../../lib/invoiceAutoItemizeApi.js', () => ({
  previewAutoItemize: mockPreviewAutoItemize,
}));

const { ApiClientError } = await import('../../lib/apiClient.js');
const { useConvertDocument } = await import('./useConvertDocument.js');

function status(over: Partial<PaperlessStatusResponse> = {}): PaperlessStatusResponse {
  return {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://paperless.example',
    filterTag: null,
    ...over,
  };
}

function config(llmEnabled: boolean): AppConfigResponse {
  return { currency: 'EUR', vatRate: 0.19, autoItemizeEnabled: llmEnabled, llmEnabled };
}

function preview(over: Partial<AutoItemizePreviewResponse> = {}): AutoItemizePreviewResponse {
  return {
    lines: [
      { description: 'x', totalAmount: 5000.1, confidence: 0.9 },
      { description: 'y', totalAmount: 5200.2, confidence: 0.9 },
    ],
    suggestedVendorId: null,
    extractedInvoiceNumber: 'AI-77',
    extractedInvoiceDate: '2026-02-02',
    extractedDueDate: '2026-03-03',
    extractedNotes: 'AI notes',
    ...over,
  } as AutoItemizePreviewResponse;
}

const DOC = { id: 5, title: 'Offer.pdf' };

/** Lets the mocked requests and the hook's promise chain settle (state cannot show a rejection). */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

async function setup(llm = true) {
  mockGetPaperlessStatus.mockResolvedValue(status());
  mockFetchConfig.mockResolvedValue(config(llm));
  const view = renderHook(() => useConvertDocument());
  await waitFor(() => expect(view.result.current.configured).toBe(true));
  return view;
}

beforeEach(() => {
  mockGetPaperlessStatus.mockReset();
  mockFetchConfig.mockReset();
  mockPreviewAutoItemize.mockReset();
});

describe('availability', () => {
  it('is off until the status and config have loaded', () => {
    mockGetPaperlessStatus.mockReturnValue(new Promise(() => undefined));
    mockFetchConfig.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useConvertDocument());
    expect(result.current).toMatchObject({
      configured: false,
      paperlessUrl: null,
      llmEnabled: false,
    });
  });

  it('exposes the Paperless URL and whether the AI reader is on', async () => {
    const { result } = await setup(true);
    expect(result.current.paperlessUrl).toBe('https://paperless.example');
    expect(result.current.llmEnabled).toBe(true);
  });

  it('reports the AI reader off when the config says so', async () => {
    const { result } = await setup(false);
    expect(result.current.llmEnabled).toBe(false);
  });

  it('needs Paperless both configured and reachable', async () => {
    mockFetchConfig.mockResolvedValue(config(true));
    mockGetPaperlessStatus.mockResolvedValue(status({ reachable: false }));
    const unreachable = renderHook(() => useConvertDocument());
    // llmEnabled comes from the config alone: true marks the moment both requests have settled.
    await waitFor(() => expect(unreachable.result.current.llmEnabled).toBe(true));
    expect(unreachable.result.current.configured).toBe(false);

    mockGetPaperlessStatus.mockResolvedValue(status({ configured: false }));
    const unconfigured = renderHook(() => useConvertDocument());
    await waitFor(() => expect(unconfigured.result.current.llmEnabled).toBe(true));
    expect(unconfigured.result.current.configured).toBe(false);
  });

  it('falls back to a null URL when the status has none', async () => {
    mockGetPaperlessStatus.mockResolvedValue(status({ paperlessUrl: undefined }));
    mockFetchConfig.mockResolvedValue(config(true));
    const { result } = renderHook(() => useConvertDocument());
    await waitFor(() => expect(result.current.configured).toBe(true));
    expect(result.current.paperlessUrl).toBeNull();
  });

  it('turns everything off when either request fails', async () => {
    mockGetPaperlessStatus.mockRejectedValue(new Error('offline'));
    mockFetchConfig.mockResolvedValue(config(true));
    const { result } = renderHook(() => useConvertDocument());
    await settle();
    expect(result.current).toMatchObject({
      configured: false,
      paperlessUrl: null,
      llmEnabled: false,
    });
  });

  it('ignores a status that arrives after unmount', async () => {
    let resolve: (value: PaperlessStatusResponse) => void = () => undefined;
    mockGetPaperlessStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    mockFetchConfig.mockResolvedValue(config(true));
    const { result, unmount } = renderHook(() => useConvertDocument());
    unmount();
    await act(async () => {
      resolve(status());
    });
    expect(result.current.configured).toBe(false);
  });
});

describe('document selection', () => {
  it('the picker opens and closes', async () => {
    const { result } = await setup();
    act(() => result.current.openPicker());
    expect(result.current.pickerOpen).toBe(true);
    act(() => result.current.closePicker());
    expect(result.current.pickerOpen).toBe(false);
  });

  it('selecting a document keeps its id and title, closes the picker and clears a previous read', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockResolvedValue(preview());
    act(() => result.current.select(DOC));
    await act(async () => {
      await result.current.analyze(5, 10000);
    });
    expect(result.current.aiState).toBe('success');
    act(() => result.current.openPicker());
    act(() => result.current.select({ id: 6, title: 'Other.pdf', ...{ extra: 'ignored' } }));
    expect(result.current.document).toEqual({ id: 6, title: 'Other.pdf' });
    expect(result.current.pickerOpen).toBe(false);
    expect(result.current.aiState).toBe('idle');
    expect(result.current.mismatch).toBeNull();
    expect(result.current.noLines).toBe(false);
  });

  it('removing the document clears it and the read state', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockRejectedValue(new Error('x'));
    act(() => result.current.select(DOC));
    await act(async () => {
      await result.current.analyze(5, 10000);
    });
    expect(result.current.aiError).not.toBe('');
    act(() => result.current.remove());
    expect(result.current.document).toBeNull();
    expect(result.current.aiState).toBe('idle');
    expect(result.current.aiError).toBe('');
  });
});

describe('analyze', () => {
  it('returns the values found: the total of the lines in cents and ISO dates', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockResolvedValue(preview());
    let candidates: unknown;
    await act(async () => {
      candidates = await result.current.analyze(5, 10200.3);
    });
    expect(mockPreviewAutoItemize).toHaveBeenCalledWith({ paperlessDocumentId: 5 });
    // 5000.10 + 5200.20 is 10200.30 exactly in cents (not 10200.300000000001).
    expect(candidates).toEqual({
      amount: '10200.30',
      date: '2026-02-02',
      dueDate: '2026-03-03',
      invoiceNumber: 'AI-77',
      notes: 'AI notes',
    });
    expect(result.current.aiState).toBe('success');
    expect(result.current.mismatch).toBeNull();
    expect(result.current.noLines).toBe(false);
  });

  it('flags a total more than 1% away from the offer', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockResolvedValue(preview());
    await act(async () => {
      await result.current.analyze(5, 9000);
    });
    expect(result.current.mismatch).toEqual({ extracted: 10200.3 });
  });

  it('does not flag a total within 1%', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockResolvedValue(preview());
    await act(async () => {
      await result.current.analyze(5, 10250);
    });
    expect(result.current.mismatch).toBeNull();
  });

  it('a document without lines sets noLines and offers no amount', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockResolvedValue(preview({ lines: [] }));
    let candidates: Record<string, string> | null = null;
    await act(async () => {
      candidates = await result.current.analyze(5, 10000);
    });
    expect(candidates).not.toHaveProperty('amount');
    expect(candidates).toHaveProperty('invoiceNumber', 'AI-77');
    expect(result.current.noLines).toBe(true);
    expect(result.current.mismatch).toBeNull();
  });

  it('ignores dates that are not YYYY-MM-DD and empty or missing text values', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockResolvedValue(
      preview({
        extractedInvoiceDate: '02.02.2026',
        extractedDueDate: '',
        extractedInvoiceNumber: null,
        extractedNotes: undefined,
      } as unknown as Partial<AutoItemizePreviewResponse>),
    );
    let candidates: unknown;
    await act(async () => {
      candidates = await result.current.analyze(5, 10200.3);
    });
    expect(candidates).toEqual({ amount: '10200.30' });
  });

  it('shows the analyzing state while the request is in flight, and a second read does nothing', async () => {
    const { result } = await setup();
    let resolve: (value: AutoItemizePreviewResponse) => void = () => undefined;
    mockPreviewAutoItemize.mockReturnValue(new Promise((r) => (resolve = r)));
    let first: Promise<unknown> = Promise.resolve(null);
    act(() => {
      first = result.current.analyze(5, 10000);
    });
    expect(result.current.aiState).toBe('analyzing');
    let second: unknown = 'unset';
    await act(async () => {
      second = await result.current.analyze(5, 10000);
    });
    expect(second).toBeNull();
    expect(mockPreviewAutoItemize).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(preview());
      await first;
    });
    expect(result.current.aiState).toBe('success');
  });

  it('an API failure shows the translated error code and returns null', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockRejectedValue(
      new ApiClientError(400, { code: 'VALIDATION_ERROR', message: 'prose' } as never),
    );
    let candidates: unknown = 'unset';
    await act(async () => {
      candidates = await result.current.analyze(5, 10000);
    });
    expect(candidates).toBeNull();
    expect(result.current.aiState).toBe('error');
    expect(result.current.aiError).toBe('The submitted data is invalid. Please check your input.');
  });

  it('a non-API failure shows the generic read error, and a retry can succeed', async () => {
    const { result } = await setup();
    mockPreviewAutoItemize.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.analyze(5, 10000);
    });
    expect(result.current.aiError).toBe(i18n.t('convertPage.document.readError', { ns: 'budget' }));
    mockPreviewAutoItemize.mockResolvedValueOnce(preview());
    await act(async () => {
      await result.current.analyze(5, 10200.3);
    });
    expect(result.current.aiState).toBe('success');
    expect(result.current.aiError).toBe('');
  });

  it('discards a result that arrives after the document was removed', async () => {
    const { result } = await setup();
    let resolve: (value: AutoItemizePreviewResponse) => void = () => undefined;
    mockPreviewAutoItemize.mockReturnValue(new Promise((r) => (resolve = r)));
    act(() => result.current.select(DOC));
    let pending: Promise<unknown> = Promise.resolve(undefined);
    act(() => {
      pending = result.current.analyze(5, 9000);
    });
    act(() => result.current.remove());
    let candidates: unknown = 'unset';
    await act(async () => {
      resolve(preview());
      candidates = await pending;
    });
    expect(candidates).toBeNull();
    expect(result.current.aiState).toBe('idle');
    expect(result.current.mismatch).toBeNull();
  });

  it('discards a failure that arrives after the document was changed', async () => {
    const { result } = await setup();
    let reject: (reason: unknown) => void = () => undefined;
    mockPreviewAutoItemize.mockReturnValue(new Promise((_, r) => (reject = r)));
    let pending: Promise<unknown> = Promise.resolve(undefined);
    act(() => {
      pending = result.current.analyze(5, 9000);
    });
    act(() => result.current.select({ id: 9, title: 'New.pdf' }));
    await act(async () => {
      reject(new Error('late'));
      await pending;
    });
    expect(result.current.aiState).toBe('idle');
    expect(result.current.aiError).toBe('');
  });

  it('discards a result that arrives after unmount', async () => {
    const { result, unmount } = await setup();
    let resolve: (value: AutoItemizePreviewResponse) => void = () => undefined;
    mockPreviewAutoItemize.mockReturnValue(new Promise((r) => (resolve = r)));
    let pending: Promise<unknown> = Promise.resolve(undefined);
    act(() => {
      pending = result.current.analyze(5, 9000);
    });
    unmount();
    let candidates: unknown = 'unset';
    await act(async () => {
      resolve(preview());
      candidates = await pending;
    });
    expect(candidates).toBeNull();
  });
});

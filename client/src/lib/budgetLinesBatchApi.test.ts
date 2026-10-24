import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { BatchCreateBudgetLinesRequest } from '@cornerstone/shared';
import { createBudgetLinesBatch } from './budgetLinesBatchApi.js';

describe('createBudgetLinesBatch', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const body = {
    invoiceId: 'inv-1',
    lines: [
      {
        kind: 'create',
        targetType: 'work_item',
        targetId: 'wi-1',
        budgetSourceId: 'src-1',
        description: 'Tiles',
        plannedAmount: 100,
      },
    ],
  } as BatchCreateBudgetLinesRequest;

  it('POSTs the body to /api/budget-lines/batch and returns the response', async () => {
    const response = {
      lines: [
        {
          index: 0,
          budgetLineId: 'bl-1',
          budgetLineType: 'work_item',
          invoiceBudgetLineId: 'ibl-1',
        },
      ],
      remainingAmount: 12.5,
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => response,
    } as Response);

    const result = await createBudgetLinesBatch(body);

    expect(result).toEqual(response);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/budget-lines/batch');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it('rejects with the server error code when the batch is refused', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'ITEMIZED_SUM_EXCEEDS_INVOICE', message: 'too much', details: { index: 2 } },
      }),
    } as Response);

    await expect(createBudgetLinesBatch(body)).rejects.toMatchObject({
      statusCode: 400,
      error: { code: 'ITEMIZED_SUM_EXCEEDS_INVOICE', details: { index: 2 } },
    });
  });
});

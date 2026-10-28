/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { useListRowDelete } from './useListRowDelete.js';

interface Row {
  id: string;
}
const A: Row = { id: 'a' };
const B: Row = { id: 'b' };

const remove = jest.fn<(item: Row) => Promise<unknown>>();
const onDeleted = jest.fn<(item: Row) => void>();

function mount(blockedMessage?: string) {
  return renderHook(() => useListRowDelete<Row>({ remove, onDeleted, blockedMessage }));
}

describe('useListRowDelete', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    remove.mockResolvedValue(undefined);
  });

  it('starts with no item open', () => {
    const { result } = mount();

    expect(result.current.deletion).toMatchObject({
      item: null,
      busy: false,
      error: null,
      blocked: false,
    });
  });

  it('opens the confirmation for the requested row', () => {
    const { result } = mount();

    act(() => result.current.request(A));

    expect(result.current.deletion.item).toBe(A);
  });

  it('removes the row, closes the dialog, then reports it as deleted', async () => {
    const { result } = mount();
    act(() => result.current.request(A));

    await act(async () => result.current.deletion.confirm());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(A));
    expect(remove).toHaveBeenCalledWith(A);
    expect(result.current.deletion.item).toBeNull();
    expect(result.current.deletion.busy).toBe(false);
  });

  it('shows the translated API error on a 409 and the blocked state', async () => {
    remove.mockRejectedValue(
      new ApiClientError(409, { code: 'CONFLICT', message: 'raw server text' }),
    );
    const { result } = mount();
    act(() => result.current.request(A));

    await act(async () => result.current.deletion.confirm());

    await waitFor(() => expect(result.current.deletion.blocked).toBe(true));
    expect(result.current.deletion.error).toEqual(expect.any(String));
    expect(result.current.deletion.error).not.toContain('raw server text');
    expect(result.current.deletion.item).toBe(A);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('replaces the 409 text with blockedMessage when given', async () => {
    remove.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
    const { result } = mount('Still referenced by invoices');
    act(() => result.current.request(A));

    await act(async () => result.current.deletion.confirm());

    await waitFor(() => expect(result.current.deletion.error).toBe('Still referenced by invoices'));
    expect(result.current.deletion.blocked).toBe(true);
  });

  it('keeps blockedMessage for a 409 only; another API error is translated and not blocked', async () => {
    remove.mockRejectedValue(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }));
    const { result } = mount('Still referenced by invoices');
    act(() => result.current.request(A));

    await act(async () => result.current.deletion.confirm());

    await waitFor(() => expect(result.current.deletion.error).not.toBeNull());
    expect(result.current.deletion.error).not.toBe('Still referenced by invoices');
    expect(result.current.deletion.blocked).toBe(false);
  });

  it('gives a network failure and an unexpected failure their own messages', async () => {
    remove.mockRejectedValueOnce(new NetworkError('offline', null));
    const { result } = mount();
    act(() => result.current.request(A));
    await act(async () => result.current.deletion.confirm());
    await waitFor(() =>
      expect(result.current.deletion.error).toBe(
        "Can't reach the server. Check your connection and try again.",
      ),
    );

    remove.mockRejectedValueOnce(new Error('weird'));
    await act(async () => result.current.deletion.confirm());
    await waitFor(() =>
      expect(result.current.deletion.error).toBe('An unexpected error occurred. Please try again.'),
    );
    expect(result.current.deletion.item).toBe(A);
  });

  it('resets the error and the blocked state when another row is requested', async () => {
    remove.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));
    const { result } = mount();
    act(() => result.current.request(A));
    await act(async () => result.current.deletion.confirm());
    await waitFor(() => expect(result.current.deletion.blocked).toBe(true));

    act(() => result.current.request(B));

    expect(result.current.deletion).toMatchObject({ item: B, blocked: false, error: null });
  });

  it('cancel closes the dialog and clears the error', async () => {
    remove.mockRejectedValue(new Error('weird'));
    const { result } = mount();
    act(() => result.current.request(A));
    await act(async () => result.current.deletion.confirm());
    await waitFor(() => expect(result.current.deletion.error).not.toBeNull());

    act(() => result.current.deletion.cancel());

    expect(result.current.deletion).toMatchObject({ item: null, error: null });
  });

  it('ignores cancel and a second confirm while the request is running', async () => {
    let finish: () => void = () => undefined;
    remove.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { result } = mount();
    act(() => result.current.request(A));
    act(() => result.current.deletion.confirm());
    await waitFor(() => expect(result.current.deletion.busy).toBe(true));

    act(() => result.current.deletion.cancel());
    act(() => result.current.deletion.confirm());

    expect(result.current.deletion.item).toBe(A);
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(result.current.deletion.item).toBeNull());
  });

  it('does nothing on confirm when no row is open', () => {
    const { result } = mount();

    act(() => result.current.deletion.confirm());

    expect(remove).not.toHaveBeenCalled();
  });

  it('uses the latest remove and onDeleted callbacks', async () => {
    const first = jest.fn<(item: Row) => Promise<unknown>>().mockResolvedValue(undefined);
    const second = jest.fn<(item: Row) => Promise<unknown>>().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ fn }: { fn: typeof first }) => useListRowDelete<Row>({ remove: fn, onDeleted }),
      { initialProps: { fn: first } },
    );
    act(() => result.current.request(A));
    rerender({ fn: second });

    await act(async () => result.current.deletion.confirm());

    await waitFor(() => expect(second).toHaveBeenCalledWith(A));
    expect(first).not.toHaveBeenCalled();
  });
});

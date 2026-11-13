/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { ApiClientError } from '../../lib/apiClient.js';

const { useCardDraft } = await import('./useCardDraft.js');

type SaveFn = (draft: Readonly<Record<'title' | 'note', string>>) => Promise<unknown>;
type SaveMock = jest.Mock<SaveFn>;
const INITIAL = { title: 'Pour slab', note: '' } as const;

function setup(over: { save?: SaveMock; errors?: Record<string, string> } = {}) {
  const save = over.save ?? jest.fn<SaveFn>().mockResolvedValue(undefined);
  const onSaved = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const validate = jest.fn((draft: Readonly<Record<'title' | 'note', string>>) =>
    draft.title.trim() ? {} : (over.errors ?? { title: 'Required' }),
  );
  const view = renderHook(() =>
    useCardDraft({ initial: INITIAL, validate, save, saveError: 'Could not save', onSaved }),
  );
  return { ...view, save, onSaved, validate };
}

describe('useCardDraft', () => {
  it('starts clean and becomes dirty when a field differs from the initial value', () => {
    const { result } = setup();
    expect(result.current.draft).toEqual(INITIAL);
    expect(result.current.dirty).toBe(false);
    act(() => result.current.set('note', 'x'));
    expect(result.current.draft.note).toBe('x');
    expect(result.current.dirty).toBe(true);
  });

  it('blocks the save and reports the field errors when validation fails', async () => {
    const { result, save } = setup();
    act(() => result.current.set('title', '  '));
    let ok = true;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(false);
    expect(result.current.errors).toEqual({ title: 'Required' });
    expect(save).not.toHaveBeenCalled();
  });

  it('persists the draft, then refreshes the page, and reports success', async () => {
    const { result, save, onSaved } = setup();
    act(() => result.current.set('note', 'Done'));
    let ok = false;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith({ title: 'Pour slab', note: 'Done' });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.banner).toBeNull();
    expect(result.current.errors).toEqual({});
  });

  it('translates the code of an API error into the banner and does not refresh', async () => {
    const save = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'raw' }));
    const { result, onSaved } = setup({ save });
    let ok = true;
    await act(async () => {
      ok = await result.current.save();
    });
    expect(ok).toBe(false);
    expect(result.current.banner).toEqual(expect.any(String));
    expect(result.current.banner).not.toBe('Could not save');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('uses the save error sentence for a failure without an API code', async () => {
    const save = jest.fn<SaveFn>().mockRejectedValue(new Error('network'));
    const { result } = setup({ save });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.banner).toBe('Could not save');
  });

  it('discard restores the initial draft and clears errors and banner', async () => {
    const save = jest.fn<SaveFn>().mockRejectedValue(new Error('network'));
    const { result } = setup({ save });
    act(() => result.current.set('note', 'x'));
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.banner).not.toBeNull();
    act(() => result.current.discard());
    expect(result.current.draft).toEqual(INITIAL);
    expect(result.current.banner).toBeNull();
    expect(result.current.errors).toEqual({});
    expect(result.current.dirty).toBe(false);
  });

  it('a successful save after a failed one clears the banner', async () => {
    const save = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);
    const { result } = setup({ save });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.banner).toBe('Could not save');
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.banner).toBeNull();
  });
});

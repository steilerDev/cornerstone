import { describe, it, expect } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import {
  useInfiniteScrollAnnouncements,
  type InfiniteScrollAnnouncementLabels,
  type UseInfiniteScrollAnnouncementsOptions,
} from './useInfiniteScrollAnnouncements.js';

interface Item {
  id: number;
  counted?: boolean;
}

const items = (...ids: number[]): Item[] => ids.map((id) => ({ id }));

const LABELS: InfiniteScrollAnnouncementLabels = {
  initialLoad: (n) => `initial:${n}`,
  batchAppended: (n) => `batch:${n}`,
  batchAppendedAndEnd: (n) => `batchEnd:${n}`,
  endOfList: () => 'end',
  loading: () => 'loading',
};

type Opts = UseInfiniteScrollAnnouncementsOptions<Item, number>;

function setup(initial: Partial<Opts> = {}) {
  const node = document.createElement('div');
  document.body.appendChild(node);
  const base: Opts = {
    fetchSequence: 0,
    status: 'idle',
    hasMore: true,
    items: [],
    getKey: (i) => i.id,
    labels: LABELS,
    ...initial,
  };
  const hook = renderHook(
    (props: Opts) => {
      const ref = useInfiniteScrollAnnouncements<Item, number>(props);
      // Attach the always-mounted region before effects run (mirrors a real status element).
      if (ref.current === null) ref.current = node;
      return ref;
    },
    { initialProps: base },
  );
  const update = (next: Partial<Opts>) => {
    Object.assign(base, next);
    hook.rerender({ ...base });
  };
  return { node, update, hook };
}

describe('useInfiniteScrollAnnouncements', () => {
  it('writes nothing at fetchSequence 0', () => {
    const { node } = setup({ items: items(1, 2) });
    expect(node.textContent).toBe('');
  });

  it('announces the initial load count at fetchSequence 1', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2, 3) });
    expect(node.textContent).toBe('initial:3');
  });

  it('announces batchAppended with the NEW key count when more remain', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2, 3) });
    update({ fetchSequence: 2, items: items(1, 2, 3, 4, 5) });
    expect(node.textContent).toBe('batch:2');
  });

  it('announces batchAppendedAndEnd when the list has ended', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1) });
    update({ fetchSequence: 2, items: items(1, 2, 3), hasMore: false });
    expect(node.textContent).toBe('batchEnd:2');
  });

  it('counts only items passing isCounted', () => {
    const { node, update } = setup({ isCounted: (i) => i.id % 2 === 0 });
    update({ fetchSequence: 1, items: items(1, 2, 3, 4) });
    expect(node.textContent).toBe('initial:2');
  });

  it('stays silent on seq 1 when everything is excluded and more remain', () => {
    const { node, update } = setup({ isCounted: () => false });
    update({ fetchSequence: 1, items: items(1, 2) });
    expect(node.textContent).toBe('');
  });

  it('announces endOfList on seq 1 when everything is excluded and the list ended', () => {
    const { node, update } = setup({ isCounted: () => false });
    update({ fetchSequence: 1, items: items(1, 2), hasMore: false });
    expect(node.textContent).toBe('end');
  });

  it('falls back to initialLoad(0) on seq 1 with no endOfList label', () => {
    const { node, update } = setup({
      isCounted: () => false,
      labels: { ...LABELS, endOfList: undefined },
    });
    update({ fetchSequence: 1, items: items(1), hasMore: false });
    expect(node.textContent).toBe('initial:0');
  });

  it('on a later fetch with no new counted items: ended -> endOfList()', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2) });
    update({ fetchSequence: 2, items: items(1, 2), hasMore: false });
    expect(node.textContent).toBe('end');
  });

  it('on a later fetch with no new counted items: ended without endOfList -> batchAppendedAndEnd(0)', () => {
    const { node, update } = setup({ labels: { ...LABELS, endOfList: undefined } });
    update({ fetchSequence: 1, items: items(1, 2) });
    update({ fetchSequence: 2, items: items(1, 2), hasMore: false });
    expect(node.textContent).toBe('batchEnd:0');
  });

  it('on a later fetch with no new counted items and more remaining: text is unchanged', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2) });
    update({ fetchSequence: 2, items: items(1, 2) });
    expect(node.textContent).toBe('initial:2');
  });

  it('announces loading() while a non-first batch loads', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1) });
    update({ fetchSequence: 2, status: 'loading' });
    expect(node.textContent).toBe('loading');
  });

  it('leaves the text unchanged while loading when no loading label is provided', () => {
    const { node, update } = setup({ labels: { ...LABELS, loading: undefined } });
    update({ fetchSequence: 1, items: items(1) });
    update({ fetchSequence: 2, status: 'loading' });
    expect(node.textContent).toBe('initial:1');
  });

  it('does not re-announce when only the label/isCounted lambdas change for the same fetch', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2) });
    node.textContent = 'sentinel';
    update({
      labels: { ...LABELS, initialLoad: (n) => `other:${n}` },
      isCounted: () => true,
      getKey: (i) => i.id,
    });
    expect(node.textContent).toBe('sentinel');
  });

  it('does not re-announce when isCounted toggles without a new fetch', () => {
    const { node, update } = setup({ isCounted: () => true });
    update({ fetchSequence: 1, items: items(1, 2) });
    expect(node.textContent).toBe('initial:2');
    node.textContent = 'sentinel';
    update({ isCounted: () => false });
    expect(node.textContent).toBe('sentinel');
  });

  it('uses the latest isCounted/labels on the next fetch', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1) });
    update({
      fetchSequence: 2,
      items: items(1, 2, 3),
      isCounted: (i) => i.id === 3,
      labels: { ...LABELS, batchAppended: (n) => `new-batch:${n}` },
    });
    expect(node.textContent).toBe('new-batch:1');
  });

  it('forgets known keys after a reset to fetchSequence 0', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2) });
    update({ fetchSequence: 0, items: [] });
    update({ fetchSequence: 1, items: items(1, 2) });
    expect(node.textContent).toBe('initial:2');
    expect(node.textContent).not.toBe('initial:0');
  });

  it('counts previously seen keys as new again when the sequence is reset and a later batch arrives', () => {
    const { node, update } = setup();
    update({ fetchSequence: 1, items: items(1, 2) });
    update({ fetchSequence: 0, items: [] });
    update({ fetchSequence: 2, items: items(1, 2) });
    expect(node.textContent).toBe('batch:2');
  });

  it('does not count, on a later fetch, keys that were first seen while uncounted', () => {
    let counted = false;
    const { node, update } = setup({ isCounted: () => counted });
    update({ fetchSequence: 1, items: items(1, 2) }); // both uncounted, hasMore -> silent
    expect(node.textContent).toBe('');
    counted = true;
    update({ fetchSequence: 2, items: items(1, 2, 3) });
    expect(node.textContent).toBe('batch:1'); // only key 3 is new
  });

  it('does nothing when no element is attached to the returned ref', () => {
    const hook = renderHook(() =>
      useInfiniteScrollAnnouncements<Item, number>({
        fetchSequence: 1,
        status: 'idle',
        hasMore: false,
        items: items(1),
        getKey: (i) => i.id,
        labels: LABELS,
      }),
    );
    expect(hook.result.current.current).toBeNull();
  });
});

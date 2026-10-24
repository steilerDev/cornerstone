import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import type { RelatedListFocus } from './useRelatedListFocus.js';
import { useRelatedListFocus } from './useRelatedListFocus.js';

interface ProbeProps {
  ids: readonly string[];
  /** Ids whose trigger button is not in the DOM even though the id is listed. */
  missing?: readonly string[];
  withFallback?: boolean;
  /** Leave the container ref unattached (the list is unmounted). */
  detached?: boolean;
  onFocus: (api: RelatedListFocus) => void;
}

function Probe({ ids, missing = [], withFallback = true, detached = false, onFocus }: ProbeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLButtonElement>(null);
  const api = useRelatedListFocus({
    ids,
    container: containerRef,
    getTrigger: (id) =>
      containerRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`) ?? null,
    fallback: () => (withFallback ? fallbackRef.current : null),
  });
  onFocus(api);
  return (
    <>
      <div ref={detached ? undefined : containerRef}>
        {ids
          .filter((id) => !missing.includes(id))
          .map((id) => (
            <button key={id} type="button" data-id={id}>
              {id}
            </button>
          ))}
        <button ref={fallbackRef} type="button">
          fallback
        </button>
      </div>
      <button type="button">outside</button>
    </>
  );
}

function setup(props: Omit<ProbeProps, 'onFocus'>) {
  const holder: { api: RelatedListFocus | null } = { api: null };
  const ui = (p: Omit<ProbeProps, 'onFocus'>) => (
    <Probe
      {...p}
      onFocus={(api) => {
        holder.api = api;
      }}
    />
  );
  const view = render(ui(props));
  return {
    api: () => holder.api as RelatedListFocus,
    update: (next: Omit<ProbeProps, 'onFocus'>) => view.rerender(ui(next)),
  };
}

const btn = (name: string) => screen.getByRole('button', { name });

describe('useRelatedListFocus: after Remove', () => {
  it('focuses the next row’s trigger once the removed id has left the list', () => {
    const probe = setup({ ids: ['a', 'b', 'c'] });

    act(() => probe.api().afterRemove(['a', 'b', 'c'], 'a'));
    // Still listed: nothing is decided yet.
    expect(btn('b')).not.toHaveFocus();

    probe.update({ ids: ['b', 'c'] });

    expect(btn('b')).toHaveFocus();
  });

  it('focuses the previous row’s trigger when the last row is removed', () => {
    const probe = setup({ ids: ['a', 'b', 'c'] });

    act(() => probe.api().afterRemove(['a', 'b', 'c'], 'c'));
    probe.update({ ids: ['a', 'b'] });

    expect(btn('b')).toHaveFocus();
  });

  it('resolves immediately when the host already dropped the row before calling', () => {
    const probe = setup({ ids: ['b', 'c'] });

    act(() => probe.api().afterRemove(['a', 'b', 'c'], 'a'));

    expect(btn('b')).toHaveFocus();
  });

  it('falls back when the only row is removed', () => {
    const probe = setup({ ids: ['a'] });

    act(() => probe.api().afterRemove(['a'], 'a'));
    probe.update({ ids: [] });

    expect(btn('fallback')).toHaveFocus();
  });

  it('falls back when the neighbour has no trigger', () => {
    const probe = setup({ ids: ['a', 'b'], missing: ['b'] });

    act(() => probe.api().afterRemove(['a', 'b'], 'a'));
    probe.update({ ids: ['b'], missing: ['b'] });

    expect(btn('fallback')).toHaveFocus();
  });

  it('moves no focus when there is neither a neighbour nor a fallback', () => {
    const probe = setup({ ids: ['a'], withFallback: false });
    btn('outside').focus();

    act(() => probe.api().afterRemove(['a'], 'a'));
    probe.update({ ids: [], withFallback: false });

    expect(btn('outside')).toHaveFocus();
  });
});

describe('useRelatedListFocus: after Remove of a row that moves', () => {
  it('waits while the list is the same, then focuses the neighbour once it reloads with the id kept', () => {
    const before = ['a', 'b', 'c'];
    const probe = setup({ ids: before });

    act(() => probe.api().afterRemove(before, 'a', { moves: true }));
    expect(btn('b')).not.toHaveFocus();
    probe.update({ ids: before });
    expect(btn('b')).not.toHaveFocus();

    probe.update({ ids: ['a', 'b', 'c'] });

    expect(btn('b')).toHaveFocus();
  });

  it('falls back when the moved row was the only one', () => {
    const before = ['a'];
    const probe = setup({ ids: before });

    act(() => probe.api().afterRemove(before, 'a', { moves: true }));
    probe.update({ ids: ['a'] });

    expect(btn('fallback')).toHaveFocus();
  });
});

describe('useRelatedListFocus: after Undo', () => {
  it('waits until the restored row is back, then focuses its trigger when focus is on body', () => {
    const probe = setup({ ids: ['b'] });
    (document.activeElement as HTMLElement | null)?.blur();

    act(() => probe.api().afterUndo('a'));
    expect(document.body).toHaveFocus();
    probe.update({ ids: ['a', 'b'] });

    expect(btn('a')).toHaveFocus();
  });

  it('focuses the trigger when focus is inside the container', () => {
    const probe = setup({ ids: ['b'] });
    btn('b').focus();

    act(() => probe.api().afterUndo('a'));
    probe.update({ ids: ['a', 'b'] });

    expect(btn('a')).toHaveFocus();
  });

  it('does not steal focus from outside the container', () => {
    const probe = setup({ ids: ['b'] });
    btn('outside').focus();

    act(() => probe.api().afterUndo('a'));
    probe.update({ ids: ['a', 'b'] });

    expect(btn('outside')).toHaveFocus();
  });

  it('keeps waiting while the restored row is listed but its trigger is not rendered yet', () => {
    const probe = setup({ ids: ['b'] });
    (document.activeElement as HTMLElement | null)?.blur();

    act(() => probe.api().afterUndo('a'));
    probe.update({ ids: ['a', 'b'], missing: ['a'] });
    expect(document.body).toHaveFocus();
    probe.update({ ids: ['a', 'b'] });

    expect(btn('a')).toHaveFocus();
  });

  it('resolves at once when the row is already back', () => {
    const probe = setup({ ids: ['a', 'b'] });
    (document.activeElement as HTMLElement | null)?.blur();

    act(() => probe.api().afterUndo('a'));

    expect(btn('a')).toHaveFocus();
  });
});

describe('useRelatedListFocus: container gone', () => {
  it('afterUndo is a no-op when the container is null', () => {
    const probe = setup({ ids: ['a', 'b'], detached: true });
    btn('outside').focus();

    expect(() => act(() => probe.api().afterUndo('a'))).not.toThrow();

    expect(btn('outside')).toHaveFocus();
  });

  it('afterRemove is a no-op when the container is null', () => {
    const probe = setup({ ids: ['a'], detached: true });
    btn('outside').focus();

    expect(() => {
      act(() => probe.api().afterRemove(['a'], 'a'));
      probe.update({ ids: [], detached: true });
    }).not.toThrow();

    expect(btn('outside')).toHaveFocus();
  });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createRef, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionCard } from './SectionCard.js';
import type { SectionCardController } from './SectionCard.js';
import { SectionCardScope } from './SectionCardScope.js';

interface CardProps {
  readonly id: string;
  readonly title: string;
  readonly controllerRef?: RefObject<SectionCardController | null>;
  readonly noEdit?: boolean;
  readonly loading?: boolean;
  readonly onStart?: () => void;
}

function Card({ id, title, controllerRef, noEdit = false, loading = false, onStart }: CardProps) {
  const [saved, setSaved] = useState('v');
  const [draft, setDraft] = useState('v');
  return (
    <SectionCard
      id={id}
      title={title}
      loading={loading}
      controllerRef={controllerRef}
      edit={
        noEdit
          ? undefined
          : {
              dirty: draft !== saved,
              onStart: () => {
                setDraft(saved);
                onStart?.();
              },
              onDiscard: () => setDraft(saved),
              onSave: async () => {
                setSaved(draft);
                return true;
              },
              renderFields: ({ firstFieldRef }) => (
                <>
                  <input
                    aria-label={`${title} field`}
                    ref={firstFieldRef as RefObject<HTMLInputElement>}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <input id={`${id}-second`} aria-label={`${title} second`} />
                </>
              ),
            }
      }
    >
      <p>{`${title} body`}</p>
    </SectionCard>
  );
}

describe('SectionCard controllerRef.startEdit (#2244)', () => {
  // Mutation: a startEdit that only flips state skips onStart and the first-field focus.
  it('opens the card like the Edit button: onStart runs and the first field has focus', async () => {
    const ref = createRef<SectionCardController>();
    const onStart = jest.fn();
    render(<Card id="a" title="Alpha" controllerRef={ref} onStart={onStart} />);

    act(() => ref.current!.startEdit());

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('section-a-form')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveFocus());
  });

  // Mutation: calling begin() directly (not through the scope) would open it over unsaved text.
  it('goes through the scope: a dirty neighbour asks first, and Discard then opens this card', async () => {
    const user = userEvent.setup();
    const ref = createRef<SectionCardController>();
    render(
      <SectionCardScope>
        <Card id="a" title="Alpha" />
        <Card id="b" title="Beta" controllerRef={ref} />
      </SectionCardScope>,
    );
    await user.click(screen.getByTestId('section-a-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Alpha field' }), 'x');

    act(() => ref.current!.startEdit());

    expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.queryByTestId('section-b-form')).toBeNull();

    await user.click(screen.getByTestId('section-a-discard-confirm'));

    await waitFor(() => expect(screen.getByTestId('section-b-form')).toBeInTheDocument());
    expect(screen.queryByTestId('section-a-form')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Beta field' })).toHaveFocus();
  });

  it('closes a clean neighbour silently and opens this card', async () => {
    const user = userEvent.setup();
    const ref = createRef<SectionCardController>();
    render(
      <SectionCardScope>
        <Card id="a" title="Alpha" />
        <Card id="b" title="Beta" controllerRef={ref} />
      </SectionCardScope>,
    );
    await user.click(screen.getByTestId('section-a-edit'));

    act(() => ref.current!.startEdit());

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByTestId('section-a-form')).toBeNull();
    expect(screen.getByTestId('section-b-form')).toBeInTheDocument();
  });

  it('is a no-op for a card without `edit`', () => {
    const ref = createRef<SectionCardController>();
    render(<Card id="a" title="Alpha" controllerRef={ref} noEdit />);

    act(() => ref.current!.startEdit());

    expect(screen.queryByTestId('section-a-form')).toBeNull();
    expect(screen.getByText('Alpha body')).toBeInTheDocument();
  });

  it('is a no-op while the card is loading', () => {
    const ref = createRef<SectionCardController>();
    const onStart = jest.fn();
    render(<Card id="a" title="Alpha" controllerRef={ref} loading onStart={onStart} />);

    act(() => ref.current!.startEdit());

    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByTestId('section-a-form')).toBeNull();
  });

  it('while already editing it focuses the first field and does not restart the edit', async () => {
    const user = userEvent.setup();
    const ref = createRef<SectionCardController>();
    const onStart = jest.fn();
    render(<Card id="a" title="Alpha" controllerRef={ref} onStart={onStart} />);
    await user.click(screen.getByTestId('section-a-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Alpha field' }), 'x');
    await user.click(screen.getByRole('textbox', { name: 'Alpha second' }));
    expect(screen.getByRole('textbox', { name: 'Alpha second' })).toHaveFocus();

    act(() => ref.current!.startEdit());

    expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveValue('vx');
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('works without a controllerRef (the prop is optional)', async () => {
    const user = userEvent.setup();
    render(<Card id="a" title="Alpha" />);
    await user.click(screen.getByTestId('section-a-edit'));
    expect(screen.getByTestId('section-a-form')).toBeInTheDocument();
  });
});

describe('SectionCard controllerRef.startEdit options (#2250)', () => {
  function Host({ onReady }: { onReady: (ref: RefObject<SectionCardController | null>) => void }) {
    const ref = useRef<SectionCardController>(null);
    onReady(ref);
    return (
      <>
        <button type="button">Change target</button>
        <Card id="a" title="Alpha" controllerRef={ref} />
      </>
    );
  }

  function setup() {
    let ref!: RefObject<SectionCardController | null>;
    render(<Host onReady={(r) => (ref = r)} />);
    return { ref, host: screen.getByRole('button', { name: 'Change target' }) };
  }

  describe('focusId', () => {
    // Mutation: ignoring focusId focuses the first field (Alpha field) instead.
    it('focuses the field with that id when it opens the card', async () => {
      const { ref } = setup();

      act(() => ref.current!.startEdit({ focusId: 'a-second' }));

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Alpha second' })).toHaveFocus(),
      );
      expect(screen.getByRole('textbox', { name: 'Alpha field' })).not.toHaveFocus();
    });

    it('focuses the field with that id while the card is already editing', async () => {
      const user = userEvent.setup();
      const { ref } = setup();
      await user.click(screen.getByTestId('section-a-edit'));
      expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveFocus();

      act(() => ref.current!.startEdit({ focusId: 'a-second' }));

      expect(screen.getByRole('textbox', { name: 'Alpha second' })).toHaveFocus();
    });

    it('falls back to the first field when no field has that id', async () => {
      const { ref } = setup();

      act(() => ref.current!.startEdit({ focusId: 'does-not-exist' }));

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveFocus(),
      );
    });

    // Mutation: not clearing focusId makes a later plain startEdit jump to the old field.
    it('forgets the id once used: the next plain startEdit focuses the first field again', async () => {
      const user = userEvent.setup();
      const { ref } = setup();
      act(() => ref.current!.startEdit({ focusId: 'a-second' }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Alpha second' })).toHaveFocus(),
      );
      await user.click(screen.getByTestId('section-a-cancel'));
      await waitFor(() => expect(screen.queryByTestId('section-a-form')).toBeNull());

      act(() => ref.current!.startEdit());

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveFocus(),
      );
    });

    it('works through the scope too (a clean neighbour closes, then the field is focused)', async () => {
      const user = userEvent.setup();
      const ref = createRef<SectionCardController>();
      render(
        <SectionCardScope>
          <Card id="a" title="Alpha" />
          <Card id="b" title="Beta" controllerRef={ref} />
        </SectionCardScope>,
      );
      await user.click(screen.getByTestId('section-a-edit'));

      act(() => ref.current!.startEdit({ focusId: 'b-second' }));

      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Beta second' })).toHaveFocus(),
      );
    });
  });

  describe('returnFocus', () => {
    // Mutation: always returning to the Edit button leaves focus on a button the host did not use.
    it('gets focus after Cancel', async () => {
      const user = userEvent.setup();
      const { ref, host } = setup();
      act(() => ref.current!.startEdit({ returnFocus: host }));
      await screen.findByTestId('section-a-form');

      await user.click(screen.getByTestId('section-a-cancel'));

      await waitFor(() => expect(host).toHaveFocus());
      expect(screen.getByTestId('section-a-edit')).not.toHaveFocus();
    });

    it('gets focus after Esc', async () => {
      const user = userEvent.setup();
      const { ref, host } = setup();
      act(() => ref.current!.startEdit({ returnFocus: host }));
      await screen.findByTestId('section-a-form');

      await user.keyboard('{Escape}');

      await waitFor(() => expect(host).toHaveFocus());
    });

    it('gets focus after a successful Save', async () => {
      const user = userEvent.setup();
      const { ref, host } = setup();
      act(() => ref.current!.startEdit({ returnFocus: host }));
      await user.type(await screen.findByRole('textbox', { name: 'Alpha field' }), 'x');

      await user.click(screen.getByTestId('section-a-save'));

      await waitFor(() => expect(screen.queryByTestId('section-a-form')).toBeNull());
      await waitFor(() => expect(host).toHaveFocus());
    });

    // Mutation: dropping the isConnected guard calls focus() on a detached node and loses focus.
    it('falls back to the Edit button when the return target is no longer in the page', async () => {
      const user = userEvent.setup();
      const { ref } = setup();
      const detached = document.createElement('button');
      act(() => ref.current!.startEdit({ returnFocus: detached }));
      await screen.findByTestId('section-a-form');

      await user.click(screen.getByTestId('section-a-cancel'));

      await waitFor(() => expect(screen.getByTestId('section-a-edit')).toHaveFocus());
    });

    // Mutation: not clearing the ref sends a later Edit-button session back to the old host.
    it('is forgotten after the session: a later Edit-button session returns to the Edit button', async () => {
      const user = userEvent.setup();
      const { ref, host } = setup();
      act(() => ref.current!.startEdit({ returnFocus: host }));
      await screen.findByTestId('section-a-form');
      await user.click(screen.getByTestId('section-a-cancel'));
      await waitFor(() => expect(host).toHaveFocus());

      await user.click(screen.getByTestId('section-a-edit'));
      await user.click(screen.getByTestId('section-a-cancel'));

      await waitFor(() => expect(screen.getByTestId('section-a-edit')).toHaveFocus());
      expect(host).not.toHaveFocus();
    });
  });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createRef, useState } from 'react';
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
                  <input aria-label={`${title} second`} />
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

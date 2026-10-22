/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionCard } from './SectionCard.js';
import { SectionCardScope } from './SectionCardScope.js';

function Card({
  id,
  title,
  onDiscard,
}: {
  readonly id: string;
  readonly title: string;
  readonly onDiscard?: () => void;
}) {
  const [saved, setSaved] = useState('v');
  const [draft, setDraft] = useState('v');
  return (
    <SectionCard
      id={id}
      title={title}
      edit={{
        dirty: draft !== saved,
        onStart: () => setDraft(saved),
        onDiscard: () => {
          setDraft(saved);
          onDiscard?.();
        },
        onSave: async () => {
          setSaved(draft);
          return true;
        },
        renderFields: ({ firstFieldRef }) => (
          <input
            aria-label={`${title} field`}
            ref={firstFieldRef as React.RefObject<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        ),
      }}
    >
      <p>{`${title} body`}</p>
    </SectionCard>
  );
}

function renderPair(onDiscardA?: () => void) {
  return render(
    <SectionCardScope>
      <Card id="a" title="Alpha" onDiscard={onDiscardA} />
      <Card id="b" title="Beta" />
    </SectionCardScope>,
  );
}

describe('SectionCardScope', () => {
  it('closes a clean open card silently when another card starts editing', async () => {
    const user = userEvent.setup();
    renderPair();
    await user.click(screen.getByTestId('section-a-edit'));
    expect(screen.getByTestId('section-a-form')).toBeInTheDocument();

    await user.click(screen.getByTestId('section-b-edit'));

    expect(screen.queryByTestId('section-a-form')).toBeNull();
    expect(screen.getByTestId('section-b-form')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Beta field' })).toHaveFocus();
  });

  it('asks before leaving a dirty card; Discard calls its onDiscard and opens the second card with focus in it', async () => {
    const onDiscardA = jest.fn();
    const user = userEvent.setup();
    renderPair(onDiscardA);
    await user.click(screen.getByTestId('section-a-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Alpha field' }), 'x');

    await user.click(screen.getByTestId('section-b-edit'));
    expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByText('Your changes to Alpha are not saved.')).toBeInTheDocument();
    expect(screen.queryByTestId('section-b-form')).toBeNull();

    await user.click(screen.getByTestId('section-a-discard-confirm'));

    expect(onDiscardA).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('section-a-form')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('section-b-form')).toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Beta field' })).toHaveFocus();
  });

  it('Keep editing leaves the dirty card open with focus back in it', async () => {
    const user = userEvent.setup();
    renderPair();
    await user.click(screen.getByTestId('section-a-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Alpha field' }), 'x');
    await user.click(screen.getByTestId('section-b-edit'));

    await user.click(screen.getByTestId('section-a-discard-cancel'));

    expect(screen.queryByTestId('section-b-form')).toBeNull();
    expect(screen.getByTestId('section-a-form')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Alpha field' })).toHaveValue('vx');
  });

  it('lets a card re-open after it was saved (scope is released)', async () => {
    const user = userEvent.setup();
    renderPair();
    await user.click(screen.getByTestId('section-a-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Alpha field' }), 'x');
    await user.click(screen.getByTestId('section-a-save'));
    await waitFor(() => expect(screen.queryByTestId('section-a-form')).toBeNull());

    await user.click(screen.getByTestId('section-b-edit'));
    expect(screen.getByTestId('section-b-form')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('allows the same card to request edit again without closing anything', async () => {
    const user = userEvent.setup();
    renderPair();
    await user.click(screen.getByTestId('section-a-edit'));
    await user.click(screen.getByTestId('section-a-cancel'));
    await user.click(screen.getByTestId('section-a-edit'));
    expect(screen.getByTestId('section-a-form')).toBeInTheDocument();
  });

  it('has exactly one persistent status region for all cards and announces saves through it', async () => {
    const user = userEvent.setup();
    renderPair();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByTestId('section-card-status')).toBe(screen.getByRole('status'));
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-atomic');

    await user.click(screen.getByTestId('section-b-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Beta field' }), 'x');
    await user.click(screen.getByTestId('section-b-save'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Beta saved.'));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('releases the scope when the open card unmounts', async () => {
    function Host() {
      const [showA, setShowA] = useState(true);
      return (
        <SectionCardScope>
          <button type="button" onClick={() => setShowA(false)}>
            remove a
          </button>
          {showA && <Card id="a" title="Alpha" />}
          <Card id="b" title="Beta" />
        </SectionCardScope>
      );
    }
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByTestId('section-a-edit'));
    await user.type(screen.getByRole('textbox', { name: 'Alpha field' }), 'x');
    await user.click(screen.getByRole('button', { name: 'remove a' }));

    await user.click(screen.getByTestId('section-b-edit'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('section-b-form')).toBeInTheDocument();
  });
});

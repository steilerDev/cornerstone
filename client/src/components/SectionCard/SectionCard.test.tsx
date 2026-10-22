/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { markEscapeHandled } from '../Modal/useFocusTrap.js';
import { SectionCard } from './SectionCard.js';

interface DemoProps {
  readonly id?: string;
  readonly title?: string;
  readonly saved?: string;
  readonly textarea?: boolean;
  readonly onSave?: (draft: string) => Promise<boolean>;
  readonly onStart?: () => void;
  readonly onDiscardSpy?: () => void;
  readonly error?: string | null;
  readonly loading?: boolean;
  readonly noEdit?: boolean;
  readonly extraFields?: boolean;
  readonly noFirstFieldRef?: boolean;
}

/** A card with a stateful draft, like a page host would build it. */
function Demo({
  id = 'details',
  title = 'Details',
  saved: initial = 'Saved text',
  textarea = false,
  onSave,
  onStart,
  onDiscardSpy,
  error = null,
  loading = false,
  noEdit = false,
  extraFields = false,
  noFirstFieldRef = false,
}: DemoProps) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  return (
    <SectionCard
      id={id}
      title={title}
      loading={loading}
      edit={
        noEdit
          ? undefined
          : {
              dirty: draft !== saved,
              error,
              onStart: () => {
                setDraft(saved);
                onStart?.();
              },
              onDiscard: () => {
                setDraft(saved);
                onDiscardSpy?.();
              },
              onSave: async () => {
                const ok = onSave ? await onSave(draft) : true;
                if (ok) setSaved(draft);
                return ok;
              },
              renderFields: ({
                firstFieldRef,
              }: {
                firstFieldRef: RefObject<HTMLElement | null>;
              }) => (
                <>
                  {textarea ? (
                    <textarea
                      aria-label="Notes"
                      ref={
                        noFirstFieldRef
                          ? undefined
                          : (firstFieldRef as RefObject<HTMLTextAreaElement>)
                      }
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                  ) : (
                    <input
                      aria-label="Name"
                      ref={
                        noFirstFieldRef ? undefined : (firstFieldRef as RefObject<HTMLInputElement>)
                      }
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && e.shiftKey) markEscapeHandled(e.nativeEvent);
                      }}
                    />
                  )}
                  {extraFields && createPortal(<input aria-label="Portaled" />, document.body)}
                </>
              ),
            }
      }
    >
      <p data-testid="read-body">{saved}</p>
    </SectionCard>
  );
}

const edit = () => screen.getByTestId('section-details-edit');
const field = (name = 'Name') =>
  screen.getByRole(name === 'Name' ? 'textbox' : 'textbox', { name });
const save = () => screen.getByTestId('section-details-save');

async function startAndType(user: ReturnType<typeof userEvent.setup>, text = ' more') {
  await user.click(edit());
  await user.type(field(), text);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SectionCard', () => {
  it('shows the title as h2 and the read body with an Edit button named "Edit Details"', () => {
    render(<Demo />);
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toHaveAttribute(
      'id',
      'details-title',
    );
    expect(screen.getByRole('region', { name: 'Details' })).toBe(
      screen.getByTestId('section-details'),
    );
    expect(screen.getByTestId('read-body')).toHaveTextContent('Saved text');
    const button = screen.getByRole('button', { name: 'Edit Details' });
    expect(button).toHaveTextContent('Edit');
  });

  it('has no Edit button without an edit config', () => {
    render(<Demo noEdit />);
    expect(screen.queryByTestId('section-details-edit')).toBeNull();
  });

  it('opens edit mode on Edit: onStart runs, first field focused, Cancel before Save', async () => {
    const onStart = jest.fn();
    const user = userEvent.setup();
    render(<Demo onStart={onStart} />);
    await user.click(edit());

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('read-body')).toBeNull();
    expect(field()).toHaveFocus();
    const cancel = screen.getByTestId('section-details-cancel');
    expect(cancel.compareDocumentPosition(save()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Ctrl+Enter to save')).toBeNull();
  });

  it('focuses the first focusable control when the host attaches no firstFieldRef', async () => {
    const user = userEvent.setup();
    render(<Demo noFirstFieldRef />);
    await user.click(edit());
    expect(field()).toHaveFocus();
  });

  it('keeps Save aria-disabled (not native disabled) while clean, and a submit does nothing', async () => {
    const onSave = jest.fn(async (_draft: string) => true);
    const user = userEvent.setup();
    render(<Demo onSave={onSave} />);
    await user.click(edit());
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(save()).not.toBeDisabled();
    await user.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('section-details-form')).toBeInTheDocument();
  });

  it('saves with Enter in a single-line input, returns to read mode, focuses Edit and announces', async () => {
    const onSave = jest.fn(async (_draft: string) => true);
    const user = userEvent.setup();
    render(<Demo onSave={onSave} />);
    await startAndType(user);
    expect(save()).not.toHaveAttribute('aria-disabled');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.getByTestId('read-body')).toHaveTextContent('Saved text more'),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Saved text more');
    expect(edit()).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Details saved.');
  });

  it('saves with the Save button', async () => {
    const onSave = jest.fn(async (_draft: string) => true);
    const user = userEvent.setup();
    render(<Demo onSave={onSave} />);
    await startAndType(user);
    await user.click(save());
    await waitFor(() => expect(screen.getByTestId('read-body')).toBeInTheDocument());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not save with Enter in a textarea but saves with Ctrl+Enter and Meta+Enter', async () => {
    const onSave = jest.fn(async (_draft: string) => true);
    const user = userEvent.setup();
    render(<Demo textarea onSave={onSave} />);
    await user.click(edit());
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), ' x{Enter}');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Notes' }), {
      key: 'Enter',
      ctrlKey: true,
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('read-body')).toBeInTheDocument());

    await user.click(edit());
    await user.type(screen.getByRole('textbox', { name: 'Notes' }), ' y');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Notes' }), {
      key: 'Enter',
      metaKey: true,
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('ignores a plain Enter keydown with a modifier outside a textarea', async () => {
    const onSave = jest.fn(async (_draft: string) => true);
    const user = userEvent.setup();
    render(<Demo onSave={onSave} />);
    await startAndType(user);
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the save hint only when the form has a textarea (Ctrl on non-Apple)', async () => {
    const user = userEvent.setup();
    render(<Demo textarea />);
    await user.click(edit());
    expect(screen.getByText('Ctrl+Enter to save')).toBeInTheDocument();
  });

  it('shows the Apple save hint on a Mac', async () => {
    jest.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const user = userEvent.setup();
    render(<Demo textarea />);
    await user.click(edit());
    expect(screen.getByText('⌘+Enter to save')).toBeInTheDocument();
  });

  it('cancels a clean card with Esc, calls onDiscard and focuses Edit', async () => {
    const onDiscardSpy = jest.fn();
    const user = userEvent.setup();
    render(<Demo onDiscardSpy={onDiscardSpy} />);
    await user.click(edit());
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('section-details-form')).toBeNull();
    expect(onDiscardSpy).toHaveBeenCalledTimes(1);
    expect(edit()).toHaveFocus();
  });

  it('cancels a clean card with the Cancel button', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(edit());
    await user.click(screen.getByTestId('section-details-cancel'));
    expect(screen.getByTestId('read-body')).toBeInTheDocument();
    expect(edit()).toHaveFocus();
  });

  it('ignores Esc coming from an element portaled outside the form', async () => {
    const user = userEvent.setup();
    render(<Demo extraFields />);
    await user.click(edit());
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Portaled' }), { key: 'Escape' });
    expect(screen.getByTestId('section-details-form')).toBeInTheDocument();
  });

  it('ignores an Esc that something else already handled', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(edit());
    fireEvent.keyDown(field(), { key: 'Escape', shiftKey: true });
    expect(screen.getByTestId('section-details-form')).toBeInTheDocument();
  });

  it('ignores Esc whose default was already prevented', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(edit());
    const target = field();
    target.addEventListener('keydown', (e) => e.preventDefault(), { capture: true });
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(screen.getByTestId('section-details-form')).toBeInTheDocument();
  });

  it('asks before discarding a dirty card (Esc and Cancel) and Keep editing returns focus to the field', async () => {
    const onDiscardSpy = jest.fn();
    const user = userEvent.setup();
    render(<Demo onDiscardSpy={onDiscardSpy} />);
    await startAndType(user);

    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(screen.getByText('Your changes to Details are not saved.')).toBeInTheDocument();
    await user.click(screen.getByTestId('section-details-discard-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('Saved text more');
    expect(onDiscardSpy).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('section-details-cancel'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('Discard calls onDiscard, restores the saved text and focuses Edit', async () => {
    const onDiscardSpy = jest.fn();
    const user = userEvent.setup();
    render(<Demo onDiscardSpy={onDiscardSpy} />);
    await startAndType(user);
    await user.click(screen.getByTestId('section-details-cancel'));
    await user.click(screen.getByTestId('section-details-discard-confirm'));

    expect(onDiscardSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('read-body')).toHaveTextContent('Saved text');
    expect(screen.queryByTestId('section-details-form')).toBeNull();
    expect(edit()).toHaveFocus();
  });

  it('keeps the card in edit mode with the error and focus on Save when onSave resolves false', async () => {
    const onSave = jest.fn(async (_draft: string) => false);
    const user = userEvent.setup();
    render(<Demo onSave={onSave} error="Could not save." />);
    await startAndType(user);
    await user.click(save());

    await waitFor(() => expect(screen.getByTestId('section-details-form')).toBeInTheDocument());
    expect(screen.getByText('Could not save.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toHaveTextContent('');
    expect(save()).not.toHaveAttribute('aria-busy');
  });

  it('moves focus to Save after a failed save, from the button, Enter and Ctrl+Enter', async () => {
    const onSave = jest.fn(async (_draft: string) => false);
    const user = userEvent.setup();
    const { unmount } = render(<Demo onSave={onSave} error="Could not save." />);
    await startAndType(user);
    await user.click(save());
    await waitFor(() => expect(save()).toHaveFocus());

    await user.click(field());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(save()).toHaveFocus());
    unmount();

    render(<Demo textarea onSave={onSave} error="Could not save." />);
    await user.click(edit());
    const notes = screen.getByRole('textbox', { name: 'Notes' });
    await user.type(notes, ' x');
    fireEvent.keyDown(notes, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(save()).toHaveFocus());
  });

  it('copes with the Edit button being hidden when a save succeeds and the card turns loading', async () => {
    function LoadingAfterSave() {
      const [loading, setLoading] = useState(false);
      const [saved, setSaved] = useState('a');
      const [draft, setDraft] = useState('a');
      return (
        <SectionCard
          id="details"
          title="Details"
          loading={loading}
          edit={{
            dirty: draft !== saved,
            onDiscard: () => setDraft(saved),
            onSave: async () => {
              setLoading(true);
              setSaved(draft);
              return true;
            },
            renderFields: () => (
              <input aria-label="Name" value={draft} onChange={(e) => setDraft(e.target.value)} />
            ),
          }}
        >
          <p>body</p>
        </SectionCard>
      );
    }
    const user = userEvent.setup();
    render(<LoadingAfterSave />);
    await user.click(edit());
    await user.type(field(), 'b');
    await user.click(save());
    await waitFor(() =>
      expect(screen.getByTestId('section-details')).toHaveAttribute('aria-busy', 'true'),
    );
    expect(screen.queryByTestId('section-details-edit')).toBeNull();
    await screen.findByText('Details saved.');
  });

  it('treats a rejected onSave as a failed save', async () => {
    const onSave = jest.fn(async (_draft: string): Promise<boolean> => {
      throw new Error('boom');
    });
    const user = userEvent.setup();
    render(<Demo onSave={onSave} />);
    await startAndType(user);
    await user.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(screen.getByTestId('section-details-form')).toBeInTheDocument();
    expect(save()).toHaveTextContent('Save');
  });

  it('is busy while saving: Save shows "Saving…", a second submit and Esc and Cancel are ignored', async () => {
    let resolve: (ok: boolean) => void = () => {};
    const onSave = jest.fn((_draft: string) => new Promise<boolean>((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<Demo onSave={onSave} />);
    await startAndType(user);
    await user.click(save());

    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(save()).toHaveAttribute('aria-busy', 'true');
    expect(save()).toHaveTextContent('Saving…');
    expect(screen.getByTestId('section-details-cancel')).toHaveAttribute('aria-disabled', 'true');

    await user.click(save());
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(field(), { key: 'Escape' });
    await user.click(screen.getByTestId('section-details-cancel'));
    expect(screen.getByTestId('section-details-form')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await act(async () => resolve(true));
    await waitFor(() => expect(screen.getByTestId('read-body')).toBeInTheDocument());
  });

  it('adds a beforeunload listener only while dirty and removes it afterwards', async () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const user = userEvent.setup();
    render(<Demo />);
    const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === 'beforeunload');

    await user.click(edit());
    expect(count(add)).toHaveLength(0);

    await user.type(field(), 'x');
    expect(count(add)).toHaveLength(1);
    const listener = count(add)[0]![1] as (event: BeforeUnloadEvent) => void;
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    listener(event);
    expect(event.defaultPrevented).toBe(true);

    await user.click(save());
    await waitFor(() => expect(count(remove)).toHaveLength(1));
    expect(count(remove)[0]![1]).toBe(listener);
  });

  it('renders a skeleton instead of the body and hides Edit while loading', () => {
    render(<Demo loading />);
    expect(screen.getByTestId('section-details')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('read-body')).toBeNull();
    expect(screen.queryByTestId('section-details-edit')).toBeNull();
  });

  it('uses a custom test id and its own status region without a scope', async () => {
    const user = userEvent.setup();
    render(
      <SectionCard
        id="x"
        title="Extra"
        testId="custom-card"
        edit={{
          dirty: true,
          onSave: async () => true,
          onDiscard: () => {},
          renderFields: () => <input aria-label="f" />,
        }}
      >
        <p>body</p>
      </SectionCard>,
    );
    await user.click(screen.getByTestId('custom-card-edit'));
    await user.click(screen.getByTestId('custom-card-save'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Extra saved.'));
  });

  it('does nothing when Edit is activated while already editing (re-entrancy guard)', async () => {
    const onStart = jest.fn();
    const user = userEvent.setup();
    render(<Demo onStart={onStart} />);
    await user.click(edit());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('survives a card whose edit config is removed while editing', async () => {
    function Toggle() {
      const [withEdit, setWithEdit] = useState(true);
      const ref = useRef(0);
      ref.current += 1;
      return (
        <>
          <button type="button" onClick={() => setWithEdit(false)}>
            drop
          </button>
          <SectionCard
            id="details"
            title="Details"
            edit={
              withEdit
                ? {
                    dirty: false,
                    onSave: async () => true,
                    onDiscard: () => {},
                    renderFields: () => <input aria-label="Name" />,
                  }
                : undefined
            }
          >
            <p>body</p>
          </SectionCard>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Toggle />);
    await user.click(edit());
    await user.click(screen.getByRole('button', { name: 'drop' }));
    expect(screen.getByRole('region', { name: 'Details' })).toBeInTheDocument();
  });
});

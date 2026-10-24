/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { useRef, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ObjectListColumnsDialog } from './ObjectListColumnsDialog.js';

function setup() {
  const returnFocusRef = { current: null } as React.RefObject<HTMLElement | null>;
  const handlers = {
    onToggleColumn: jest.fn(),
    onMoveColumn: jest.fn(),
    onResetToDefaults: jest.fn(),
    onClose: jest.fn(),
  };
  render(
    <ObjectListColumnsDialog
      listKey="tasks"
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'area', label: 'Area' },
        { key: 'due', label: 'Due' },
      ]}
      visibleColumns={new Set(['name', 'area'])}
      returnFocusRef={returnFocusRef}
      {...handlers}
    />,
  );
  return { handlers };
}

describe('ObjectListColumnsDialog', () => {
  it('shows the columns in a titled dialog with the visible ones checked', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Columns' });
    expect(within(dialog).getByRole('checkbox', { name: 'Area' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Due' })).not.toBeChecked();
  });

  it('toggles a column through the host callback, using the list key as id prefix', () => {
    const { handlers } = setup();
    const box = screen.getByRole('checkbox', { name: 'Due' });
    expect(box.id).toContain('tasks');
    fireEvent.click(box);
    expect(handlers.onToggleColumn).toHaveBeenCalledWith('due');
  });

  it('resets to defaults', () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(handlers.onResetToDefaults).toHaveBeenCalledTimes(1);
  });

  it('closes with Done and with Escape', () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    handlers.onClose.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the page menu trigger when it closes', () => {
    function Host() {
      const ref = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(false);
      return (
        <>
          <button ref={ref} type="button" onClick={() => setOpen(true)}>
            Open columns
          </button>
          {open ? (
            <ObjectListColumnsDialog
              listKey="tasks"
              columns={[{ key: 'name', label: 'Name' }]}
              visibleColumns={new Set(['name'])}
              returnFocusRef={ref}
              onToggleColumn={jest.fn()}
              onMoveColumn={jest.fn()}
              onResetToDefaults={jest.fn()}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open columns' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import type { HomeHideableSectionId } from '@cornerstone/shared';
import type * as DialogModule from './CustomizeDialog.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { renderHome } from '../../test/homeRender.js';

let CustomizeDialog: typeof DialogModule.CustomizeDialog;
let media: MatchMediaControl;

beforeEach(async () => {
  if (!CustomizeDialog) ({ CustomizeDialog } = await import('./CustomizeDialog.js'));
  media = installMatchMedia({ '(min-width: 768px)': true });
});

afterEach(() => media.restore());

function Harness({
  initial = [],
  onChangeSpy,
  onCloseSpy,
}: {
  initial?: HomeHideableSectionId[];
  onChangeSpy?: (next: HomeHideableSectionId[]) => void;
  onCloseSpy?: () => void;
}) {
  const [hidden, setHidden] = useState<HomeHideableSectionId[]>(initial);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button">
        menu
      </button>
      <CustomizeDialog
        hidden={hidden}
        onChange={(next) => {
          onChangeSpy?.(next);
          setHidden(next);
        }}
        onClose={() => onCloseSpy?.()}
        returnFocusRef={triggerRef}
      />
    </>
  );
}

describe('CustomizeDialog', () => {
  it('lists the four hideable sections as checked boxes and no box for Needs attention', () => {
    renderHome(<Harness />);

    const dialog = screen.getByRole('dialog', { name: 'Customize Home' });
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes.map((box) => box.parentElement?.textContent)).toEqual([
      'Tidy up',
      'This week',
      'Pulse',
      'Latest from the site',
    ]);
    boxes.forEach((box) => expect(box).toBeChecked());
    expect(within(dialog).queryByRole('checkbox', { name: 'Needs attention' })).toBeNull();
    expect(within(dialog).getByText('Needs attention always shows.')).toBeInTheDocument();
  });

  it('offers only hiding: no reorder controls and the order stays fixed', () => {
    renderHome(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText('Choose which sections show. The order stays the same.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /move|up|down/i })).toBeNull();
  });

  it('shows hidden sections as unchecked', () => {
    renderHome(<Harness initial={['pulse']} />);
    expect(screen.getByRole('checkbox', { name: 'Pulse' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'This week' })).toBeChecked();
  });

  it('writes the hidden list in section order, whatever order the boxes were clicked in', async () => {
    const onChange = jest.fn();
    renderHome(<Harness onChangeSpy={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pulse' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tidy up' }));

    expect(onChange).toHaveBeenNthCalledWith(1, ['pulse']);
    expect(onChange).toHaveBeenNthCalledWith(2, ['tidy-up', 'pulse']);
  });

  it('removes a section from the hidden list when its box is checked again', async () => {
    const onChange = jest.fn();
    renderHome(<Harness initial={['this-week', 'pulse']} onChangeSpy={onChange} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'This week' }));

    expect(onChange).toHaveBeenCalledWith(['pulse']);
  });

  it('announces each change in a persistent status region', async () => {
    renderHome(<Harness />);
    const dialog = screen.getByRole('dialog');
    const status = within(dialog).getByRole('status');
    expect(status).toHaveTextContent('');
    expect(status).not.toHaveAttribute('aria-atomic');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pulse' }));
    expect(status).toHaveTextContent('Pulse hidden');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pulse' }));
    expect(status).toHaveTextContent('Pulse shown');
  });

  it('has exactly one primary button, Done, which closes', async () => {
    const onClose = jest.fn();
    renderHome(<Harness onCloseSpy={onClose} />);
    const dialog = screen.getByRole('dialog');

    const done = within(dialog).getByRole('button', { name: 'Done' });
    expect(done.className).toMatch(/btnPrimary/);
    expect(
      within(dialog)
        .getAllByRole('button')
        .filter((button) => /btnPrimary/.test(button.className)),
    ).toHaveLength(1);
    await userEvent.click(done);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders as a bottom sheet below 768 px with the same content', () => {
    media.set('(min-width: 768px)', false);
    renderHome(<Harness />);

    expect(screen.getByTestId('home-customize-sheet')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});

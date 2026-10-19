import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { createRef, useRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../../test/matchMediaControl.js';
import { TagPickerDialog } from './TagPickerDialog.js';

const WIDE = '(min-width: 768px)';

describe('TagPickerDialog', () => {
  let media: MatchMediaControl | null = null;

  afterEach(() => {
    media?.restore();
    media = null;
  });

  function setup() {
    const onClose = jest.fn();
    const view = render(
      <TagPickerDialog
        title="Choose an area"
        onClose={onClose}
        returnFocusRef={createRef<HTMLElement>()}
        testId="picker"
      >
        <button type="button">inside</button>
      </TagPickerDialog>,
    );
    return { onClose, ...view };
  }

  it('is a titled bottom Sheet below 768px holding its children', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Choose an area' })).toBeInTheDocument();
    expect(screen.getByTestId('picker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'inside' })).toBeInTheDocument();
  });

  it('is a titled Modal from 768px holding its children under the testId', () => {
    media = installMatchMedia({ [WIDE]: true });
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Choose an area' });
    expect(dialog).toContainElement(screen.getByTestId('picker'));
    expect(screen.getByTestId('picker')).toContainElement(
      screen.getByRole('button', { name: 'inside' }),
    );
  });

  it.each([
    ['sheet', false],
    ['modal', true],
  ])('Escape calls onClose (%s)', async (_name, wide) => {
    media = installMatchMedia({ [WIDE]: wide });
    const { onClose } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('focus', () => {
    function Host({ removeOpener }: { removeOpener: boolean }) {
      const [open, setOpen] = useState(false);
      const targetRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          {open && removeOpener ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              open
            </button>
          )}
          <button type="button" ref={targetRef}>
            target
          </button>
          {open ? (
            <TagPickerDialog
              title="Pick"
              onClose={() => setOpen(false)}
              returnFocusRef={targetRef}
              testId="picker"
            >
              <button type="button">inside</button>
            </TagPickerDialog>
          ) : null}
        </>
      );
    }

    it.each([
      ['sheet', false],
      ['modal', true],
    ])('moves focus into the dialog and back to the opener on Escape (%s)', async (_n, wide) => {
      media = installMatchMedia({ [WIDE]: wide });
      render(<Host removeOpener={false} />);
      await userEvent.click(screen.getByRole('button', { name: 'open' }));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
      );

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'open' })).toHaveFocus());
    });

    it.each([
      ['sheet', false],
      ['modal', true],
    ])('falls back to returnFocusRef when the opener is gone (%s)', async (_n, wide) => {
      media = installMatchMedia({ [WIDE]: wide });
      render(<Host removeOpener />);
      await userEvent.click(screen.getByRole('button', { name: 'open' }));
      await screen.findByRole('dialog');

      await userEvent.keyboard('{Escape}');

      await waitFor(() => expect(screen.getByRole('button', { name: 'target' })).toHaveFocus());
    });
  });
});

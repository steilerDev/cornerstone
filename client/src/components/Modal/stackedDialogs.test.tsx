/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal.js';
import { Sheet } from './Sheet.js';

const zOf = (el: HTMLElement) => el.style.zIndex;

/** A Modal that opens a second dialog (Modal or Sheet) over itself. */
function Stack({
  upper,
  onLowerClose,
  onUpperClose,
}: {
  upper: 'modal' | 'sheet';
  onLowerClose?: () => void;
  onUpperClose?: () => void;
}) {
  const [lowerOpen, setLowerOpen] = useState(true);
  const [upperOpen, setUpperOpen] = useState(false);
  return (
    <div>
      {lowerOpen && (
        <Modal
          title="Lower"
          onClose={() => {
            onLowerClose?.();
            setLowerOpen(false);
          }}
        >
          <button type="button" onClick={() => setUpperOpen(true)}>
            open upper
          </button>
        </Modal>
      )}
      {upperOpen && upper === 'modal' && (
        <Modal
          title="Upper"
          onClose={() => {
            onUpperClose?.();
            setUpperOpen(false);
          }}
        >
          <button type="button">upper body</button>
        </Modal>
      )}
      {upper === 'sheet' && (
        <Sheet
          id="upper"
          testId="upper"
          open={upperOpen}
          title="Upper"
          onClose={() => {
            onUpperClose?.();
            setUpperOpen(false);
          }}
        >
          <button type="button">upper body</button>
        </Sheet>
      )}
    </div>
  );
}

describe('stacked dialogs (#2213)', () => {
  describe('layering', () => {
    it('a lone Modal keeps the stylesheet layer (no inline z-index)', () => {
      render(
        <Modal title="Only" onClose={() => {}}>
          <p>x</p>
        </Modal>,
      );
      expect(zOf(screen.getByRole('dialog'))).toBe('');
    });

    it('a Modal opened over a Modal gets a higher layer than the one below', async () => {
      const user = userEvent.setup();
      render(<Stack upper="modal" />);
      expect(zOf(screen.getByRole('dialog', { name: 'Lower' }))).toBe('');

      await user.click(screen.getByRole('button', { name: 'open upper' }));

      const upper = screen.getByRole('dialog', { name: 'Upper' });
      expect(zOf(upper)).not.toBe('');
      expect(upper.getAttribute('style')).toContain('var(--z-modal) + 2');
    });

    it('a Sheet opened over a Modal stacks above it: backdrop at +2, panel at +3', async () => {
      const user = userEvent.setup();
      render(<Stack upper="sheet" />);

      await user.click(screen.getByRole('button', { name: 'open upper' }));

      expect(screen.getByTestId('upper-backdrop').getAttribute('style')).toContain(
        'var(--z-modal) + 2',
      );
      expect(screen.getByTestId('upper').getAttribute('style')).toContain('var(--z-modal) + 3');
    });

    it('a closed Sheet takes no layer and does not push a Modal opened meanwhile', () => {
      render(
        <div>
          <Sheet id="closed" open={false} title="Closed" onClose={() => {}}>
            <p>x</p>
          </Sheet>
          <Modal title="Modal" onClose={() => {}}>
            <p>x</p>
          </Modal>
        </div>,
      );
      expect(zOf(screen.getByRole('dialog', { name: 'Modal' }))).toBe('');
    });

    it('a lone open Sheet keeps the stylesheet layers', () => {
      render(
        <Sheet id="solo" testId="solo" open title="Solo" onClose={() => {}}>
          <p>x</p>
        </Sheet>,
      );
      expect(screen.getByTestId('solo-backdrop').getAttribute('style') ?? '').not.toContain(
        'z-modal',
      );
      expect(screen.getByTestId('solo').getAttribute('style') ?? '').not.toContain('z-modal');
    });

    it('the layer is freed when the upper dialog closes: a new one stacks at the same level', async () => {
      const user = userEvent.setup();
      render(<Stack upper="modal" />);
      await user.click(screen.getByRole('button', { name: 'open upper' }));
      const first = screen.getByRole('dialog', { name: 'Upper' }).getAttribute('style');
      await user.keyboard('{Escape}');

      await user.click(screen.getByRole('button', { name: 'open upper' }));

      expect(screen.getByRole('dialog', { name: 'Upper' }).getAttribute('style')).toBe(first);
    });
  });

  describe.each(['modal', 'sheet'] as const)('Escape with a %s over a Modal', (upper) => {
    it('closes only the top dialog with one Escape', async () => {
      const user = userEvent.setup();
      const onLower = jest.fn();
      const onUpper = jest.fn();
      render(<Stack upper={upper} onLowerClose={onLower} onUpperClose={onUpper} />);
      await user.click(screen.getByRole('button', { name: 'open upper' }));

      await user.keyboard('{Escape}');

      expect(onUpper).toHaveBeenCalledTimes(1);
      expect(onLower).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Lower' })).toBeInTheDocument();
    });

    it('a second Escape then closes the lower dialog', async () => {
      const user = userEvent.setup();
      const onLower = jest.fn();
      render(<Stack upper={upper} onLowerClose={onLower} />);
      await user.click(screen.getByRole('button', { name: 'open upper' }));

      await user.keyboard('{Escape}');
      await user.keyboard('{Escape}');

      expect(onLower).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog', { name: 'Lower' })).not.toBeInTheDocument();
    });
  });

  it('Escape closes the lower dialog again once the upper one is gone', async () => {
    const user = userEvent.setup();
    const onLower = jest.fn();
    render(<Stack upper="modal" onLowerClose={onLower} />);
    await user.click(screen.getByRole('button', { name: 'open upper' }));
    await user.keyboard('{Escape}');
    expect(onLower).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');

    expect(onLower).toHaveBeenCalledTimes(1);
  });
});

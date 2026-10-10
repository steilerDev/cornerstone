/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnchoredPanel } from './AnchoredPanel.js';
import type { AnchoredPanelDismissReason, AnchoredPanelProps } from './AnchoredPanel.js';

function Host({
  open = true,
  role,
  trapFocus,
  closeSignal,
  onDismiss,
  extra,
}: {
  open?: boolean;
  role?: AnchoredPanelProps['role'];
  trapFocus?: boolean;
  closeSignal?: unknown;
  onDismiss: (reason: AnchoredPanelDismissReason) => void;
  extra?: React.ReactNode;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={anchorRef} type="button" data-testid="anchor">
        anchor
      </button>
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>
      <AnchoredPanel
        open={open}
        anchorRef={anchorRef}
        role={role}
        id="panel-1"
        ariaLabel="Panel label"
        ariaDescribedBy="desc-1"
        onDismiss={onDismiss}
        trapFocus={trapFocus}
        closeSignal={closeSignal}
        testId="panel"
      >
        <button type="button" data-testid="first">
          first
        </button>
        <button type="button" data-testid="last">
          last
        </button>
        {extra}
      </AnchoredPanel>
    </div>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AnchoredPanel', () => {
  describe('rendering', () => {
    it('renders nothing while closed', () => {
      render(<Host open={false} onDismiss={jest.fn()} />);
      expect(screen.queryByTestId('panel')).toBeNull();
    });

    it('has no role attribute when role is omitted (plain content)', () => {
      render(<Host onDismiss={jest.fn()} />);
      expect(screen.getByTestId('panel')).not.toHaveAttribute('role');
    });

    it('portals to body with the given id, label and description', () => {
      const { container } = render(<Host onDismiss={jest.fn()} />);
      const panel = screen.getByTestId('panel');
      expect(container.contains(panel)).toBe(false);
      expect(document.body.contains(panel)).toBe(true);
      expect(panel).toHaveAttribute('id', 'panel-1');
      expect(panel).toHaveAttribute('aria-label', 'Panel label');
      expect(panel).toHaveAttribute('aria-describedby', 'desc-1');
    });

    it('supports the dialog role', () => {
      render(<Host role="dialog" onDismiss={jest.fn()} />);
      expect(screen.getByRole('dialog', { name: 'Panel label' })).toBeInTheDocument();
    });

    it('is positioned fixed and hidden (opacity 0) until Floating UI has placed it', () => {
      render(<Host onDismiss={jest.fn()} />);
      const panel = screen.getByTestId('panel');
      expect(panel.style.position).toBe('fixed');
      expect(panel.style.opacity).toBe('0');
    });

    it('mounts after being opened later', () => {
      const { rerender } = render(<Host open={false} onDismiss={jest.fn()} />);
      rerender(<Host open onDismiss={jest.fn()} />);
      expect(screen.getByTestId('panel')).toBeInTheDocument();
    });
  });

  describe('dismissal', () => {
    it('Escape dismisses with reason "escape"', () => {
      const onDismiss = jest.fn();
      render(<Host onDismiss={onDismiss} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith('escape');
    });

    it('other keys do not dismiss', () => {
      const onDismiss = jest.fn();
      render(<Host onDismiss={onDismiss} />);
      fireEvent.keyDown(document, { key: 'Enter' });
      fireEvent.keyDown(document, { key: 'a' });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('Escape does nothing while closed', () => {
      const onDismiss = jest.fn();
      render(<Host open={false} onDismiss={onDismiss} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('with trapFocus, Escape still dismisses with reason "escape"', () => {
      const onDismiss = jest.fn();
      render(<Host role="dialog" trapFocus onDismiss={onDismiss} />);
      screen.getByTestId('first').focus();
      fireEvent.keyDown(screen.getByTestId('first'), { key: 'Escape' });
      expect(onDismiss).toHaveBeenCalledWith('escape');
    });

    it('a press outside dismisses with reason "outside"', () => {
      const onDismiss = jest.fn();
      render(<Host onDismiss={onDismiss} />);
      fireEvent.mouseDown(screen.getByTestId('elsewhere'));
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith('outside');
    });

    it('a press on the anchor or inside the panel is not an outside press', () => {
      const onDismiss = jest.fn();
      render(<Host onDismiss={onDismiss} />);
      fireEvent.mouseDown(screen.getByTestId('anchor'));
      fireEvent.mouseDown(screen.getByTestId('first'));
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('a changed closeSignal while open dismisses with reason "route"', () => {
      const onDismiss = jest.fn();
      const { rerender } = render(<Host closeSignal="a" onDismiss={onDismiss} />);
      expect(onDismiss).not.toHaveBeenCalled();
      rerender(<Host closeSignal="b" onDismiss={onDismiss} />);
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith('route');
    });

    it('an unchanged closeSignal does not dismiss', () => {
      const onDismiss = jest.fn();
      const { rerender } = render(<Host closeSignal="a" onDismiss={onDismiss} />);
      rerender(<Host closeSignal="a" onDismiss={onDismiss} />);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('the signal at open time is the baseline: a change before opening does not dismiss', () => {
      const onDismiss = jest.fn();
      const { rerender } = render(<Host open={false} closeSignal="a" onDismiss={onDismiss} />);
      rerender(<Host open={false} closeSignal="b" onDismiss={onDismiss} />);
      rerender(<Host open closeSignal="b" onDismiss={onDismiss} />);
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('always calls the latest onDismiss', () => {
      const first = jest.fn();
      const second = jest.fn();
      const { rerender } = render(<Host onDismiss={first} />);
      rerender(<Host onDismiss={second} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith('escape');
    });

    it('stops listening after it closes', () => {
      const onDismiss = jest.fn();
      const { rerender } = render(<Host onDismiss={onDismiss} />);
      rerender(<Host open={false} onDismiss={onDismiss} />);
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.mouseDown(document.body);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('focus trap (date-step style content)', () => {
    it('Tab on the last control wraps to the first', () => {
      render(<Host role="dialog" trapFocus onDismiss={jest.fn()} />);
      screen.getByTestId('last').focus();
      fireEvent.keyDown(screen.getByTestId('last'), { key: 'Tab' });
      expect(screen.getByTestId('first')).toHaveFocus();
    });

    it('Shift+Tab on the first control wraps to the last', () => {
      render(<Host role="dialog" trapFocus onDismiss={jest.fn()} />);
      screen.getByTestId('first').focus();
      fireEvent.keyDown(screen.getByTestId('first'), { key: 'Tab', shiftKey: true });
      expect(screen.getByTestId('last')).toHaveFocus();
    });

    it('without trapFocus Tab is left alone (menus close on Tab themselves)', () => {
      render(<Host onDismiss={jest.fn()} />);
      screen.getByTestId('last').focus();
      fireEvent.keyDown(screen.getByTestId('last'), { key: 'Tab' });
      expect(screen.getByTestId('last')).toHaveFocus();
    });
  });

  describe('as part of a toggling host', () => {
    function Toggler() {
      const [open, setOpen] = useState(false);
      const [reason, setReason] = useState('');
      const anchorRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={anchorRef} type="button" onClick={() => setOpen((o) => !o)}>
            toggle
          </button>
          <span data-testid="reason">{reason}</span>
          <AnchoredPanel
            open={open}
            anchorRef={anchorRef}
            id="p"
            onDismiss={(r) => {
              setReason(r);
              setOpen(false);
            }}
          >
            <div role="menu">
              <button type="button" role="menuitem">
                item
              </button>
            </div>
          </AnchoredPanel>
        </>
      );
    }

    it('opens, dismisses on Escape and can be reopened', () => {
      render(<Toggler />);
      fireEvent.click(screen.getByText('toggle'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByTestId('reason')).toHaveTextContent('escape');
      fireEvent.click(screen.getByText('toggle'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });
});

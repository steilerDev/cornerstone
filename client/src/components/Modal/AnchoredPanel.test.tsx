/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnchoredPanel } from './AnchoredPanel.js';
import { Modal } from './Modal.js';
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

    it('a press inside a SearchPicker dropdown (portaled outside the panel) is not an outside press', () => {
      const onDismiss = jest.fn();
      render(
        <>
          <Host onDismiss={onDismiss} />
          <div data-search-picker-dropdown>
            <span data-testid="picker-option">Area A</span>
          </div>
        </>,
      );
      fireEvent.mouseDown(screen.getByTestId('picker-option'));
      expect(onDismiss).not.toHaveBeenCalled();
      fireEvent.mouseDown(screen.getByTestId('elsewhere'));
      expect(onDismiss).toHaveBeenCalledWith('outside');
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

describe('AnchoredPanel placement and layer (#2231)', () => {
  function Basic({
    placement,
    layer,
    modal,
  }: {
    placement?: 'bottom-start' | 'bottom-end';
    layer?: 'popover' | 'dialog';
    modal?: boolean;
  }) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={anchorRef} type="button">
          anchor
        </button>
        <AnchoredPanel
          open
          anchorRef={anchorRef}
          id="p"
          placement={placement}
          layer={layer}
          onDismiss={jest.fn()}
          testId="panel"
        >
          <span>content</span>
        </AnchoredPanel>
        {modal ? (
          <Modal title="Stacked" onClose={() => {}}>
            <span>modal body</span>
          </Modal>
        ) : null}
      </>
    );
  }

  it('renders with an explicit bottom-end placement', () => {
    render(<Basic placement="bottom-end" />);
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('marks the panel root with data-anchored-panel', () => {
    render(<Basic />);
    expect(screen.getByTestId('panel')).toHaveAttribute('data-anchored-panel');
  });

  it('the default popover layer sets no z-index of its own', () => {
    render(<Basic />);
    expect(screen.getByTestId('panel').style.zIndex).toBe('');
  });

  it('the dialog layer takes the dialog level 0 z-index', () => {
    render(<Basic layer="dialog" />);
    expect(screen.getByTestId('panel').style.zIndex).toBe('calc(var(--z-modal) + 0)');
  });

  it('a Modal opened afterwards stacks above a dialog-layer panel', () => {
    const { rerender } = render(<Basic layer="dialog" />);
    rerender(<Basic layer="dialog" modal />);
    expect(screen.getByTestId('panel').style.zIndex).toBe('calc(var(--z-modal) + 0)');
    const dialog = screen.getByRole('dialog', { name: 'Stacked' });
    const layered = [dialog, dialog.parentElement, dialog.parentElement?.parentElement].find(
      (el) => el?.style.zIndex,
    );
    expect(layered?.style.zIndex).toBe('calc(var(--z-modal) + 2)');
  });
});

describe('AnchoredPanel outside-press exclusions (#2231)', () => {
  type Dismiss = (reason: AnchoredPanelDismissReason) => void;

  function PanelIn({ children, onDismiss }: { children?: React.ReactNode; onDismiss: Dismiss }) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={anchorRef} type="button" data-testid="anchor">
          anchor
        </button>
        <AnchoredPanel open anchorRef={anchorRef} id="p" onDismiss={onDismiss} testId="panel">
          <span>content</span>
        </AnchoredPanel>
        {children}
      </>
    );
  }

  it('a press inside a second [data-anchored-panel] (a row menu) is not outside', () => {
    const onDismiss = jest.fn();
    render(
      <PanelIn onDismiss={onDismiss}>
        <div data-anchored-panel="">
          <button type="button" data-testid="nested-item">
            item
          </button>
        </div>
      </PanelIn>,
    );
    fireEvent.mouseDown(screen.getByTestId('nested-item'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a press inside a stacked [aria-modal="true"] dialog is not outside', () => {
    const onDismiss = jest.fn();
    render(
      <PanelIn onDismiss={onDismiss}>
        <div role="alertdialog" aria-modal="true">
          <button type="button" data-testid="confirm">
            confirm
          </button>
        </div>
      </PanelIn>,
    );
    fireEvent.mouseDown(screen.getByTestId('confirm'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('a press inside the toast region (Undo) is not outside', () => {
    const onDismiss = jest.fn();
    render(
      <PanelIn onDismiss={onDismiss}>
        <div data-toast-container="">
          <button type="button" data-testid="undo">
            Undo
          </button>
        </div>
      </PanelIn>,
    );
    fireEvent.mouseDown(screen.getByTestId('undo'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('becomes visible once Floating UI has positioned it', async () => {
    render(<PanelIn onDismiss={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('panel').style.opacity).not.toBe('0'));
  });

  it('a press on the plain body is still outside', () => {
    const onDismiss = jest.fn();
    render(<PanelIn onDismiss={onDismiss} />);
    fireEvent.mouseDown(document.body);
    expect(onDismiss).toHaveBeenCalledWith('outside');
  });

  function AnchoredInModal({ onDismiss, stacked }: { onDismiss: Dismiss; stacked?: boolean }) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <div aria-modal="true" role="dialog">
          <button ref={anchorRef} type="button">
            anchor
          </button>
          <button type="button" data-testid="modal-elsewhere">
            elsewhere in the modal
          </button>
        </div>
        <AnchoredPanel open anchorRef={anchorRef} id="p" onDismiss={onDismiss} testId="panel">
          <span>content</span>
        </AnchoredPanel>
        {stacked ? (
          <div aria-modal="true" role="alertdialog">
            <button type="button" data-testid="stacked-confirm">
              confirm
            </button>
          </div>
        ) : null}
      </>
    );
  }

  it('a press elsewhere in the Modal that holds the anchor dismisses', () => {
    const onDismiss = jest.fn();
    render(<AnchoredInModal onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByTestId('modal-elsewhere'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('outside');
  });

  it('a press inside a different dialog stacked on top of the anchor modal does not dismiss', () => {
    const onDismiss = jest.fn();
    render(<AnchoredInModal onDismiss={onDismiss} stacked />);
    fireEvent.mouseDown(screen.getByTestId('stacked-confirm'));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  function AnchoredInPanel({ onDismiss, nested }: { onDismiss: Dismiss; nested?: boolean }) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <div data-anchored-panel="">
          <button ref={anchorRef} type="button">
            anchor
          </button>
          <button type="button" data-testid="host-elsewhere">
            elsewhere in the host
          </button>
        </div>
        <AnchoredPanel open anchorRef={anchorRef} id="p" onDismiss={onDismiss} testId="panel">
          <span>content</span>
        </AnchoredPanel>
        {nested ? (
          <div data-anchored-panel="">
            <button type="button" data-testid="nested-menu-item">
              item
            </button>
          </div>
        ) : null}
      </>
    );
  }

  it('a press elsewhere in a host [data-anchored-panel] that holds the anchor dismisses', () => {
    const onDismiss = jest.fn();
    render(<AnchoredInPanel onDismiss={onDismiss} />);
    fireEvent.mouseDown(screen.getByTestId('host-elsewhere'));
    expect(onDismiss).toHaveBeenCalledWith('outside');
  });

  it('a press inside a separate nested panel does not dismiss', () => {
    const onDismiss = jest.fn();
    render(<AnchoredInPanel onDismiss={onDismiss} nested />);
    fireEvent.mouseDown(screen.getByTestId('nested-menu-item'));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('AnchoredPanel nested Escape (#2231)', () => {
  type Dismiss = (reason: AnchoredPanelDismissReason) => void;

  function Nested({
    onOuter,
    onInner,
    innerOpen = true,
  }: {
    onOuter: Dismiss;
    onInner: Dismiss;
    innerOpen?: boolean;
  }) {
    const outerAnchorRef = useRef<HTMLButtonElement>(null);
    const innerAnchorRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={outerAnchorRef} type="button">
          outer anchor
        </button>
        <AnchoredPanel
          open
          anchorRef={outerAnchorRef}
          id="outer"
          role="dialog"
          trapFocus
          onDismiss={onOuter}
          testId="outer"
        >
          <button ref={innerAnchorRef} type="button">
            row action
          </button>
        </AnchoredPanel>
        <AnchoredPanel
          open={innerOpen}
          anchorRef={innerAnchorRef}
          id="inner"
          onDismiss={onInner}
          testId="inner"
        >
          <span>menu</span>
        </AnchoredPanel>
      </>
    );
  }

  it('the first Escape dismisses only the inner non-trapping panel', () => {
    const onOuter = jest.fn();
    const onInner = jest.fn();
    render(<Nested onOuter={onOuter} onInner={onInner} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onInner).toHaveBeenCalledWith('escape');
    expect(onOuter).not.toHaveBeenCalled();
  });

  it('with the inner panel gone, the next Escape dismisses the outer one', () => {
    const onOuter = jest.fn();
    const onInner = jest.fn();
    const { rerender } = render(<Nested onOuter={onOuter} onInner={onInner} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    rerender(<Nested onOuter={onOuter} onInner={onInner} innerOpen={false} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onInner).toHaveBeenCalledTimes(1);
    expect(onOuter).toHaveBeenCalledTimes(1);
    expect(onOuter).toHaveBeenCalledWith('escape');
  });

  it('a non-trapping panel hears Escape even when a bubbling handler stops it (capture phase)', () => {
    const onDismiss = jest.fn();
    render(<Host onDismiss={onDismiss} />);
    const target = screen.getByTestId('elsewhere');
    target.addEventListener('keydown', (e) => e.stopPropagation());
    fireEvent.keyDown(target, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledWith('escape');
  });
});

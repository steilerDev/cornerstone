/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import React, { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet.js';

function Host({
  initialOpen = false,
  onCloseSpy,
  dismissOnClose = true,
}: {
  initialOpen?: boolean;
  onCloseSpy?: () => void;
  dismissOnClose?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const openerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={openerRef} type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      <button type="button" onClick={() => setOpen(false)}>
        programmatic close
      </button>
      <Sheet
        id="s1"
        open={open}
        title="Sheet title"
        returnFocusRef={openerRef}
        onClose={() => {
          onCloseSpy?.();
          if (dismissOnClose) setOpen(false);
        }}
      >
        <button type="button">body one</button>
        <button type="button">body two</button>
      </Sheet>
    </div>
  );
}

afterEach(() => {
  delete document.documentElement.dataset.scrollLocked;
});

describe('Sheet', () => {
  it('closed: the panel is inert and exposes no dialog role, aria-modal or label', () => {
    render(<Host />);
    const panel = screen.getByTestId('sheet');
    expect(panel).toHaveAttribute('inert');
    expect(panel).not.toHaveAttribute('role');
    expect(panel).not.toHaveAttribute('aria-modal');
    expect(panel).not.toHaveAttribute('aria-labelledby');
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('open: the panel is a modal dialog labelled by its heading', async () => {
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBe(screen.getByTestId('sheet'));
    expect(dialog).not.toHaveAttribute('inert');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const heading = screen.getByRole('heading', { name: 'Sheet title' });
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(dialog).toHaveAttribute('data-open', 'true');
  });

  it('moves focus to the first body control on open', async () => {
    render(<Host />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByText('body one')).toHaveFocus();
  });

  it('falls back to the close button when the body has no focusable control', () => {
    function Empty() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Sheet id="e" open title="t" onClose={() => {}} returnFocusRef={ref}>
          <p>text only</p>
        </Sheet>
      );
    }
    render(<Empty />);
    expect(screen.getByTestId('sheet-close')).toHaveFocus();
  });

  it('wraps Tab and Shift+Tab inside the open sheet', async () => {
    render(<Host initialOpen />);
    screen.getByText('body two').focus();
    await userEvent.tab();
    expect(screen.getByTestId('sheet-close')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText('body two')).toHaveFocus();
  });

  it('Escape calls onClose and returns focus to the opener', async () => {
    const spy = jest.fn();
    render(<Host onCloseSpy={spy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.keyboard('{Escape}');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('opener')).toHaveFocus();
    expect(screen.getByTestId('sheet')).toHaveAttribute('inert');
  });

  it('the Close button calls onClose and returns focus to the opener', async () => {
    const spy = jest.fn();
    render(<Host onCloseSpy={spy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.click(screen.getByTestId('sheet-close'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('a backdrop click calls onClose and returns focus to the opener', async () => {
    const spy = jest.fn();
    render(<Host onCloseSpy={spy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('a close that was not a dismissal (prop-driven) does not steal focus back', async () => {
    const spy = jest.fn();
    render(<Host onCloseSpy={spy} />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.click(screen.getByText('programmatic close'));
    // The click focused the "programmatic close" button; it must stay there.
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText('programmatic close')).toHaveFocus();
  });

  it('locks page scroll only while open', async () => {
    render(<Host />);
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
    await userEvent.click(screen.getByText('opener'));
    expect(document.documentElement.dataset.scrollLocked).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
  });

  it('releases the scroll lock on unmount while open', () => {
    const { unmount } = render(<Host initialOpen />);
    expect(document.documentElement.dataset.scrollLocked).toBe('true');
    unmount();
    expect(document.documentElement.dataset.scrollLocked).toBeUndefined();
  });

  it('uses the testId prefix for its parts and defaults to "sheet"', () => {
    function Custom() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Sheet id="c" open={false} title="t" onClose={() => {}} returnFocusRef={ref} testId="mine">
          x
        </Sheet>
      );
    }
    render(<Custom />);
    expect(screen.getByTestId('mine')).toBeInTheDocument();
    expect(screen.getByTestId('mine-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('mine-close')).toBeInTheDocument();
  });

  it('names the Close button from the common aria.closeDialog key', () => {
    render(<Host initialOpen />);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBe(
      screen.getByTestId('sheet-close'),
    );
  });
});

describe('Sheet (#2212 extensions)', () => {
  function Basic(props: Partial<React.ComponentProps<typeof Sheet>> & { open?: boolean }) {
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <Sheet
        id="x"
        open={props.open ?? true}
        title="T"
        onClose={props.onClose ?? (() => {})}
        returnFocusRef={ref}
        {...props}
      >
        <button type="button">body one</button>
        <button type="button" data-testid="second">
          body two
        </button>
      </Sheet>
    );
  }

  function Cond({ skip, withReturn }: { skip?: boolean; withReturn?: boolean }) {
    const [open, setOpen] = useState(false);
    const retRef = useRef<HTMLButtonElement>(null);
    const skipRef = useRef(skip === true);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          opener
        </button>
        <button type="button" ref={retRef}>
          ret
        </button>
        {open && (
          <Sheet
            id="c"
            open
            title="T"
            onClose={() => setOpen(false)}
            returnFocusRef={withReturn ? retRef : undefined}
            skipOpenerRef={skipRef}
            restoreFocusOnUnmount
          >
            <button type="button">in</button>
          </Sheet>
        )}
      </div>
    );
  }

  it('fullScreen adds the full-screen panel and body classes; bottom does not', () => {
    const { rerender } = render(<Basic variant="fullScreen" />);
    expect(screen.getByTestId('sheet').className).toContain('panelFullScreen');
    expect(screen.getByText('body one').parentElement?.className).toContain('bodyFullScreen');
    rerender(<Basic />);
    expect(screen.getByTestId('sheet').className).not.toContain('panelFullScreen');
    expect(screen.getByText('body one').parentElement?.className).not.toContain('bodyFullScreen');
  });

  it('renders the footer slot below the body only when given', () => {
    const { rerender } = render(<Basic />);
    expect(screen.queryByTestId('foot')).toBeNull();
    rerender(<Basic footer={<button data-testid="foot">save</button>} />);
    expect(screen.getByTestId('foot').parentElement?.className).toContain('footer');
  });

  it('renders headerStart before the title', () => {
    render(<Basic headerStart={<span data-testid="hs">back</span>} />);
    const hs = screen.getByTestId('hs');
    expect(hs.nextElementSibling).toBe(screen.getByRole('heading', { name: 'T' }));
  });

  it('focuses initialFocusRef instead of the first control', () => {
    function WithRef() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Sheet id="x" open title="T" onClose={() => {}} initialFocusRef={ref}>
          <button type="button">first</button>
          <button type="button" ref={ref}>
            wanted
          </button>
        </Sheet>
      );
    }
    render(<WithRef />);
    expect(screen.getByText('wanted')).toHaveFocus();
  });

  it('dismissible=false: Escape, backdrop and Close do nothing; Close is aria-disabled', async () => {
    const spy = jest.fn();
    render(<Basic dismissible={false} onClose={spy} />);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    await userEvent.click(screen.getByTestId('sheet-close'));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByTestId('sheet-close')).toHaveAttribute('aria-disabled', 'true');
  });

  it('dismissible (default) leaves Close without aria-disabled', () => {
    render(<Basic />);
    expect(screen.getByTestId('sheet-close')).not.toHaveAttribute('aria-disabled');
  });

  it('restoreFocusOnUnmount returns focus to the opener when the sheet unmounts', async () => {
    render(<Cond />);
    await userEvent.click(screen.getByText('opener'));
    expect(screen.getByText('in')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('in')).toBeNull();
    expect(screen.getByText('opener')).toHaveFocus();
  });

  it('skipOpenerRef sends focus to returnFocusRef instead of the opener', async () => {
    render(<Cond skip withReturn />);
    await userEvent.click(screen.getByText('opener'));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText('ret')).toHaveFocus();
  });

  it('works without a returnFocusRef (optional)', () => {
    render(<Basic open={false} />);
    expect(screen.getByTestId('sheet')).toHaveAttribute('inert');
  });
});

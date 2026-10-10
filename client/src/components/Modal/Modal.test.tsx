/**
 * @jest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Modal } from './Modal.js';
import { Sheet } from './Sheet.js';

// CSS modules are mocked via identity-obj-proxy (classNames returned as-is)

describe('Modal', () => {
  const defaultProps = {
    title: 'Test Modal Title',
    onClose: jest.fn<() => void>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the title text', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal body content</p>
      </Modal>,
    );

    expect(screen.getByRole('heading', { name: 'Test Modal Title' })).toBeInTheDocument();
  });

  it('renders children inside the modal body', () => {
    render(
      <Modal {...defaultProps}>
        <p data-testid="modal-child">Hello from inside</p>
      </Modal>,
    );

    expect(screen.getByTestId('modal-child')).toBeInTheDocument();
    expect(screen.getByTestId('modal-child')).toHaveTextContent('Hello from inside');
  });

  it('renders footer content when footer prop is provided', () => {
    render(
      <Modal
        {...defaultProps}
        footer={
          <>
            <button type="button">Cancel</button>
            <button type="button">Save</button>
          </>
        }
      >
        <p>Modal body content</p>
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render footer section when footer prop is omitted', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal body content</p>
      </Modal>,
    );

    // Only the close button should be present — no footer action buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!).toHaveAttribute('aria-label', 'Close dialog');
  });

  // ── Close interactions ────────────────────────────────────────────────────

  it('close button calls onClose when clicked', () => {
    const onClose = jest.fn<() => void>();
    render(
      <Modal {...defaultProps} onClose={onClose}>
        <p>Modal body content</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onClose', () => {
    const onClose = jest.fn<() => void>();
    // Modal uses createPortal into document.body, so content lives in baseElement (body)
    // not in the render container. Use document.querySelector to find the backdrop.
    render(
      <Modal {...defaultProps} onClose={onClose}>
        <p>Modal body content</p>
      </Modal>,
    );

    // The backdrop div uses the shared CSS module class "modalBackdrop"
    // identity-obj-proxy returns class names as-is, so the class is "modalBackdrop"
    const backdrop = document.querySelector('[class*="modalBackdrop"]');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onClose', () => {
    const onClose = jest.fn<() => void>();
    render(
      <Modal {...defaultProps} onClose={onClose}>
        <p>Modal body content</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key does NOT call onClose after unmount (handler cleaned up)', () => {
    const onClose = jest.fn<() => void>();
    const { unmount } = render(
      <Modal {...defaultProps} onClose={onClose}>
        <p>Modal body content</p>
      </Modal>,
    );

    unmount();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('non-Escape key does not call onClose', () => {
    const onClose = jest.fn<() => void>();
    render(
      <Modal {...defaultProps} onClose={onClose}>
        <p>Modal body content</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(onClose).not.toHaveBeenCalled();
  });

  // ── ARIA attributes ───────────────────────────────────────────────────────

  it('dialog container has role="dialog"', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal body content</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('dialog has aria-modal="true"', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal body content</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('dialog has aria-labelledby referencing the title element id', () => {
    render(
      <Modal {...defaultProps}>
        <p>Modal body content</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    // The heading with that id should contain the title text
    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).toBeTruthy();
    expect(titleEl).toHaveTextContent('Test Modal Title');
  });

  // ── className forwarding ──────────────────────────────────────────────────

  it('forwards className to the content panel', () => {
    // Modal uses createPortal; content lives in document.body, not the render container
    render(
      <Modal {...defaultProps} className="myCustomClass">
        <p>Modal body content</p>
      </Modal>,
    );

    // The content div is the one that gets the extra className alongside the
    // shared modalContent and local content class names
    const contentPanel = document.querySelector('[class*="myCustomClass"]');
    expect(contentPanel).toBeTruthy();
  });

  // ── Focus management ──────────────────────────────────────────────────────

  it('focuses the close button on mount (first focusable in content panel)', () => {
    render(
      <Modal {...defaultProps}>
        <p>Non-interactive body</p>
      </Modal>,
    );

    // contentRef wraps the entire content panel. The close button sits in the
    // header div — it is always the first focusable element in the panel.
    // On mount, focus is moved to this button.
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('focuses the close button even when children contain inputs (close button comes first in DOM)', () => {
    render(
      <Modal {...defaultProps}>
        <input data-testid="first-input" placeholder="Focus me" />
        <input data-testid="second-input" placeholder="Second" />
      </Modal>,
    );

    // The close button is in the header, which precedes the body in DOM order.
    // querySelectorAll returns elements in document order, so the close button
    // is always [0] and receives focus.
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
  });

  it('does not throw when children have no focusable elements', () => {
    expect(() => {
      render(
        <Modal {...defaultProps}>
          <p>No interactive elements here</p>
        </Modal>,
      );
    }).not.toThrow();
  });

  // ── createPortal — renders into document.body ─────────────────────────────

  it('renders content into document.body via portal', () => {
    const { baseElement } = render(
      <Modal {...defaultProps}>
        <span data-testid="portal-content">In portal</span>
      </Modal>,
    );

    // baseElement is document.body; portal content should be there
    expect(baseElement.querySelector('[data-testid="portal-content"]')).toBeTruthy();
  });

  // ── Focus trap (Tab-cycling) ──────────────────────────────────────────────

  it('Tab on the last focusable element wraps focus to the first', () => {
    render(
      <Modal {...defaultProps}>
        <input data-testid="only-input" placeholder="Only field" />
      </Modal>,
    );

    // Focusables in DOM order: close button (header), then the input (body).
    const closeButton = screen.getByRole('button', { name: 'Close dialog' });
    const input = screen.getByTestId('only-input');

    // Close button is focused on mount; move focus to the last focusable (input).
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });

    expect(document.activeElement).toBe(closeButton);
  });

  it('Shift+Tab on the first focusable element wraps focus to the last', () => {
    render(
      <Modal {...defaultProps}>
        <input data-testid="only-input" placeholder="Only field" />
      </Modal>,
    );

    const closeButton = screen.getByRole('button', { name: 'Close dialog' });
    const input = screen.getByTestId('only-input');

    // Close button is the first focusable (and is focused on mount).
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(input);
  });

  it('Tab and Shift+Tab with a single focusable element keep focus on it', () => {
    render(
      <Modal {...defaultProps}>
        <p>No interactive elements in the body</p>
      </Modal>,
    );

    // The only focusable element in the whole content panel is the close button.
    const closeButton = screen.getByRole('button', { name: 'Close dialog' });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeButton);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeButton);
  });

  it('Tab does not throw and does not move focus when the active element is neither first nor last', () => {
    render(
      <Modal {...defaultProps}>
        <input data-testid="first-input" placeholder="First" />
        <input data-testid="second-input" placeholder="Second" />
      </Modal>,
    );

    // Focusables in DOM order: close button, first-input, second-input.
    // Focus the middle element — neither first (close button) nor last (second-input).
    const middleInput = screen.getByTestId('first-input');
    middleInput.focus();
    expect(document.activeElement).toBe(middleInput);

    expect(() => {
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    }).not.toThrow();

    // The trap only intervenes at the boundaries; focus is left untouched here
    // (the browser's native Tab order would normally move focus, but jsdom
    // doesn't simulate that — this test only verifies the trap doesn't hijack it).
    expect(document.activeElement).toBe(middleInput);
  });

  it('Tab does not throw when contentRef has no element ref yet (defensive null guard)', () => {
    // Covers the `!contentRef.current` guard in the handler — exercised naturally
    // once the Modal unmounts and its ref is cleared, but the listener is also
    // removed on unmount, so this asserts the unmounted (no-op) case doesn't throw.
    const { unmount } = render(
      <Modal {...defaultProps}>
        <input data-testid="only-input" placeholder="Only field" />
      </Modal>,
    );

    unmount();

    expect(() => {
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    }).not.toThrow();
  });

  it('trap only affects focus within contentRef, not the whole document (non-Tab keys still ignored)', () => {
    const onClose = jest.fn<() => void>();
    render(
      <Modal {...defaultProps} onClose={onClose}>
        <input data-testid="only-input" placeholder="Only field" />
      </Modal>,
    );

    const input = screen.getByTestId('only-input');
    input.focus();

    // A non-Tab key must not trigger the wrap logic or onClose.
    fireEvent.keyDown(document, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(input);
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── initialFocusRef (Story #2148) ─────────────────────────────────────────

  describe('initialFocusRef', () => {
    function WithRef() {
      const ref = React.useRef<HTMLInputElement>(null);
      return (
        <Modal {...defaultProps} initialFocusRef={ref}>
          <input aria-label="Preferred" ref={ref} />
        </Modal>
      );
    }

    it('focuses the referenced element on mount instead of the close button', () => {
      render(<WithRef />);

      expect(document.activeElement).toBe(screen.getByLabelText('Preferred'));
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Close dialog' }));
    });

    it('falls back to the first focusable element when the ref is unattached', () => {
      const ref = { current: null } as React.RefObject<HTMLElement | null>;
      render(
        <Modal {...defaultProps} initialFocusRef={ref}>
          <input aria-label="Other" />
        </Modal>,
      );

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }));
    });

    it('keeps the default first-focusable behaviour when no ref is given', () => {
      render(
        <Modal {...defaultProps}>
          <input aria-label="Other" />
        </Modal>,
      );

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }));
    });
  });

  describe('focus restore chain on unmount', () => {
    interface HostProps {
      withReturnRef?: boolean;
      withHeading?: boolean;
    }

    function Host({ withReturnRef = false, withHeading = true }: HostProps) {
      const [open, setOpen] = React.useState(false);
      const [openerMounted, setOpenerMounted] = React.useState(true);
      const [openerDisabled, setOpenerDisabled] = React.useState(false);
      const returnRef = React.useRef<HTMLButtonElement>(null);
      return (
        <main>
          {withHeading && <h1>Page heading</h1>}
          <button ref={returnRef} type="button">
            return target
          </button>
          <button type="button" onClick={() => setOpenerDisabled(true)}>
            disable opener
          </button>
          <button type="button" onClick={() => setOpenerMounted(false)}>
            remove opener
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            close modal
          </button>
          {openerMounted && (
            <button type="button" disabled={openerDisabled} onClick={() => setOpen(true)}>
              opener
            </button>
          )}
          {open && (
            <Modal
              title="Chain"
              onClose={() => setOpen(false)}
              returnFocusRef={withReturnRef ? returnRef : undefined}
            >
              <button type="button">inside</button>
            </Modal>
          )}
        </main>
      );
    }

    // The buttons that change the host live outside the modal, so they are driven by dispatching
    // clicks (the modal is aria-modal but jsdom does not make the rest inert).
    function openModal() {
      const opener = screen.getByRole('button', { name: 'opener' });
      opener.focus();
      fireEvent.click(opener);
    }

    function closeViaHost() {
      fireEvent.click(screen.getByRole('button', { name: 'close modal' }));
    }

    it('1. restores focus to the opener', () => {
      render(<Host withReturnRef />);
      openModal();
      closeViaHost();
      expect(screen.getByRole('button', { name: 'opener' })).toHaveFocus();
    });

    it('2. falls through to returnFocusRef when the opener is disabled', () => {
      render(<Host withReturnRef />);
      openModal();
      fireEvent.click(screen.getByRole('button', { name: 'disable opener' }));
      closeViaHost();
      expect(screen.getByRole('button', { name: 'return target' })).toHaveFocus();
    });

    it('2b. falls through to returnFocusRef when the opener is removed', () => {
      render(<Host withReturnRef />);
      openModal();
      fireEvent.click(screen.getByRole('button', { name: 'remove opener' }));
      closeViaHost();
      expect(screen.getByRole('button', { name: 'return target' })).toHaveFocus();
    });

    it('3. falls through to the page heading when the opener is unusable and there is no returnFocusRef', () => {
      render(<Host />);
      openModal();
      fireEvent.click(screen.getByRole('button', { name: 'remove opener' }));
      closeViaHost();
      expect(screen.getByRole('heading', { name: 'Page heading' })).toHaveFocus();
      expect(document.body).not.toHaveFocus();
    });

    it('3b. falls through to the page heading when the returnFocusRef target is disabled too', () => {
      function Disabled() {
        const [open, setOpen] = React.useState(true);
        const ref = React.useRef<HTMLButtonElement>(null);
        return (
          <main>
            <h1>Page heading</h1>
            <button ref={ref} type="button" disabled>
              dead target
            </button>
            {open && (
              <Modal title="Chain" onClose={() => setOpen(false)} returnFocusRef={ref}>
                <p>body</p>
              </Modal>
            )}
          </main>
        );
      }
      render(<Disabled />);
      fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(screen.getByRole('heading', { name: 'Page heading' })).toHaveFocus();
    });

    it('3c. opener removed in the same commit that closes the modal (delete from a list) ends on the heading', async () => {
      function ListHost() {
        const [rows, setRows] = React.useState(['a', 'b']);
        const [pending, setPending] = React.useState<string | null>(null);
        return (
          <main>
            <h1>Page heading</h1>
            {rows.map((row) => (
              <button key={row} type="button" onClick={() => setPending(row)}>
                delete {row}
              </button>
            ))}
            {pending && (
              <Modal title="Confirm" onClose={() => setPending(null)}>
                <button
                  type="button"
                  onClick={() => {
                    // One batched update: the row (the opener) goes away together with the dialog.
                    setRows((r) => r.filter((x) => x !== pending));
                    setPending(null);
                  }}
                >
                  confirm
                </button>
              </Modal>
            )}
          </main>
        );
      }
      render(<ListHost />);
      const opener = screen.getByRole('button', { name: 'delete a' });
      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
      // The second restore runs in a microtask after the commit has settled.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.queryByRole('button', { name: 'delete a' })).toBeNull();
      expect(document.body).not.toHaveFocus();
      expect(screen.getByRole('heading', { name: 'Page heading' })).toHaveFocus();
    });

    it('4. leaves focus alone when the host moved it elsewhere', () => {
      render(<Host withReturnRef />);
      openModal();
      const target = screen.getByRole('button', { name: 'return target' });
      target.focus();
      // Focus is outside the modal now; closing must not steal it back to the opener.
      closeViaHost();
      expect(target).toHaveFocus();
    });

    it('5. without any candidate (no heading) focus ends on body, nothing throws', () => {
      render(<Host withHeading={false} />);
      openModal();
      fireEvent.click(screen.getByRole('button', { name: 'remove opener' }));
      expect(() => closeViaHost()).not.toThrow();
      expect(document.body).toHaveFocus();
    });
  });

  describe('role, describedById and dismissible (#2209)', () => {
    afterEach(() => {
      delete document.documentElement.dataset.scrollLocked;
    });

    it('defaults to role "dialog"', () => {
      render(<Modal {...defaultProps}>body</Modal>);
      expect(screen.getByRole('dialog', { name: 'Test Modal Title' })).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('role="alertdialog" is announced as an alertdialog', () => {
      render(
        <Modal {...defaultProps} role="alertdialog">
          body
        </Modal>,
      );
      expect(screen.getByRole('alertdialog', { name: 'Test Modal Title' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('describedById points the dialog at the describing element', () => {
      render(
        <Modal {...defaultProps} describedById="desc-x">
          <p id="desc-x">Because reasons.</p>
        </Modal>,
      );
      expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Because reasons.');
    });

    it('has no aria-describedby by default', () => {
      render(<Modal {...defaultProps}>body</Modal>);
      expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
    });

    it('dismissible=false: Escape, the backdrop and the close button do nothing', () => {
      const onClose = jest.fn<() => void>();
      const { baseElement } = render(
        <Modal title="Busy" onClose={onClose} dismissible={false}>
          body
        </Modal>,
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(baseElement.querySelector('[class*="modalBackdrop"]')!);
      const close = screen.getByRole('button', { name: 'Close dialog' });
      fireEvent.click(close);
      expect(onClose).not.toHaveBeenCalled();
      // aria-disabled (not disabled) so keyboard focus is not lost
      expect(close).toHaveAttribute('aria-disabled', 'true');
      expect(close).not.toBeDisabled();
    });

    it('dismissible (default): the close button is not aria-disabled and closes', () => {
      const onClose = jest.fn<() => void>();
      render(
        <Modal title="Open" onClose={onClose}>
          body
        </Modal>,
      );
      const close = screen.getByRole('button', { name: 'Close dialog' });
      expect(close).not.toHaveAttribute('aria-disabled');
      fireEvent.click(close);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('becoming dismissible again re-enables closing', () => {
      const onClose = jest.fn<() => void>();
      const { rerender } = render(
        <Modal title="T" onClose={onClose} dismissible={false}>
          body
        </Modal>,
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      rerender(
        <Modal title="T" onClose={onClose} dismissible>
          body
        </Modal>,
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ref-counted scroll lock (nested Modal and Sheet)', () => {
    afterEach(() => {
      delete document.documentElement.dataset.scrollLocked;
    });

    const locked = () => document.documentElement.dataset.scrollLocked;

    it('locks page scroll while a Modal is mounted and unlocks on unmount', () => {
      const { unmount } = render(<Modal {...defaultProps}>body</Modal>);
      expect(locked()).toBe('true');
      unmount();
      expect(locked()).toBeUndefined();
    });

    it('stays locked until the last of two nested Modals closes', () => {
      function Nested({ inner }: { inner: boolean }) {
        return (
          <Modal title="Outer" onClose={() => {}}>
            outer
            {inner && (
              <Modal title="Inner" onClose={() => {}}>
                inner
              </Modal>
            )}
          </Modal>
        );
      }
      const { rerender, unmount } = render(<Nested inner />);
      expect(locked()).toBe('true');
      rerender(<Nested inner={false} />);
      expect(locked()).toBe('true');
      unmount();
      expect(locked()).toBeUndefined();
    });

    it('a Modal opened over an open Sheet does not release the sheet lock when it closes', () => {
      const returnRef = { current: null } as React.RefObject<HTMLElement | null>;
      function Both({ modal }: { modal: boolean }) {
        return (
          <>
            <Sheet id="s" open onClose={() => {}} title="Sheet" returnFocusRef={returnRef}>
              body
            </Sheet>
            {modal && (
              <Modal title="M" onClose={() => {}}>
                over
              </Modal>
            )}
          </>
        );
      }
      const { rerender } = render(<Both modal />);
      expect(locked()).toBe('true');
      rerender(<Both modal={false} />);
      expect(locked()).toBe('true');
    });
  });
});

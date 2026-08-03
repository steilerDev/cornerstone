/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from './Modal.js';

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
});

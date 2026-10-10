/**
 * @jest-environment jsdom
 *
 * Unit tests for Toast.tsx — ToastList component rendering.
 * Tests all 3 variants (success, info, error), accessibility attributes,
 * close button behavior, and portal rendering.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext.js';
import { ToastList } from './Toast.js';
import type { ToastVariant } from './ToastContext.js';

// ---------------------------------------------------------------------------
// Helper: render ToastList with a live ToastProvider
// ---------------------------------------------------------------------------

function TestApp() {
  const { showToast } = useToast();
  return (
    <div>
      <ToastList />
      <button data-testid="show-success" onClick={() => showToast('success', 'File saved')}>
        Show Success
      </button>
      <button data-testid="show-info" onClick={() => showToast('info', 'Loading data')}>
        Show Info
      </button>
      <button data-testid="show-error" onClick={() => showToast('error', 'Save failed')}>
        Show Error
      </button>
    </div>
  );
}

function renderApp() {
  return render(
    <ToastProvider>
      <TestApp />
    </ToastProvider>,
  );
}

// ---------------------------------------------------------------------------
// Rendering — empty state
// ---------------------------------------------------------------------------

describe('ToastList', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('empty state', () => {
    it('renders the two live regions but no toast when there are none', () => {
      renderApp();
      expect(document.querySelector('[role="status"]')).toBeInTheDocument();
      expect(document.querySelector('[aria-live="assertive"]')).toBeInTheDocument();
      expect(document.querySelector('[data-toast-id]')).toBeNull();
    });

    it('does not throw when rendered with no toasts', () => {
      expect(() => renderApp()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Rendering — with toasts
  // ---------------------------------------------------------------------------

  describe('with toasts', () => {
    it('renders a container element when a toast is shown', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(document.querySelector('[role="status"]')).toBeInTheDocument();
    });

    it('renders the success toast with correct data-testid', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-success')).toBeInTheDocument();
    });

    it('renders the info toast with correct data-testid', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-info'));
      });
      expect(screen.getByTestId('toast-info')).toBeInTheDocument();
    });

    it('renders the error toast with correct data-testid', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-error'));
      });
      expect(screen.getByTestId('toast-error')).toBeInTheDocument();
    });

    it('renders the toast message text', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByText('File saved')).toBeInTheDocument();
    });

    it('renders the info toast message text', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-info'));
      });
      expect(screen.getByText('Loading data')).toBeInTheDocument();
    });

    it('renders the error toast message text', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-error'));
      });
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });

    it('renders multiple toasts simultaneously', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
        fireEvent.click(screen.getByTestId('show-info'));
        fireEvent.click(screen.getByTestId('show-error'));
      });

      expect(screen.getByTestId('toast-success')).toBeInTheDocument();
      expect(screen.getByTestId('toast-info')).toBeInTheDocument();
      expect(screen.getByTestId('toast-error')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Accessibility attributes
  // ---------------------------------------------------------------------------

  describe('accessibility', () => {
    it('container has role="status"', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(document.querySelector('[role="status"]')).toBeInTheDocument();
    });

    it('errors go to the assertive region, which carries no role', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-error'));
      });
      const assertive = document.querySelector('[aria-live="assertive"]')!;
      expect(assertive).not.toHaveAttribute('role');
      expect(assertive).toContainElement(screen.getByTestId('toast-error'));
    });

    it('success toasts live in the polite status region', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByRole('status')).toContainElement(screen.getByTestId('toast-success'));
    });

    it('individual toasts carry no role', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-success')).not.toHaveAttribute('role');
    });

    it('dismiss button has accessible aria-label', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      const dismissBtn = screen.getByRole('button', { name: /dismiss notification/i });
      expect(dismissBtn).toBeInTheDocument();
    });

    it('dismiss button has type="button" (prevents form submission)', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      const dismissBtn = screen.getByRole('button', { name: /dismiss notification/i });
      expect(dismissBtn).toHaveAttribute('type', 'button');
    });
  });

  // ---------------------------------------------------------------------------
  // Close button interaction
  // ---------------------------------------------------------------------------

  describe('close button', () => {
    it('removes the toast when close button is clicked', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-success')).toBeInTheDocument();

      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }));
      });
      expect(screen.queryByTestId('toast-success')).not.toBeInTheDocument();
    });

    it('removes the toast but keeps the live regions when the last toast is dismissed', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }));
      });

      expect(screen.queryByTestId('toast-success')).toBeNull();
      expect(document.querySelector('[role="status"]')).toBeInTheDocument();
    });

    it('removes only the dismissed toast when multiple are visible', () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
        fireEvent.click(screen.getByTestId('show-info'));
      });

      const dismissButtons = screen.getAllByRole('button', { name: /dismiss notification/i });
      // Click the first dismiss button (success toast)
      act(() => {
        fireEvent.click(dismissButtons[0]!);
      });

      expect(screen.queryByTestId('toast-success')).not.toBeInTheDocument();
      expect(screen.getByTestId('toast-info')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Portal rendering
  // ---------------------------------------------------------------------------

  describe('portal rendering', () => {
    it('renders into document.body (portal)', () => {
      const { container } = renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });

      // The toast container should be in document.body
      const toastContainer = document.querySelector('[role="status"]');
      expect(toastContainer).toBeInTheDocument();
      // In jsdom, createPortal renders to document.body; the component tree container
      // should NOT contain it
      expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-dismiss integration
  // ---------------------------------------------------------------------------

  describe('auto-dismiss integration', () => {
    it('toast disappears automatically after its dismiss duration', async () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-success')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('toast-success')).not.toBeInTheDocument();
      });
    });

    it('error toast disappears automatically after 6 seconds', async () => {
      renderApp();
      act(() => {
        fireEvent.click(screen.getByTestId('show-error'));
      });

      act(() => {
        jest.advanceTimersByTime(6000);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('toast-error')).not.toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Variant icons
  // ---------------------------------------------------------------------------

  describe('variant icons', () => {
    const variants: { testId: string; clickId: string }[] = [
      { testId: 'toast-success', clickId: 'show-success' },
      { testId: 'toast-info', clickId: 'show-info' },
      { testId: 'toast-error', clickId: 'show-error' },
    ];

    variants.forEach(({ testId, clickId }) => {
      it(`${testId.replace('toast-', '')} variant renders an SVG icon`, () => {
        renderApp();
        act(() => {
          fireEvent.click(screen.getByTestId(clickId));
        });
        const toast = screen.getByTestId(testId);
        // Each variant renders an SVG icon in the toast
        expect(toast.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // All 3 variants: data-testid contract
  // ---------------------------------------------------------------------------

  describe('data-testid contract', () => {
    const variants: Exclude<ToastVariant, 'undo'>[] = ['success', 'info', 'error'];

    variants.forEach((variant) => {
      it(`toast-${variant} data-testid is set on the correct variant`, () => {
        function SingleApp() {
          const { showToast } = useToast();
          return (
            <div>
              <ToastList />
              <button
                data-testid="trigger"
                onClick={() => showToast(variant, `${variant} message`)}
              >
                Trigger
              </button>
            </div>
          );
        }

        render(
          <ToastProvider>
            <SingleApp />
          </ToastProvider>,
        );

        act(() => {
          fireEvent.click(screen.getByTestId('trigger'));
        });

        expect(screen.getByTestId(`toast-${variant}`)).toBeInTheDocument();
      });
    });
  });
});

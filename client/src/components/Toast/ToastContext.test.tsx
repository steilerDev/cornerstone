/**
 * @jest-environment jsdom
 *
 * Unit tests for ToastContext — toast state management (showToast, dismissToast,
 * auto-dismiss behavior, MAX_TOASTS cap).
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from './ToastContext.js';
import type { ToastVariant } from './ToastContext.js';

// ---------------------------------------------------------------------------
// Helper: TestConsumer renders the toast state as accessible text
// ---------------------------------------------------------------------------

function TestConsumer() {
  const { toasts, showToast, dismissToast } = useToast();
  return (
    <div>
      <div data-testid="toast-count">{toasts.length}</div>
      <div data-testid="toast-list">
        {toasts.map((t) => (
          <div key={t.id} data-testid={`toast-item-${t.id}`}>
            <span data-testid={`toast-variant-${t.id}`}>{t.variant}</span>
            <span data-testid={`toast-message-${t.id}`}>{t.message}</span>
            <button data-testid={`dismiss-${t.id}`} onClick={() => dismissToast(t.id)}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
      <button data-testid="show-success" onClick={() => showToast('success', 'Success message')}>
        Show Success
      </button>
      <button data-testid="show-info" onClick={() => showToast('info', 'Info message')}>
        Show Info
      </button>
      <button data-testid="show-error" onClick={() => showToast('error', 'Error message')}>
        Show Error
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests — non-timer tests (no fake timers needed)
// ---------------------------------------------------------------------------

describe('ToastProvider', () => {
  describe('initial state', () => {
    it('starts with zero toasts', () => {
      renderWithProvider();
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });
  });

  describe('showToast', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('adds a toast when showToast is called', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    });

    it('adds a toast with the correct variant — success', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-variant-0')).toHaveTextContent('success');
    });

    it('adds a toast with the correct variant — info', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-info'));
      });
      expect(screen.getByTestId('toast-variant-0')).toHaveTextContent('info');
    });

    it('adds a toast with the correct variant — error', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-error'));
      });
      expect(screen.getByTestId('toast-variant-0')).toHaveTextContent('error');
    });

    it('adds a toast with the correct message', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-message-0')).toHaveTextContent('Success message');
    });

    it('adds multiple toasts sequentially', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
        fireEvent.click(screen.getByTestId('show-info'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
    });

    it('assigns unique IDs to each toast', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
        fireEvent.click(screen.getByTestId('show-info'));
      });
      // First toast gets id=0, second gets id=1
      expect(screen.getByTestId('toast-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('toast-item-1')).toBeInTheDocument();
    });

    it('caps visible toasts at 3 (MAX_TOASTS)', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
        fireEvent.click(screen.getByTestId('show-info'));
        fireEvent.click(screen.getByTestId('show-error'));
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('3');
    });

    it('keeps the last 3 toasts when more than MAX_TOASTS are added', () => {
      renderWithProvider();
      act(() => {
        // Add 4 toasts — ids 0,1,2,3
        fireEvent.click(screen.getByTestId('show-success')); // id=0
        fireEvent.click(screen.getByTestId('show-info')); // id=1
        fireEvent.click(screen.getByTestId('show-error')); // id=2
        fireEvent.click(screen.getByTestId('show-success')); // id=3
      });
      // Should keep ids 1,2,3 (the last 3)
      expect(screen.queryByTestId('toast-item-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('toast-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('toast-item-3')).toBeInTheDocument();
    });
  });

  describe('dismissToast', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('removes a toast when dismissToast is called', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      act(() => {
        fireEvent.click(screen.getByTestId('dismiss-0'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('removes the correct toast when multiple exist', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success')); // id=0
        fireEvent.click(screen.getByTestId('show-info')); // id=1
        fireEvent.click(screen.getByTestId('show-error')); // id=2
      });

      // Dismiss the middle one (id=1)
      act(() => {
        fireEvent.click(screen.getByTestId('dismiss-1'));
      });

      expect(screen.getByTestId('toast-count')).toHaveTextContent('2');
      expect(screen.queryByTestId('toast-item-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('toast-item-0')).toBeInTheDocument();
      expect(screen.getByTestId('toast-item-2')).toBeInTheDocument();
    });
  });

  describe('auto-dismiss', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('dismisses a success toast after 4 seconds', async () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('dismisses an info toast after 6 seconds', async () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-info'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      act(() => {
        jest.advanceTimersByTime(6000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('dismisses an error toast after 6 seconds', async () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-error'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      act(() => {
        jest.advanceTimersByTime(6000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });

    it('does not dismiss a success toast before 4 seconds', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });

      act(() => {
        jest.advanceTimersByTime(3999);
      });

      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    });

    it('does not dismiss an info toast before 6 seconds', () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-info'));
      });

      act(() => {
        jest.advanceTimersByTime(5999);
      });

      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');
    });

    it('cancels auto-dismiss timer when toast is manually dismissed', async () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success'));
      });

      // Dismiss manually before auto-dismiss fires
      act(() => {
        fireEvent.click(screen.getByTestId('dismiss-0'));
      });
      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');

      // Advance past auto-dismiss time — should not throw or re-add the toast
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
    });

    it('each toast has its own independent auto-dismiss timer', async () => {
      renderWithProvider();
      act(() => {
        fireEvent.click(screen.getByTestId('show-success')); // id=0 - 4s timer
        fireEvent.click(screen.getByTestId('show-info')); // id=1 - 6s timer
      });

      // After 4 seconds: success should be dismissed, info should remain
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('toast-item-0')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('toast-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('toast-count')).toHaveTextContent('1');

      // After 6 seconds total: info should also be dismissed
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-count')).toHaveTextContent('0');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// useToast hook — error when called outside provider
// ---------------------------------------------------------------------------

describe('useToast', () => {
  it('throws an error when used outside ToastProvider', () => {
    function ComponentWithoutProvider() {
      try {
        useToast();
        return <div>No error</div>;
      } catch (err) {
        return <div data-testid="error">{err instanceof Error ? err.message : 'Error'}</div>;
      }
    }

    render(<ComponentWithoutProvider />);
    expect(screen.getByTestId('error')).toHaveTextContent(
      'useToast must be used within a ToastProvider',
    );
  });

  it('returns toasts array from context', () => {
    function Consumer() {
      const { toasts } = useToast();
      return <div data-testid="count">{toasts.length}</div>;
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('returns showToast function from context', () => {
    function Consumer() {
      const { showToast } = useToast();
      return <div data-testid="has-fn">{typeof showToast === 'function' ? 'yes' : 'no'}</div>;
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    expect(screen.getByTestId('has-fn')).toHaveTextContent('yes');
  });

  it('returns dismissToast function from context', () => {
    function Consumer() {
      const { dismissToast } = useToast();
      return <div data-testid="has-fn">{typeof dismissToast === 'function' ? 'yes' : 'no'}</div>;
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    expect(screen.getByTestId('has-fn')).toHaveTextContent('yes');
  });
});

// ---------------------------------------------------------------------------
// showToast with all variant types (TypeScript contract)
// ---------------------------------------------------------------------------

describe('ToastVariant coverage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const variants: ToastVariant[] = ['success', 'info', 'error'];

  variants.forEach((variant) => {
    it(`accepts variant "${variant}" without error`, () => {
      function VariantConsumer() {
        const { toasts, showToast } = useToast();
        return (
          <div>
            <div data-testid="count">{toasts.length}</div>
            <button
              data-testid={`show-${variant}`}
              onClick={() => showToast(variant, `${variant} toast`)}
            >
              Show
            </button>
          </div>
        );
      }

      render(
        <ToastProvider>
          <VariantConsumer />
        </ToastProvider>,
      );

      act(() => {
        fireEvent.click(screen.getByTestId(`show-${variant}`));
      });

      expect(screen.getByTestId('count')).toHaveTextContent('1');
    });
  });
});

// ---------------------------------------------------------------------------
// Multiple instances of ToastProvider
// ---------------------------------------------------------------------------

describe('nested ToastProvider isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('inner provider toasts do not affect outer provider toasts', () => {
    function OuterConsumer() {
      const { toasts, showToast } = useToast();
      return (
        <div>
          <div data-testid="outer-count">{toasts.length}</div>
          <button data-testid="show-outer" onClick={() => showToast('success', 'Outer toast')}>
            Show Outer
          </button>
        </div>
      );
    }

    function InnerConsumer() {
      const { toasts, showToast } = useToast();
      return (
        <div>
          <div data-testid="inner-count">{toasts.length}</div>
          <button data-testid="show-inner" onClick={() => showToast('info', 'Inner toast')}>
            Show Inner
          </button>
        </div>
      );
    }

    render(
      <ToastProvider>
        <OuterConsumer />
        <ToastProvider>
          <InnerConsumer />
        </ToastProvider>
      </ToastProvider>,
    );

    act(() => {
      fireEvent.click(screen.getByTestId('show-outer'));
    });
    expect(screen.getByTestId('outer-count')).toHaveTextContent('1');
    expect(screen.getByTestId('inner-count')).toHaveTextContent('0');

    act(() => {
      fireEvent.click(screen.getByTestId('show-inner'));
    });
    expect(screen.getByTestId('outer-count')).toHaveTextContent('1');
    expect(screen.getByTestId('inner-count')).toHaveTextContent('1');
  });
});

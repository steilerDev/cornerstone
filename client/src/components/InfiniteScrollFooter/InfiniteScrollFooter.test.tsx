/**
 * @jest-environment jsdom
 *
 * Unit tests for InfiniteScrollFooter (Issue #2060 — Diary infinite-scroll rework).
 *
 * The component takes plain string label/message props (no useTranslation of its own —
 * callers translate and pass the resolved strings), so no i18n bootstrap is needed here.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfiniteScrollFooter } from './InfiniteScrollFooter.js';
import styles from './InfiniteScrollFooter.module.css';
import type { InfiniteScrollFooterProps } from './InfiniteScrollFooter.js';

const LABELS = {
  loadingLabel: 'Loading more entries…',
  loadingAriaLabel: 'Loading more diary entries',
  loadMoreLabel: 'Load more',
  retryLabel: 'Retry',
  errorMessage: 'Failed to load more entries.',
  endOfListMessage: "You've reached the end — no more entries to load.",
};

function renderFooter(overrides: Partial<InfiniteScrollFooterProps> = {}) {
  const onLoadMore = jest.fn();
  const onRetry = jest.fn();
  const sentinelRef = jest.fn();
  const props: InfiniteScrollFooterProps = {
    status: 'idle',
    ...LABELS,
    sentinelRef,
    onLoadMore,
    onRetry,
    ...overrides,
  };
  const view = render(<InfiniteScrollFooter {...props} />);
  return { ...view, onLoadMore, onRetry, sentinelRef };
}

describe('InfiniteScrollFooter', () => {
  // ─── idle ────────────────────────────────────────────────────────────────────

  it('idle: renders the sentinel (aria-hidden), and an enabled button labeled "Load more"', () => {
    renderFooter({ status: 'idle' });

    const sentinel = screen.getByTestId('infinite-scroll-sentinel');
    expect(sentinel).toBeInTheDocument();
    expect(sentinel).toHaveAttribute('aria-hidden', 'true');

    const button = screen.getByTestId('infinite-scroll-load-more-button');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Load more');
  });

  it('idle: clicking the button calls onLoadMore, not onRetry', async () => {
    const user = userEvent.setup();
    const { onLoadMore, onRetry } = renderFooter({ status: 'idle' });

    await user.click(screen.getByTestId('infinite-scroll-load-more-button'));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  // ─── loading ─────────────────────────────────────────────────────────────────

  it('loading: the button is aria-disabled (not natively disabled, so focus is kept) and shows a spinner + loadingLabel inside it, with no separate status row', () => {
    renderFooter({ status: 'loading' });

    const button = screen.getByTestId('infinite-scroll-load-more-button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveTextContent('Loading more entries…');

    // Exactly one occurrence of the loading copy — the standalone status row
    // (duplicated rendering) was removed; only the button's own label remains.
    expect(screen.getAllByText('Loading more entries…')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Loading more diary entries' })).toBeInTheDocument();
  });

  it('loading: clicking the button calls neither onLoadMore nor onRetry', async () => {
    const user = userEvent.setup();
    const { onLoadMore, onRetry } = renderFooter({ status: 'loading' });

    await user.click(screen.getByTestId('infinite-scroll-load-more-button'));

    expect(onLoadMore).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('idle and error: the button has no aria-disabled attribute', () => {
    const view = renderFooter({ status: 'idle' });
    expect(screen.getByTestId('infinite-scroll-load-more-button')).not.toHaveAttribute(
      'aria-disabled',
    );
    view.rerender(
      <InfiniteScrollFooter
        status="error"
        {...LABELS}
        sentinelRef={view.sentinelRef}
        onLoadMore={view.onLoadMore}
        onRetry={view.onRetry}
      />,
    );
    expect(screen.getByTestId('infinite-scroll-load-more-button')).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  // ─── focus handoff ───────────────────────────────────────────────────────────

  describe('focus handoff', () => {
    function rerenderWith(
      view: ReturnType<typeof renderFooter>,
      status: InfiniteScrollFooterProps['status'],
    ) {
      view.rerender(
        <InfiniteScrollFooter
          status={status}
          {...LABELS}
          sentinelRef={view.sentinelRef}
          onLoadMore={view.onLoadMore}
          onRetry={view.onRetry}
        />,
      );
    }

    it('a focused button stays focused while status flips idle -> loading (aria-disabled, not disabled)', () => {
      const view = renderFooter({ status: 'idle' });
      const button = screen.getByTestId('infinite-scroll-load-more-button');
      act(() => button.focus());
      expect(button).toHaveFocus();

      rerenderWith(view, 'loading');

      expect(screen.getByTestId('infinite-scroll-load-more-button')).toHaveFocus();
    });

    it('moves focus to the end-of-list element (tabIndex=-1) when the focused button unmounts on done', () => {
      const view = renderFooter({ status: 'idle' });
      act(() => screen.getByTestId('infinite-scroll-load-more-button').focus());

      rerenderWith(view, 'done');

      const end = screen.getByTestId('infinite-scroll-end-of-list');
      expect(end).toHaveAttribute('tabindex', '-1');
      expect(end).toHaveFocus();
    });

    it('does not steal focus when the button was not focused', () => {
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      const view = renderFooter({ status: 'idle' });
      outside.focus();

      rerenderWith(view, 'done');

      expect(outside).toHaveFocus();
      expect(screen.getByTestId('infinite-scroll-end-of-list')).not.toHaveFocus();
      outside.remove();
    });

    it('does not steal focus after the button was blurred', () => {
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      const view = renderFooter({ status: 'idle' });
      act(() => screen.getByTestId('infinite-scroll-load-more-button').focus());
      act(() => outside.focus());

      rerenderWith(view, 'done');

      expect(outside).toHaveFocus();
      outside.remove();
    });
  });

  // ─── error ───────────────────────────────────────────────────────────────────

  it('error: renders a FormError banner with role="alert" and the exact error copy', () => {
    renderFooter({ status: 'error' });

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Failed to load more entries.');
  });

  it('error: the button is enabled and labeled "Retry"', () => {
    renderFooter({ status: 'error' });

    const button = screen.getByTestId('infinite-scroll-load-more-button');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Retry');
  });

  it('error: clicking the button calls onRetry, not onLoadMore', async () => {
    const user = userEvent.setup();
    const { onLoadMore, onRetry } = renderFooter({ status: 'error' });

    await user.click(screen.getByTestId('infinite-scroll-load-more-button'));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  // ─── done ────────────────────────────────────────────────────────────────────

  it('done: the button is absent', () => {
    renderFooter({ status: 'done' });

    expect(screen.queryByTestId('infinite-scroll-load-more-button')).not.toBeInTheDocument();
  });

  it('done: renders the end-of-list row with the exact copy and testid', () => {
    renderFooter({ status: 'done' });

    const endOfList = screen.getByTestId('infinite-scroll-end-of-list');
    expect(endOfList).toHaveTextContent("You've reached the end — no more entries to load.");
  });

  // ─── sentinel styling ────────────────────────────────────────────────────────

  it('the sentinel div has zero width/height via its CSS module class', () => {
    renderFooter({ status: 'idle' });

    expect(screen.getByTestId('infinite-scroll-sentinel')).toHaveClass(styles.sentinel!);
  });

  // ─── testIdPrefix ────────────────────────────────────────────────────────────

  describe('testIdPrefix', () => {
    it('defaults to "infinite-scroll" when omitted', () => {
      renderFooter({ status: 'idle' });

      expect(screen.getByTestId('infinite-scroll-footer')).toBeInTheDocument();
      expect(screen.getByTestId('infinite-scroll-sentinel')).toBeInTheDocument();
      expect(screen.getByTestId('infinite-scroll-load-more-button')).toBeInTheDocument();

      renderFooter({ status: 'done' });
      expect(screen.getByTestId('infinite-scroll-end-of-list')).toBeInTheDocument();
    });

    it('applies a custom prefix to all four testids, proving the component is reusable by a second consumer', () => {
      renderFooter({ status: 'idle', testIdPrefix: 'widget' });

      expect(screen.getByTestId('widget-footer')).toBeInTheDocument();
      expect(screen.getByTestId('widget-sentinel')).toBeInTheDocument();
      expect(screen.getByTestId('widget-load-more-button')).toBeInTheDocument();
      expect(screen.queryByTestId('infinite-scroll-footer')).not.toBeInTheDocument();

      renderFooter({ status: 'done', testIdPrefix: 'widget' });
      expect(screen.getByTestId('widget-end-of-list')).toBeInTheDocument();
    });
  });
});

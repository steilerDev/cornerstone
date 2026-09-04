/**
 * @jest-environment jsdom
 *
 * Unit tests for InfiniteScrollFooter (Issue #2060 — Diary infinite-scroll rework).
 *
 * Real i18n is initialized (via import of app i18n setup) so useTranslation() resolves
 * actual copy from client/src/i18n/en/diary.json, matching the established pattern in
 * PhotoUpload.test.tsx.
 */
import { jest, describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../i18n/index.js';
import { InfiniteScrollFooter } from './InfiniteScrollFooter.js';
import styles from './InfiniteScrollFooter.module.css';
import type { InfiniteScrollFooterProps } from './InfiniteScrollFooter.js';

function renderFooter(overrides: Partial<InfiniteScrollFooterProps> = {}) {
  const onLoadMore = jest.fn();
  const onRetry = jest.fn();
  const sentinelRef = jest.fn();
  const props: InfiniteScrollFooterProps = {
    status: 'idle',
    hasMore: true,
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

    const button = screen.getByTestId('diary-load-more-button');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Load more');
  });

  it('idle: clicking the button calls onLoadMore, not onRetry', async () => {
    const user = userEvent.setup();
    const { onLoadMore, onRetry } = renderFooter({ status: 'idle' });

    await user.click(screen.getByTestId('diary-load-more-button'));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  // ─── loading ─────────────────────────────────────────────────────────────────

  it('loading: the button is disabled and shows a spinner + "Loading more entries…" inside it', () => {
    renderFooter({ status: 'loading' });

    const button = screen.getByTestId('diary-load-more-button');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Loading more entries…');
  });

  it('loading: a separate status row also renders a spinner + "Loading more entries…"', () => {
    renderFooter({ status: 'loading' });

    // Two occurrences of the loading copy: one inside the button, one in the status row.
    expect(screen.getAllByText('Loading more entries…')).toHaveLength(2);
    // The status-row spinner carries the dedicated aria-label; the button's spinner
    // uses the Spinner default label ("Loading").
    expect(screen.getByRole('img', { name: 'Loading more diary entries' })).toBeInTheDocument();
  });

  // ─── error ───────────────────────────────────────────────────────────────────

  it('error: renders a FormError banner with role="alert" and the exact error copy', () => {
    renderFooter({ status: 'error' });

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Failed to load more entries.');
  });

  it('error: the button is enabled and labeled "Retry"', () => {
    renderFooter({ status: 'error' });

    const button = screen.getByTestId('diary-load-more-button');
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Retry');
  });

  it('error: clicking the button calls onRetry, not onLoadMore', async () => {
    const user = userEvent.setup();
    const { onLoadMore, onRetry } = renderFooter({ status: 'error' });

    await user.click(screen.getByTestId('diary-load-more-button'));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  // ─── done ────────────────────────────────────────────────────────────────────

  it('done: the button is absent', () => {
    renderFooter({ status: 'done', hasMore: false });

    expect(screen.queryByTestId('diary-load-more-button')).not.toBeInTheDocument();
  });

  it('done: renders the end-of-list row with the exact copy and testid', () => {
    renderFooter({ status: 'done', hasMore: false });

    const endOfList = screen.getByTestId('diary-end-of-list');
    expect(endOfList).toHaveTextContent("You've reached the end — no more entries to load.");
  });

  // ─── sentinel styling ────────────────────────────────────────────────────────

  it('the sentinel div has zero width/height via its CSS module class', () => {
    renderFooter({ status: 'idle' });

    expect(screen.getByTestId('infinite-scroll-sentinel')).toHaveClass(styles.sentinel!);
  });
});

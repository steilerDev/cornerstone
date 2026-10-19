import { describe, it, expect, afterEach, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CaptureItem, CaptureUploadsApi } from '../../../capture/captureTypes.js';
import { CaptureUploadsContext } from '../../../capture/captureUploadsContext.js';
import { PhotosWaitingNotice } from './PhotosWaitingNotice.js';

function item(id: string, overrides: Partial<CaptureItem> = {}): CaptureItem {
  return {
    id,
    draftId: 'd1',
    source: 'camera',
    name: `${id}.jpg`,
    previewUrl: `blob:${id}`,
    state: 'waiting',
    progress: null,
    persisted: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    areaId: null,
    orientationId: null,
    ...overrides,
  } as CaptureItem;
}

function renderNotice(
  items: readonly CaptureItem[],
  props: Partial<React.ComponentProps<typeof PhotosWaitingNotice>> = {},
) {
  const retry = jest.fn();
  const api = { items, retry } as unknown as CaptureUploadsApi;
  const view = render(
    <CaptureUploadsContext value={api}>
      <PhotosWaitingNotice draftId="d1" {...props} />
    </CaptureUploadsContext>,
  );
  return { retry, ...view };
}

describe('PhotosWaitingNotice', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  afterEach(() => {
    if (originalOnLine) Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    else delete (window.navigator as unknown as Record<string, unknown>).onLine;
  });

  function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  }

  it('renders nothing without a provider', () => {
    const { container } = render(<PhotosWaitingNotice draftId="d1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no item belongs to the draft', () => {
    const { container } = renderNotice([
      item('a', { draftId: 'other' }),
      item('b', { draftId: null }),
    ]);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty queue', () => {
    const { container } = renderNotice([]);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [1, '1 photo waiting to upload'],
    [3, '3 photos waiting to upload'],
  ])('counts only this draft: %i -> "%s"', (count, text) => {
    const items = Array.from({ length: count }, (_, i) => item(`m${i}`));
    renderNotice([...items, item('x', { draftId: 'other' })]);
    expect(screen.getByTestId('photos-waiting-notice-count')).toHaveTextContent(text);
  });

  it('shows no Retry, signed or no-room text for healthy waiting items while online', () => {
    setOnline(true);
    renderNotice([item('a'), item('b', { state: 'waiting' })]);
    expect(screen.queryByRole('button', { name: 'Retry now' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('photos-waiting-notice-signed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photos-waiting-notice-no-room')).not.toBeInTheDocument();
  });

  it('offers Retry now when an item failed and calls retry with the draft id', async () => {
    const { retry } = renderNotice([item('a'), item('b', { state: 'failed' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledWith('d1');
  });

  it('offers Retry now while offline even when nothing failed, and follows online events', () => {
    setOnline(false);
    renderNotice([item('a')]);
    expect(screen.getByTestId('photos-waiting-notice-retry')).toBeInTheDocument();

    setOnline(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByTestId('photos-waiting-notice-retry')).not.toBeInTheDocument();

    setOnline(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByTestId('photos-waiting-notice-retry')).toBeInTheDocument();
  });

  it('explains blocked photos on a signed entry', () => {
    renderNotice([item('a', { state: 'blocked' })]);
    expect(screen.getByTestId('photos-waiting-notice-signed')).toHaveTextContent(
      "Some photos can't be added because the entry is signed.",
    );
  });

  it('warns when a photo is only kept in memory', () => {
    renderNotice([item('a'), item('b', { persisted: false })]);
    expect(screen.getByTestId('photos-waiting-notice-no-room')).toHaveTextContent(
      'This device has no room to keep photos.',
    );
  });

  it('uses a custom testId for the root and every part', () => {
    renderNotice([item('a', { state: 'failed', persisted: false })], { testId: 'entry-waiting' });
    expect(screen.getByTestId('entry-waiting')).toBeInTheDocument();
    expect(screen.getByTestId('entry-waiting-count')).toBeInTheDocument();
    expect(screen.getByTestId('entry-waiting-retry')).toBeInTheDocument();
    expect(screen.getByTestId('entry-waiting-no-room')).toBeInTheDocument();
    expect(screen.queryByTestId('photos-waiting-notice')).not.toBeInTheDocument();
  });

  it('is static text: no live region of its own', () => {
    const { container } = renderNotice([item('a')]);
    expect(container.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });
});

import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { createRef } from 'react';
import type { RefObject } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AreaSummary, OrientationSummary, PhotoSpotPhoto } from '@cornerstone/shared';
import type { SpotViewer as SpotViewerType, SpotViewerProps } from './SpotViewer.js';
import { makeSpotPhoto, makeLocaleContextMock } from '../../test/photoSpotFixtures.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let SpotViewer: typeof SpotViewerType;

beforeAll(async () => {
  ({ SpotViewer } = await import('./SpotViewer.js'));
});

// Newest first
const PHOTOS: PhotoSpotPhoto[] = [
  makeSpotPhoto('p0', {
    caption: 'Fresh plaster',
    diaryEntry: { id: 'e0', entryType: 'daily_log', title: 'Plastering', entryDate: '2026-09-20' },
  }),
  makeSpotPhoto('p1', {
    caption: null,
    diaryEntry: { id: 'e1', entryType: 'issue', title: null, entryDate: '2026-09-11' },
  }),
  makeSpotPhoto('p2', {
    caption: '   ',
    diaryEntry: { id: 'e2', entryType: 'site_visit', title: 'Visit', entryDate: '2026-09-01' },
  }),
];

const AREA: AreaSummary = {
  id: 'a',
  name: 'Kitchen',
  color: '#336699',
  ancestors: [{ id: 'r', name: 'House', color: null }],
};
const ORIENTATION: OrientationSummary = { id: 'o', name: 'Ceiling', description: null };

function setup(overrides: Partial<SpotViewerProps> = {}) {
  const onSelect = jest.fn();
  const onBack = jest.fn();
  const headingRef = createRef<HTMLElement>() as RefObject<HTMLElement | null>;
  const props: SpotViewerProps = {
    photos: PHOTOS,
    index: 1,
    onSelect,
    onBack,
    backTo: '/photos',
    backState: { focusSpotId: 'a:o' },
    area: AREA,
    orientation: ORIENTATION,
    headingSlot: (
      <h1 ref={headingRef as RefObject<HTMLHeadingElement>} tabIndex={-1}>
        Kitchen, Ceiling
      </h1>
    ),
    headingRef,
    ...overrides,
  };
  const utils = render(
    <MemoryRouter>
      <SpotViewer {...props} />
    </MemoryRouter>,
  );
  const rerenderWith = (next: Partial<SpotViewerProps>) =>
    utils.rerender(
      <MemoryRouter>
        <SpotViewer {...props} {...next} />
      </MemoryRouter>,
    );
  return { onSelect, onBack, headingRef, rerenderWith, ...utils };
}

describe('SpotViewer navigation buttons', () => {
  it('disables Next at index 0 (latest) while Prev stays enabled and steps to the earlier photo', () => {
    const { onSelect } = setup({ index: 0 });

    expect(screen.getByTestId('spot-viewer-next')).toBeDisabled();
    expect(screen.getByTestId('spot-viewer-prev')).toBeEnabled();

    fireEvent.click(screen.getByTestId('spot-viewer-prev'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('disables Prev at the last index and Next steps to the later photo', () => {
    const { onSelect } = setup({ index: 2 });

    expect(screen.getByTestId('spot-viewer-prev')).toBeDisabled();
    expect(screen.getByTestId('spot-viewer-next')).toBeEnabled();

    fireEvent.click(screen.getByTestId('spot-viewer-next'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows "N of M" with 1 = newest', () => {
    setup({ index: 0 });
    expect(screen.getByTestId('spot-viewer-position')).toHaveTextContent('1 of 3');
  });

  it('disables both buttons for a single photo', () => {
    setup({ photos: [PHOTOS[0]!], index: 0 });
    expect(screen.getByTestId('spot-viewer-prev')).toBeDisabled();
    expect(screen.getByTestId('spot-viewer-next')).toBeDisabled();
  });
});

describe('SpotViewer keyboard', () => {
  it('ArrowLeft selects the earlier photo (index + 1)', () => {
    const { onSelect } = setup({ index: 1 });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('ArrowRight selects the later photo (index - 1)', () => {
    const { onSelect } = setup({ index: 1 });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('does nothing at the ends', () => {
    const latest = setup({ index: 0 });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(latest.onSelect).not.toHaveBeenCalled();
    latest.unmount();

    const earliest = setup({ index: 2 });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(earliest.onSelect).not.toHaveBeenCalled();
  });

  it('Escape calls onBack', () => {
    const { onBack } = setup();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['alt', { altKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
  ])('ignores keys pressed with the %s modifier', (_name, mod) => {
    const { onSelect, onBack } = setup({ index: 1 });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', ...mod });
    fireEvent.keyDown(document.body, { key: 'Escape', ...mod });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores already-handled keys (defaultPrevented)', () => {
    const { onSelect } = setup({ index: 1 });
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      cancelable: true,
      bubbles: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores keys while focus is in an input', () => {
    const { onSelect, onBack } = setup({
      index: 1,
      headingSlot: <input aria-label="note" data-testid="typing" />,
    });
    const input = screen.getByTestId('typing');
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores keys inside a contenteditable region', () => {
    const { onSelect } = setup({
      index: 1,
      headingSlot: (
        <div contentEditable suppressContentEditableWarning data-testid="editable">
          x
        </div>
      ),
    });
    const el = screen.getByTestId('editable');
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['select', <select key="s" aria-label="pick" data-testid="typing" />],
    ['textarea', <textarea key="t" aria-label="note" data-testid="typing" />],
  ])('ignores keys while focus is in a %s inside the viewer', (_name, control) => {
    const { onSelect, onBack } = setup({ index: 1, headingSlot: control });
    const el = screen.getByTestId('typing');
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    fireEvent.keyDown(el, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores keys from a child of a contenteditable region', () => {
    const { onSelect, onBack } = setup({
      index: 1,
      headingSlot: (
        <div contentEditable suppressContentEditableWarning>
          <span data-testid="editable-child">x</span>
        </div>
      ),
    });
    const child = screen.getByTestId('editable-child');
    fireEvent.keyDown(child, { key: 'ArrowLeft' });
    fireEvent.keyDown(child, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('handles keys from an explicitly non-editable element inside the viewer', () => {
    const { onSelect } = setup({
      index: 1,
      headingSlot: (
        <div contentEditable={false} data-testid="not-editable">
          x
        </div>
      ),
    });
    fireEvent.keyDown(screen.getByTestId('not-editable'), { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('ignores key events whose target is the document itself (not an element)', () => {
    const { onSelect, onBack } = setup({ index: 1 });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores ArrowLeft and Escape when focus is on a control outside the viewer', () => {
    const { onSelect, onBack } = setup({ index: 1 });
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      fireEvent.keyDown(outside, { key: 'ArrowLeft' });
      fireEvent.keyDown(outside, { key: 'Escape' });
      expect(onSelect).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    } finally {
      outside.remove();
    }
  });

  it('still handles keys when focus is on document.body', () => {
    const { onSelect, onBack } = setup({ index: 1 });
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('handles keys when focus is on a control inside the viewer', () => {
    const { onSelect } = setup({ index: 1 });
    const next = screen.getByTestId('spot-viewer-next');
    next.focus();
    fireEvent.keyDown(next, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('ignores unrelated keys', () => {
    const { onSelect, onBack } = setup();
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('removes the keydown listener on unmount', () => {
    const { onSelect, onBack, unmount } = setup({ index: 1 });
    unmount();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('SpotViewer image and details', () => {
  it('uses the caption as the image alt text', () => {
    setup({ index: 0 });
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute('alt', 'Fresh plaster');
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute('src', PHOTOS[0]!.fileUrl);
  });

  it('falls back to "area, orientation, date" alt text when there is no (or a blank) caption', () => {
    setup({ index: 1 });
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute(
      'alt',
      'House › Kitchen, Ceiling, September 11, 2026',
    );
  });

  it('substitutes "No area" / "No orientation" in the alt fallback', () => {
    setup({ index: 1, area: null, orientation: null });
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute(
      'alt',
      'No area, No orientation, September 11, 2026',
    );
  });

  it('shows the long diary date, area path, orientation and caption', () => {
    setup({ index: 0 });
    expect(screen.getByTestId('spot-viewer-date')).toHaveTextContent('September 20, 2026');
    expect(screen.getByTestId('spot-viewer-area')).toHaveTextContent('House › Kitchen');
    expect(screen.getByTestId('spot-viewer-orientation')).toHaveTextContent('Ceiling');
    expect(screen.getByTestId('spot-viewer-caption')).toHaveTextContent('Fresh plaster');
  });

  it('shows placeholders for missing area, orientation and caption', () => {
    setup({ index: 1, area: null, orientation: null });
    expect(screen.getByTestId('spot-viewer-area')).toHaveTextContent('No area');
    expect(screen.getByTestId('spot-viewer-orientation')).toHaveTextContent('No orientation');
    expect(screen.getByTestId('spot-viewer-caption')).toHaveTextContent('No caption');
  });

  it('omits the colour dot for an area without colour', () => {
    const { container } = setup({ index: 0, area: { ...AREA, color: null } });
    expect(container.querySelector('span[style*="--area-color"]')).toBeNull();
  });

  it('shows the colour dot for a coloured area', () => {
    const { container } = setup({ index: 0 });
    expect(container.querySelector('span[style*="--area-color"]')).not.toBeNull();
  });

  it('links to the diary entry and shows its title, or "Untitled entry"', () => {
    const first = setup({ index: 0 });
    expect(screen.getByTestId('spot-viewer-diary-link')).toHaveAttribute('href', '/diary/e0');
    expect(screen.getByText('Plastering')).toBeInTheDocument();
    first.unmount();

    setup({ index: 1 });
    expect(screen.getByTestId('spot-viewer-diary-link')).toHaveAttribute('href', '/diary/e1');
    expect(screen.getByText('Untitled entry')).toBeInTheDocument();
  });

  it('renders the back link with the supplied target', () => {
    setup();
    expect(screen.getByTestId('spot-viewer-back')).toHaveAttribute('href', '/photos');
  });

  it('announces the position and date through a status region', () => {
    setup({ index: 0 });
    expect(screen.getByRole('status')).toHaveTextContent('Photo 1 of 3, September 20, 2026');
  });

  it('shows the fallback instead of a broken image when the image fails to load', () => {
    setup({ index: 0 });
    fireEvent.error(screen.getByTestId('spot-viewer-image'));
    expect(screen.queryByTestId('spot-viewer-image')).not.toBeInTheDocument();
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
  });

  it('renders the history list with the current item marked', () => {
    setup({ index: 1 });
    expect(screen.getByTestId('spot-history-item-p1')).toHaveAttribute('aria-current', 'true');
  });

  it('selecting a history item calls onSelect with its index', () => {
    const { onSelect } = setup({ index: 0 });
    fireEvent.click(screen.getByTestId('spot-history-item-p2'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});

describe('SpotViewer focus hand-off', () => {
  it('moves focus from a Next button that becomes disabled to Prev (not document.body)', () => {
    const { rerenderWith } = setup({ index: 1 });
    const next = screen.getByTestId('spot-viewer-next');
    next.focus();
    expect(document.activeElement).toBe(next);

    rerenderWith({ index: 0 });

    expect(screen.getByTestId('spot-viewer-next')).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByTestId('spot-viewer-prev'));
  });

  it('moves focus from a Prev button that becomes disabled to Next', () => {
    const { rerenderWith } = setup({ index: 1 });
    const prev = screen.getByTestId('spot-viewer-prev');
    prev.focus();

    rerenderWith({ index: 2 });

    expect(document.activeElement).toBe(screen.getByTestId('spot-viewer-next'));
  });

  it('falls back to the heading when both buttons end up disabled (Next focused)', () => {
    const { rerenderWith, headingRef } = setup({ index: 1 });
    screen.getByTestId('spot-viewer-next').focus();

    rerenderWith({ photos: [PHOTOS[0]!], index: 0 });

    expect(document.activeElement).toBe(headingRef.current);
  });

  it('falls back to the heading when both buttons end up disabled (Prev focused)', () => {
    const { rerenderWith, headingRef } = setup({ index: 1 });
    screen.getByTestId('spot-viewer-prev').focus();

    rerenderWith({ photos: [PHOTOS[0]!], index: 0 });

    expect(document.activeElement).toBe(headingRef.current);
  });

  it('does not steal focus when nothing is focused', () => {
    const { rerenderWith } = setup({ index: 1 });
    expect(document.activeElement).toBe(document.body);

    rerenderWith({ index: 0 });

    expect(document.activeElement).toBe(document.body);
  });

  it('leaves focus alone when a non-nav control is focused and the index changes', () => {
    const { rerenderWith } = setup({ index: 1 });
    const link = screen.getByTestId('spot-viewer-diary-link');
    link.focus();

    rerenderWith({ index: 0 });

    expect(document.activeElement).toBe(link);
  });

  it('leaves focus alone when Prev is focused but the viewer is not at the earliest photo', () => {
    const { rerenderWith } = setup({ index: 0 });
    const prev = screen.getByTestId('spot-viewer-prev');
    prev.focus();

    rerenderWith({ index: 1 });

    expect(document.activeElement).toBe(prev);
  });

  it('leaves focus alone when Next is focused but the viewer is not at the latest photo', () => {
    const { rerenderWith } = setup({ index: 2 });
    const next = screen.getByTestId('spot-viewer-next');
    next.focus();

    rerenderWith({ index: 1 });

    expect(document.activeElement).toBe(next);
  });

  it('does not throw when Prev loses focus to nothing and no headingRef is supplied', () => {
    const { rerenderWith } = setup({ index: 1, headingRef: undefined });
    screen.getByTestId('spot-viewer-prev').focus();
    expect(() => rerenderWith({ photos: [PHOTOS[0]!], index: 0 })).not.toThrow();
  });

  it('leaves focus alone when the focused nav button stays enabled', () => {
    const { rerenderWith } = setup({ index: 1 });
    const prev = screen.getByTestId('spot-viewer-prev');
    prev.focus();

    rerenderWith({ index: 0 });

    expect(document.activeElement).toBe(prev);
  });

  it('does not throw when no headingRef is supplied and focus must fall back', () => {
    const { rerenderWith } = setup({ index: 1, headingRef: undefined });
    screen.getByTestId('spot-viewer-next').focus();
    expect(() => rerenderWith({ photos: [PHOTOS[0]!], index: 0 })).not.toThrow();
  });
});

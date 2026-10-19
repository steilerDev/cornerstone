import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import type { RefObject } from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import type {
  AreaResponse,
  AreaSummary,
  OrientationSummary,
  PhotoSpotPhoto,
  UpdatePhotoRequest,
  UpdatePhotoResponse,
} from '@cornerstone/shared';
import type { SpotViewer as SpotViewerType, SpotViewerProps } from './SpotViewer.js';
import { makeSpotPhoto, makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeServerPhoto } from '../../test/photoSpotFixtures.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

const mockUpdatePhotoDetails =
  jest.fn<(id: string, data: UpdatePhotoRequest) => Promise<UpdatePhotoResponse>>();
jest.unstable_mockModule('../../lib/photoApi.js', () => ({
  updatePhotoDetails: mockUpdatePhotoDetails,
}));

const areasState: { areas: AreaResponse[]; isLoading: boolean } = { areas: [], isLoading: false };
jest.unstable_mockModule('../../hooks/useAreas.js', () => ({
  useAreas: () => ({ ...areasState }),
}));

// Stand-in pickers: the viewer tests only need the editor to open and a value to change.
jest.unstable_mockModule('../AreaPicker/AreaPicker.js', () => ({
  AreaPicker: (props: { id?: string; value: string; onChange: (id: string) => void }) => (
    <div data-value={props.value}>
      <input id={props.id} aria-label="area input" readOnly />
      <button type="button" onClick={() => props.onChange('')}>
        clear area
      </button>
    </div>
  ),
}));
jest.unstable_mockModule('../OrientationPicker/OrientationPicker.js', () => ({
  OrientationPicker: (props: { id?: string; value: string }) => (
    <input id={props.id} aria-label="orientation input" readOnly data-value={props.value} />
  ),
}));

let SpotViewer: typeof SpotViewerType;

beforeAll(async () => {
  ({ SpotViewer } = await import('./SpotViewer.js'));
});

const PHONE = '(max-width: 767px)';
let media: MatchMediaControl | null = null;

beforeEach(() => {
  mockUpdatePhotoDetails.mockReset();
  areasState.areas = [];
  areasState.isLoading = false;
});

afterEach(() => {
  media?.restore();
  media = null;
});

// Newest first
const PHOTOS: PhotoSpotPhoto[] = [
  makeSpotPhoto('p0', {
    caption: 'Fresh plaster',
    areaId: 'a',
    orientationId: 'o',
    orientation: { id: 'o', name: 'Ceiling', description: null },
    diaryEntry: {
      id: 'e0',
      entryType: 'daily_log',
      title: 'Plastering',
      entryDate: '2026-09-20',
      isSigned: false,
    },
  }),
  makeSpotPhoto('p1', {
    caption: null,
    diaryEntry: {
      id: 'e1',
      entryType: 'issue',
      title: null,
      entryDate: '2026-09-11',
      isSigned: false,
    },
  }),
  makeSpotPhoto('p2', {
    caption: '   ',
    diaryEntry: {
      id: 'e2',
      entryType: 'site_visit',
      title: 'Visit',
      entryDate: '2026-09-01',
      isSigned: false,
    },
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
  const onAnnotate = jest.fn();
  const onDetailsSaved = jest.fn();
  const headingRef = createRef<HTMLHeadingElement>() as RefObject<HTMLHeadingElement | null>;
  const props: SpotViewerProps = {
    photos: PHOTOS,
    index: 1,
    onSelect,
    onBack,
    backTo: '/photos',
    backState: { focusSpotId: 'a:o' },
    backLabel: 'Photos',
    area: AREA,
    orientation: ORIENTATION,
    title: 'House › Kitchen · Ceiling',
    headingRef,
    isNoAreaGroup: false,
    onAnnotate,
    onDetailsSaved,
    ...overrides,
  };
  const utils = render(
    <MemoryRouter>
      <SpotViewer {...props} />
      <OriginProbe />
    </MemoryRouter>,
  );
  const rerenderWith = (next: Partial<SpotViewerProps>) =>
    utils.rerender(
      <MemoryRouter>
        <SpotViewer {...props} {...next} />
      </MemoryRouter>,
    );
  return { onSelect, onBack, onAnnotate, onDetailsSaved, headingRef, rerenderWith, ...utils };
}

/** Adds a foreign element inside the viewer root (to test where key presses come from). */
function inject(el: HTMLElement): HTMLElement {
  const root = screen.getByTestId('spot-viewer-toolbar').closest('[class*="viewer"]')!;
  root.appendChild(el);
  return el;
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
    const { onSelect, onBack } = setup({ index: 1 });
    const input = inject(document.createElement('input'));
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores keys inside a contenteditable region', () => {
    const { onSelect } = setup({ index: 1 });
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    inject(el);
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each(['select', 'textarea'])(
    'ignores keys while focus is in a %s inside the viewer',
    (tag) => {
      const { onSelect, onBack } = setup({ index: 1 });
      const el = inject(document.createElement(tag));
      fireEvent.keyDown(el, { key: 'ArrowLeft' });
      fireEvent.keyDown(el, { key: 'Escape' });
      expect(onSelect).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    },
  );

  it('ignores keys from a child of a contenteditable region', () => {
    const { onSelect, onBack } = setup({ index: 1 });
    const wrapper = document.createElement('div');
    wrapper.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    wrapper.appendChild(child);
    inject(wrapper);
    fireEvent.keyDown(child, { key: 'ArrowLeft' });
    fireEvent.keyDown(child, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('handles keys from an explicitly non-editable element inside the viewer', () => {
    const { onSelect } = setup({ index: 1 });
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'false');
    inject(el);
    fireEvent.keyDown(el, { key: 'ArrowLeft' });
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
    expect(screen.getByTestId('spot-viewer-details-panel-date')).toHaveTextContent(
      'September 20, 2026',
    );
    expect(screen.getByTestId('spot-viewer-details-panel-area')).toHaveTextContent(
      'House › Kitchen',
    );
    expect(screen.getByTestId('spot-viewer-details-panel-orientation')).toHaveTextContent(
      'Ceiling',
    );
    expect(screen.getByTestId('spot-viewer-details-panel-caption-value')).toHaveTextContent(
      'Fresh plaster',
    );
  });

  it('shows placeholders for missing area, orientation and caption', () => {
    setup({ index: 1, area: null, orientation: null });
    expect(screen.getByTestId('spot-viewer-details-panel-area')).toHaveTextContent('No area');
    expect(screen.getByTestId('spot-viewer-details-panel-orientation')).toHaveTextContent(
      'No orientation',
    );
    expect(screen.getByTestId('spot-viewer-details-panel-caption-value')).toHaveTextContent(
      'No caption',
    );
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

  it('shows the entry type as a text chip, without an emoji', () => {
    const first = setup({ index: 0 });
    expect(screen.getByTestId('diary-type-badge-daily_log').textContent).toBe('Daily log');
    first.unmount();
    setup({ index: 1 });
    expect(screen.getByTestId('diary-type-badge-issue').textContent).toBe('Defect');
  });

  it('renders the back link with the supplied target', () => {
    setup();
    expect(screen.getByTestId('spot-viewer-back')).toHaveAttribute('href', '/photos');
  });

  it('renders the supplied back label as the link text', () => {
    setup({ backLabel: 'Back to Synthetic entry', backTo: '/diary/d-1' });
    const back = screen.getByTestId('spot-viewer-back');
    // Mutation: a hardcoded "Photos"/"Back to spots" label fails here.
    expect(back).toHaveTextContent('Back to Synthetic entry');
    expect(back).toHaveAttribute('href', '/diary/d-1');
  });

  it('passes entryLinkState to the Open diary entry link as origin', () => {
    setup({ entryLinkState: { origin: { to: '/photos/spot/a/o', name: 'Kitchen · Ceiling' } } });
    fireEvent.click(screen.getByTestId('spot-viewer-diary-link'));
    // Mutation: omitting state on the link leaves the origin null.
    expect(probedOrigin()).toEqual({ to: '/photos/spot/a/o', name: 'Kitchen · Ceiling' });
  });

  it('opens the diary entry without origin when no entryLinkState is given', () => {
    setup();
    fireEvent.click(screen.getByTestId('spot-viewer-diary-link'));
    expect(probedOrigin()).toBeNull();
  });

  it('announces the position and date through a status region', () => {
    setup({ index: 0 });
    const announcement = screen.getByText('Photo 1 of 3, September 20, 2026');
    expect(announcement).toHaveAttribute('role', 'status');
    expect(announcement).toHaveAttribute('aria-atomic', 'true');
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

describe('SpotViewer title', () => {
  it('renders a visible h1 with the title, focusable but not in the tab order', () => {
    const { headingRef } = setup({ title: 'No area' });
    const h1 = screen.getByRole('heading', { level: 1, name: 'No area' });
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(h1).toBe(headingRef.current);
    expect(h1).toBe(screen.getByTestId('spot-viewer-title'));
  });

  it('works without a headingRef', () => {
    setup({ headingRef: undefined });
    expect(screen.getByTestId('spot-viewer-title')).toBeInTheDocument();
  });
});

describe('SpotViewer list heading', () => {
  it('reads "Same spot over time" for a spot', () => {
    setup();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Same spot over time' }),
    ).toBeInTheDocument();
  });

  it('reads "Photos with no area" for the No area group', () => {
    setup({ isNoAreaGroup: true });
    expect(
      screen.getByRole('heading', { level: 2, name: 'Photos with no area' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Same spot over time')).not.toBeInTheDocument();
  });
});

describe('SpotViewer toolbar: Annotate', () => {
  function signedPhoto(id: string) {
    return makeSpotPhoto(id, {
      diaryEntry: {
        id: `e-${id}`,
        entryType: 'daily_log',
        title: 'Signed',
        entryDate: '2026-09-01',
        isSigned: true,
      },
    });
  }

  it('calls onAnnotate with the current photo and its own button as focus return', () => {
    const { onAnnotate } = setup({ index: 0 });
    const button = screen.getByTestId('spot-viewer-annotate');
    expect(button).toHaveTextContent('Annotate');
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(button).not.toHaveAttribute('aria-describedby');

    fireEvent.click(button);

    expect(onAnnotate).toHaveBeenCalledTimes(1);
    const [photo, ref] = onAnnotate.mock.calls[0] as [PhotoSpotPhoto, RefObject<HTMLElement>];
    expect(photo.id).toBe('p0');
    expect(ref.current).toBe(button);
  });

  it('is aria-disabled with a visible reason for a signed entry and does nothing on click', () => {
    const { onAnnotate } = setup({ photos: [signedPhoto('ps')], index: 0 });
    const button = screen.getByTestId('spot-viewer-annotate');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    const reason = within(screen.getByTestId('spot-viewer-toolbar')).getByText(/signed/i);
    expect(button).toHaveAttribute('aria-describedby', reason.id);

    fireEvent.click(button);
    expect(onAnnotate).not.toHaveBeenCalled();
  });

  it('is aria-disabled with the missing-dimensions reason when width or height is unknown', () => {
    const noWidth = makeSpotPhoto('pn', { width: null, height: 600 });
    const noHeight = makeSpotPhoto('ph', { width: 800, height: null });
    const first = setup({ photos: [noWidth], index: 0 });
    const reason = within(screen.getByTestId('spot-viewer-toolbar')).getByText(/dimensions|size/i);
    expect(screen.getByTestId('spot-viewer-annotate')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('spot-viewer-annotate')).toHaveAttribute(
      'aria-describedby',
      reason.id,
    );
    fireEvent.click(screen.getByTestId('spot-viewer-annotate'));
    expect(first.onAnnotate).not.toHaveBeenCalled();
    first.unmount();

    const second = setup({ photos: [noHeight], index: 0 });
    expect(screen.getByTestId('spot-viewer-annotate')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByTestId('spot-viewer-annotate'));
    expect(second.onAnnotate).not.toHaveBeenCalled();
  });

  it('names the signed reason (not the dimensions one) when both apply', () => {
    const both = makeSpotPhoto('pb', {
      width: null,
      height: null,
      diaryEntry: {
        id: 'eb',
        entryType: 'daily_log',
        title: null,
        entryDate: '2026-09-01',
        isSigned: true,
      },
    });
    setup({ photos: [both], index: 0 });
    const toolbar = within(screen.getByTestId('spot-viewer-toolbar'));
    expect(toolbar.getByText(/signed/i)).toBeInTheDocument();
    expect(toolbar.queryByText(/dimensions|size/i)).not.toBeInTheDocument();
  });
});

describe('SpotViewer toolbar: View original', () => {
  const marked = makeSpotPhoto('pm', {
    annotatedAt: '2026-09-12T08:00:00.000Z',
    fileUrl: '/api/photos/pm/file',
  });
  const markedOther = makeSpotPhoto('pm2', {
    annotatedAt: '2026-09-12T08:00:00.000Z',
    fileUrl: '/api/photos/pm2/file?v=3',
  });

  it('is absent for a photo without markup', () => {
    setup({ index: 0 });
    expect(screen.queryByTestId('spot-viewer-view-original')).not.toBeInTheDocument();
  });

  it('toggles between the annotated and the original image', () => {
    setup({ photos: [marked], index: 0 });
    const toggle = screen.getByTestId('spot-viewer-view-original');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAccessibleName('View original');
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute('src', marked.fileUrl);

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAccessibleName('View annotated');
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute(
      'src',
      `${marked.fileUrl}?variant=original`,
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute('src', marked.fileUrl);
  });

  it('appends variant=original with & when the file url already has a query', () => {
    setup({ photos: [markedOther], index: 0 });
    fireEvent.click(screen.getByTestId('spot-viewer-view-original'));
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute(
      'src',
      '/api/photos/pm2/file?v=3&variant=original',
    );
  });

  it('goes back to the annotated image when another photo is shown', () => {
    const { rerenderWith } = setup({ photos: [marked, markedOther], index: 0 });
    fireEvent.click(screen.getByTestId('spot-viewer-view-original'));
    expect(screen.getByTestId('spot-viewer-view-original')).toHaveAttribute('aria-pressed', 'true');

    rerenderWith({ index: 1 });

    expect(screen.getByTestId('spot-viewer-view-original')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('spot-viewer-image')).toHaveAttribute('src', markedOther.fileUrl);
  });
});

describe('SpotViewer details placement', () => {
  it('wide: the panel is inline and there is no Details button', () => {
    setup({ index: 0 });
    expect(screen.queryByTestId('spot-viewer-details')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Photo details' })).toBeInTheDocument();
    expect(screen.queryByTestId('spot-viewer-details-sheet')).not.toBeInTheDocument();
  });

  it('phone: the panel is hidden behind a Details button', () => {
    media = installMatchMedia({ [PHONE]: true });
    setup({ index: 0 });
    expect(screen.getByTestId('spot-viewer-details')).toHaveTextContent('Details');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('phone: Details opens a sheet holding the panel; closing returns focus to the button', async () => {
    media = installMatchMedia({ [PHONE]: true });
    const user = userEvent.setup();
    setup({ index: 0 });

    await user.click(screen.getByTestId('spot-viewer-details'));

    const sheet = screen.getByRole('dialog', { name: 'Photo details' });
    expect(within(sheet).getByRole('complementary', { name: 'Photo details' })).toBeInTheDocument();
    expect(within(sheet).getByTestId('spot-viewer-diary-link')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('spot-viewer-details')).toHaveFocus());
  });

  it('phone: the viewer keys are ignored while the details sheet is open', async () => {
    media = installMatchMedia({ [PHONE]: true });
    const user = userEvent.setup();
    const { onSelect, onBack } = setup({ index: 1 });
    await user.click(screen.getByTestId('spot-viewer-details'));

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('SpotViewer details panel wiring', () => {
  it('passes the signed state: Edit tags is aria-disabled for a signed entry', () => {
    const signed = makeSpotPhoto('ps', {
      diaryEntry: {
        id: 'es',
        entryType: 'daily_log',
        title: 'Signed',
        entryDate: '2026-09-01',
        isSigned: true,
      },
    });
    setup({ photos: [signed], index: 0 });
    expect(screen.getByTestId('spot-viewer-details-panel-edit-tags')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('ignores the viewer keys while the tag editor is open and handles them again after Cancel', async () => {
    const user = userEvent.setup();
    const { onSelect, onBack } = setup({ index: 1 });

    await user.click(screen.getByTestId('spot-viewer-details-panel-edit-tags'));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('spot-viewer-details-panel-cancel'));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('reports a saved edit to onDetailsSaved with the undo token and the spot label', async () => {
    const undo = { token: 'tok', expiresAt: '2026-09-11T10:00:30.000Z' };
    mockUpdatePhotoDetails.mockResolvedValue({
      photo: makeServerPhoto({ id: 'p0', areaId: null, orientationId: null, orientation: null }),
      undo,
    });
    const user = userEvent.setup();
    const { onDetailsSaved } = setup({ photos: [PHOTOS[0]!], index: 0 });

    await user.click(screen.getByTestId('spot-viewer-details-panel-edit-tags'));
    await user.click(screen.getByRole('button', { name: 'clear area' }));
    await user.click(screen.getByTestId('spot-viewer-details-panel-save-tags'));

    await waitFor(() => expect(onDetailsSaved).toHaveBeenCalledTimes(1));
    expect(mockUpdatePhotoDetails).toHaveBeenCalledWith('p0', { areaId: null });
    expect(onDetailsSaved).toHaveBeenCalledWith(
      expect.objectContaining({ undo, tagsChanged: true, spotLabel: 'No area · No orientation' }),
    );
  });
});

describe('SpotViewer phone chrome', () => {
  const chromeHiddenOf = (testId: string) =>
    screen.getByTestId(testId).className.includes('chromeHidden');
  const topBar = () => screen.getByTestId('spot-viewer-back').parentElement!;

  it('a tap on the photo hides the top bar, arrows and toolbar and a second tap shows them', () => {
    media = installMatchMedia({ [PHONE]: true });
    setup({ index: 1 });
    for (const id of ['spot-viewer-toolbar', 'spot-viewer-prev', 'spot-viewer-next']) {
      expect(chromeHiddenOf(id)).toBe(false);
    }

    fireEvent.click(screen.getByTestId('spot-viewer-image'));
    expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(true);
    expect(chromeHiddenOf('spot-viewer-prev')).toBe(true);
    expect(chromeHiddenOf('spot-viewer-next')).toBe(true);
    expect(topBar().className).toContain('chromeHidden');

    fireEvent.click(screen.getByTestId('spot-viewer-image'));
    expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(false);
    expect(topBar().className).not.toContain('chromeHidden');
  });

  it('focus moving into the toolbar, the top bar or an arrow shows the chrome again', () => {
    media = installMatchMedia({ [PHONE]: true });
    setup({ index: 1 });

    for (const focusTarget of [
      () => screen.getByTestId('spot-viewer-annotate'),
      () => screen.getByTestId('spot-viewer-back'),
      () => screen.getByTestId('spot-viewer-prev'),
      () => screen.getByTestId('spot-viewer-next'),
    ]) {
      fireEvent.click(screen.getByTestId('spot-viewer-image'));
      expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(true);
      act(() => focusTarget().focus());
      expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(false);
    }
  });

  it('wide: a click on the photo does not hide anything', () => {
    setup({ index: 1 });
    fireEvent.click(screen.getByTestId('spot-viewer-image'));
    expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(false);
  });

  it('leaving the phone layout shows the chrome even if it was hidden', () => {
    media = installMatchMedia({ [PHONE]: true });
    setup({ index: 1 });
    fireEvent.click(screen.getByTestId('spot-viewer-image'));
    expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(true);

    media.set(PHONE, false);

    expect(chromeHiddenOf('spot-viewer-toolbar')).toBe(false);
  });
});

describe('SpotViewer heading focus request', () => {
  const frame = () =>
    act(async () => {
      await new Promise((r) => window.requestAnimationFrame(() => r(null)));
    });

  it('does not move focus on the first render', async () => {
    setup({ headingFocusRequest: 0 });
    await frame();
    expect(document.activeElement).toBe(document.body);
  });

  it('a new request value reveals the phone chrome and focuses the heading next frame', async () => {
    media = installMatchMedia({ [PHONE]: true });
    const { rerenderWith, headingRef } = setup({ headingFocusRequest: 0 });
    fireEvent.click(screen.getByTestId('spot-viewer-image'));
    expect(screen.getByTestId('spot-viewer-toolbar').className).toContain('chromeHidden');

    rerenderWith({ headingFocusRequest: 1 });

    expect(screen.getByTestId('spot-viewer-toolbar').className).not.toContain('chromeHidden');
    await waitFor(() => expect(document.activeElement).toBe(headingRef.current));
  });

  it('does not repeat for the same value', async () => {
    const { rerenderWith, headingRef } = setup({ headingFocusRequest: 0 });
    rerenderWith({ headingFocusRequest: 1 });
    await waitFor(() => expect(document.activeElement).toBe(headingRef.current));
    (document.activeElement as HTMLElement).blur();

    rerenderWith({ headingFocusRequest: 1, index: 0 });
    await frame();

    expect(document.activeElement).toBe(document.body);
  });

  it('cancels the pending focus when unmounted before the frame', async () => {
    const { rerenderWith, unmount, headingRef } = setup({ headingFocusRequest: 0 });
    rerenderWith({ headingFocusRequest: 1 });
    const heading = headingRef.current;
    unmount();
    await frame();
    expect(document.activeElement).not.toBe(heading);
  });

  it('does not throw when the heading ref holds nothing at the focus frame', async () => {
    const emptyRef = {
      get current() {
        return null;
      },
      set current(_value: HTMLHeadingElement | null) {},
    } as RefObject<HTMLHeadingElement | null>;
    const { rerenderWith } = setup({ headingFocusRequest: 0, headingRef: emptyRef });
    rerenderWith({ headingFocusRequest: 1, headingRef: emptyRef });
    await expect(frame()).resolves.toBeUndefined();
  });

  it('works without a headingRef', async () => {
    const { rerenderWith } = setup({ headingFocusRequest: 0, headingRef: undefined });
    rerenderWith({ headingFocusRequest: 1, headingRef: undefined });
    await frame();
    expect(screen.getByTestId('spot-viewer-title')).toBeInTheDocument();
  });
});

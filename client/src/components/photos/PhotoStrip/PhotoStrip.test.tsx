import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createRef, useRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installMatchMedia } from '../../../test/matchMediaControl.js';
import { PhotoStrip } from './PhotoStrip.js';
import type { PhotoStripProps, PhotoStripTile } from './PhotoStrip.js';

function tile(key: string, overrides: Partial<PhotoStripTile> = {}): PhotoStripTile {
  return {
    key,
    kind: 'pending',
    thumbnailUrl: `blob:${key}`,
    state: 'uploaded',
    progress: null,
    areaLabel: null,
    orientationLabel: null,
    annotated: false,
    notPersisted: false,
    ...overrides,
  };
}

function renderStrip(tiles: readonly PhotoStripTile[], overrides: Partial<PhotoStripProps> = {}) {
  const props: PhotoStripProps = {
    tiles,
    selectedKeys: new Set<string>(),
    onToggleSelect: jest.fn(),
    onOpen: jest.fn(),
    onRetry: jest.fn(),
    onRemove: jest.fn(),
    emptyFocusRef: createRef<HTMLElement>(),
    ...overrides,
  };
  const view = render(<PhotoStrip {...props} />);
  return { props, ...view };
}

describe('PhotoStrip', () => {
  const originalScroll = Element.prototype.scrollIntoView;
  let scrollIntoView: jest.Mock;

  beforeEach(() => {
    scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView as never;
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScroll;
  });

  it('renders nothing without tiles', () => {
    const { container } = renderStrip([]);
    expect(container).toBeEmptyDOMElement();
  });

  describe('accessible names', () => {
    it('names a plain tile by its position', () => {
      renderStrip([tile('a'), tile('b')]);
      expect(screen.getByTestId('photo-strip-a-open')).toHaveAccessibleName('Photo 1 of 2');
      expect(screen.getByTestId('photo-strip-b-open')).toHaveAccessibleName('Photo 2 of 2');
    });

    it('adds area, orientation and annotated in that order', () => {
      renderStrip([
        tile('a', {
          areaLabel: 'Kitchen · Ground floor',
          orientationLabel: 'North wall',
          annotated: true,
        }),
      ]);
      expect(screen.getByTestId('photo-strip-a-open')).toHaveAccessibleName(
        'Photo 1 of 1, Kitchen · Ground floor, North wall, annotated',
      );
      expect(screen.getByTestId('photo-strip-a-annotated')).toBeInTheDocument();
    });

    it('adds the upload percentage while uploading', () => {
      renderStrip([tile('a', { state: 'uploading', progress: 42 })]);
      expect(screen.getByTestId('photo-strip-a-open')).toHaveAccessibleName(
        'Photo 1 of 1, uploading 42%',
      );
      expect(screen.getByText('42%')).toBeInTheDocument();
    });

    it('treats unknown progress as 0%', () => {
      renderStrip([tile('a', { state: 'uploading', progress: null })]);
      expect(screen.getByTestId('photo-strip-a-open')).toHaveAccessibleName(
        'Photo 1 of 1, uploading 0%',
      );
    });

    it('adds upload failed for a failed tile', () => {
      renderStrip([tile('a', { state: 'failed' })]);
      expect(screen.getByTestId('photo-strip-a-open')).toHaveAccessibleName(
        'Photo 1 of 1, upload failed',
      );
    });

    it("adds can't be added for a blocked tile", () => {
      renderStrip([tile('a', { state: 'blocked' })]);
      expect(screen.getByTestId('photo-strip-a-open')).toHaveAccessibleName(
        "Photo 1 of 1, can't be added",
      );
    });

    it('shows a visible state badge for waiting, failed and blocked', () => {
      renderStrip([
        tile('w', { state: 'waiting' }),
        tile('f', { state: 'failed' }),
        tile('b', { state: 'blocked' }),
      ]);
      expect(within(screen.getByTestId('photo-strip-w-open')).getByText('Waiting')).toBeVisible();
      expect(within(screen.getByTestId('photo-strip-f-open')).getByText('Failed')).toBeVisible();
      expect(
        within(screen.getByTestId('photo-strip-b-open')).getByText("Can't be added"),
      ).toBeVisible();
    });
  });

  describe('actions', () => {
    it('opens a tile', async () => {
      const { props } = renderStrip([tile('a'), tile('b')]);
      await userEvent.click(screen.getByTestId('photo-strip-b-open'));
      expect(props.onOpen).toHaveBeenCalledWith('b');
    });

    it('marks every open button and tile with the data attributes the page relies on', () => {
      const { container } = renderStrip([tile('a'), tile('b')]);
      expect(container.querySelectorAll('[data-open-button]')).toHaveLength(2);
      expect(
        Array.from(container.querySelectorAll('[data-tile-key]')).map((el) =>
          el.getAttribute('data-tile-key'),
        ),
      ).toEqual(['a', 'b']);
    });

    it('reflects selection in the checkbox and the tile', async () => {
      const { props } = renderStrip([tile('a'), tile('b')], { selectedKeys: new Set(['b']) });
      expect(screen.getByRole('checkbox', { name: 'Select photo 1' })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Select photo 2' })).toBeChecked();
      expect(screen.getByTestId('photo-strip-b-tile')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId('photo-strip-a-tile')).toHaveAttribute('data-selected', 'false');

      await userEvent.click(screen.getByRole('checkbox', { name: 'Select photo 1' }));
      expect(props.onToggleSelect).toHaveBeenCalledWith('a');
    });

    it('toggles selection from the keyboard (Space on the focused checkbox)', async () => {
      const { props } = renderStrip([tile('a'), tile('b')]);
      const box = screen.getByTestId('photo-strip-b-select');
      expect(box).toHaveAccessibleName('Select photo 2');
      box.focus();
      await userEvent.keyboard(' ');
      expect(props.onToggleSelect).toHaveBeenCalledTimes(1);
      expect(props.onToggleSelect).toHaveBeenCalledWith('b');
    });

    it('offers no select checkbox for a blocked tile', () => {
      renderStrip([tile('a', { state: 'blocked' })]);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('shows Retry only on a failed tile and calls onRetry', async () => {
      const { props } = renderStrip([tile('a'), tile('b', { state: 'failed' })]);
      expect(screen.queryByTestId('photo-strip-a-retry')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Retry upload of photo 2' }));
      expect(props.onRetry).toHaveBeenCalledWith('b');
    });

    it('removes a tile', async () => {
      const { props } = renderStrip([tile('a'), tile('b')]);
      await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
      expect(props.onRemove).toHaveBeenCalledWith('a');
    });

    it('labels a tile that is not saved on this device', () => {
      renderStrip([tile('a', { notPersisted: true }), tile('b')]);
      expect(screen.getByTestId('photo-strip-a-not-persisted')).toHaveTextContent(
        'Not saved on this device',
      );
      expect(screen.queryByTestId('photo-strip-b-not-persisted')).not.toBeInTheDocument();
    });
  });

  describe('testIdPrefix', () => {
    it('uses the custom prefix and emits no default testids', () => {
      renderStrip([tile('a', { state: 'failed' })], { testIdPrefix: 'sheet-strip' });
      expect(screen.getByTestId('sheet-strip')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-strip-a-open')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-strip-a-select')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-strip-a-remove')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-strip-a-retry')).toBeInTheDocument();
      expect(screen.queryByTestId('photo-strip')).not.toBeInTheDocument();
      expect(screen.queryByTestId('photo-strip-a-open')).not.toBeInTheDocument();
    });
  });

  describe('focus after Remove', () => {
    // Removing really drops the tile, as the host does.
    function Harness({
      initial,
      emptyRef,
    }: {
      initial: string[];
      emptyRef: React.RefObject<HTMLButtonElement | null>;
    }) {
      const [keys, setKeys] = useState(initial);
      return (
        <PhotoStrip
          tiles={keys.map((k) => tile(k))}
          selectedKeys={new Set()}
          onToggleSelect={() => undefined}
          onOpen={() => undefined}
          onRetry={() => undefined}
          onRemove={(key) => setKeys((prev) => prev.filter((k) => k !== key))}
          emptyFocusRef={emptyRef}
        />
      );
    }

    function Host({ initial }: { initial: string[] }) {
      const emptyRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <Harness initial={initial} emptyRef={emptyRef} />
          <button ref={emptyRef} data-testid="empty-target">
            Choose from library
          </button>
        </>
      );
    }

    it('moves to the next tile', async () => {
      render(<Host initial={['a', 'b', 'c']} />);
      await userEvent.click(screen.getByTestId('photo-strip-a-remove'));
      expect(screen.getByTestId('photo-strip-b-open')).toHaveFocus();
    });

    it('moves to the previous tile when the last one is removed', async () => {
      render(<Host initial={['a', 'b', 'c']} />);
      await userEvent.click(screen.getByTestId('photo-strip-c-remove'));
      expect(screen.getByTestId('photo-strip-b-open')).toHaveFocus();
    });

    it('moves to the empty-state target when the only tile is removed', async () => {
      render(<Host initial={['a']} />);
      await userEvent.click(screen.getByTestId('photo-strip-a-remove'));
      expect(screen.queryByTestId('photo-strip')).not.toBeInTheDocument();
      expect(screen.getByTestId('empty-target')).toHaveFocus();
    });

    it('does not steal focus when a tile disappears without a Remove press', () => {
      const { rerender, props } = renderStrip([tile('a'), tile('b')]);
      screen.getByTestId('photo-strip-b-open').focus();
      rerender(<PhotoStrip {...props} tiles={[tile('b')]} />);
      expect(screen.getByTestId('photo-strip-b-open')).toHaveFocus();
    });

    it('forgets the pending removal when focus moves to another tile first', async () => {
      const { props, rerender } = renderStrip([tile('a'), tile('b'), tile('c')]);
      await userEvent.click(screen.getByTestId('photo-strip-a-remove'));
      // The host did not remove it; the user then focuses another tile.
      screen.getByTestId('photo-strip-c-open').focus();
      rerender(<PhotoStrip {...props} tiles={[tile('b'), tile('c')]} />);
      expect(screen.getByTestId('photo-strip-c-open')).toHaveFocus();
    });
  });

  describe('scrolling a new tile into view', () => {
    it('does not scroll on the first render', () => {
      renderStrip([tile('a'), tile('b')]);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('scrolls a newly appended tile into view', () => {
      const { rerender, props } = renderStrip([tile('a')]);
      rerender(<PhotoStrip {...props} tiles={[tile('a'), tile('b')]} />);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ block: 'nearest', inline: 'nearest' }),
      );
    });

    it('scrolls smoothly by default and instantly with reduced motion', () => {
      const first = renderStrip([tile('a')]);
      first.rerender(<PhotoStrip {...first.props} tiles={[tile('a'), tile('b')]} />);
      expect(scrollIntoView).toHaveBeenLastCalledWith(
        expect.objectContaining({ behavior: 'smooth' }),
      );
      first.unmount();

      const media = installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
      try {
        const second = renderStrip([tile('a')]);
        second.rerender(<PhotoStrip {...second.props} tiles={[tile('a'), tile('b')]} />);
        expect(scrollIntoView).toHaveBeenLastCalledWith(
          expect.objectContaining({ behavior: 'auto' }),
        );
      } finally {
        media.restore();
      }
    });

    it('does not scroll when the last tile is unchanged', () => {
      const { rerender, props } = renderStrip([tile('a'), tile('b')]);
      rerender(<PhotoStrip {...props} tiles={[tile('a'), tile('b', { state: 'uploading' })]} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });
});

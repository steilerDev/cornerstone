import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SpotThumbnail } from './SpotThumbnail.js';
import type { SpotThumbnailProps } from './SpotThumbnail.js';

function renderThumb(props: Partial<SpotThumbnailProps> = {}) {
  return render(
    <MemoryRouter>
      <SpotThumbnail
        variant="cell"
        emptyLabel="No photos"
        imageUnavailableLabel="Image unavailable"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('SpotThumbnail', () => {
  describe('link variant', () => {
    it('renders a link with href, aria-label, count, date and a decorative image', () => {
      const { container } = renderThumb({
        to: '/photos/spot/a/o?photo=p1',
        ariaLabel: 'Kitchen, North: 3 photos, latest September 11, 2026',
        src: '/api/photos/p1/thumbnail?v=1',
        count: 3,
        dateLabel: 'Sep 11, 2026',
        id: 'spot-a:o',
      });

      const link = screen.getByRole('link', {
        name: 'Kitchen, North: 3 photos, latest September 11, 2026',
      });
      expect(link).toHaveAttribute('href', '/photos/spot/a/o?photo=p1');
      expect(link).toHaveAttribute('id', 'spot-a:o');
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Sep 11, 2026')).toBeInTheDocument();
      const img = container.querySelector('img')!;
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('src', '/api/photos/p1/thumbnail?v=1');
    });

    it('omits the count badge when count is undefined', () => {
      renderThumb({ to: '/x', ariaLabel: 'x', src: '/i.jpg', dateLabel: 'd' });
      expect(screen.queryByText('3')).not.toBeInTheDocument();
    });

    it('shows the fallback and no broken image when the image fails to load', () => {
      const { container } = renderThumb({ to: '/x', ariaLabel: 'x', src: '/bad.jpg', count: 1 });

      fireEvent.error(container.querySelector('img')!);

      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });

    it('shows the fallback immediately when there is no src', () => {
      const { container } = renderThumb({ to: '/x', ariaLabel: 'x', src: null });
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });

    it('renders the orientation title only for the card variant', () => {
      const { unmount } = renderThumb({
        variant: 'card',
        to: '/x',
        ariaLabel: 'x',
        src: '/i.jpg',
        title: 'North',
      });
      expect(screen.getByText('North')).toBeInTheDocument();
      unmount();

      renderThumb({ variant: 'cell', to: '/x', ariaLabel: 'x', src: '/i.jpg', title: 'North' });
      expect(screen.queryByText('North')).not.toBeInTheDocument();
    });

    it('uses the custom testId and not the default one', () => {
      renderThumb({ to: '/x', ariaLabel: 'x', testId: 'spot-cell-a:o' });
      expect(screen.getByTestId('spot-cell-a:o')).toBeInTheDocument();
      expect(screen.queryByTestId('spot-thumbnail')).not.toBeInTheDocument();
    });

    it('shows the image again after a failure when the src changes', () => {
      const props = { to: '/x', ariaLabel: 'x', src: '/bad.jpg', count: 1 };
      const { container, rerender } = renderThumb(props);
      fireEvent.error(container.querySelector('img')!);
      expect(container.querySelector('img')).toBeNull();

      rerender(
        <MemoryRouter>
          <SpotThumbnail
            variant="cell"
            emptyLabel="No photos"
            imageUnavailableLabel="Image unavailable"
            {...props}
            src="/good.jpg"
          />
        </MemoryRouter>,
      );

      expect(container.querySelector('img')).toHaveAttribute('src', '/good.jpg');
      expect(screen.queryByText('Image unavailable')).not.toBeInTheDocument();
    });

    it('uses the default testId when none is given', () => {
      renderThumb({ to: '/x', ariaLabel: 'x' });
      expect(screen.getByTestId('spot-thumbnail')).toBeInTheDocument();
    });
  });

  describe('empty variant', () => {
    it('renders a non-focusable div with the visually hidden prefix and the empty label', () => {
      const { container } = renderThumb({
        emptySrPrefix: 'Kitchen, North: ',
        testId: 'spot-cell-a:o',
      });

      const el = screen.getByTestId('spot-cell-a:o');
      expect(el.tagName).toBe('DIV');
      expect(container.querySelector('a')).toBeNull();
      expect(el).not.toHaveAttribute('tabindex');
      expect(screen.getByText('Kitchen, North:')).toBeInTheDocument();
      expect(el).toHaveTextContent('Kitchen, North: No photos');
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders without a screen-reader prefix when none is given', () => {
      renderThumb();
      expect(screen.getByTestId('spot-thumbnail')).toHaveTextContent(/^No photos$/);
    });

    it('shows the (muted) orientation title on the empty card variant', () => {
      renderThumb({ variant: 'card', title: 'Ceiling', titleMuted: true });
      expect(screen.getByText('Ceiling')).toBeInTheDocument();
    });

    it('shows an unmuted title on the empty card variant', () => {
      renderThumb({ variant: 'card', title: 'Ceiling' });
      expect(screen.getByText('Ceiling')).toBeInTheDocument();
    });

    it('omits the title for the empty cell variant', () => {
      renderThumb({ variant: 'cell', title: 'Ceiling' });
      expect(screen.queryByText('Ceiling')).not.toBeInTheDocument();
    });
  });

  describe('select variant', () => {
    function renderSelect(
      select: Partial<NonNullable<SpotThumbnailProps['select']>> = {},
      props: Partial<SpotThumbnailProps> = {},
    ) {
      const onToggle = jest.fn();
      const utils = renderThumb({
        src: '/api/photos/p1/thumbnail?v=1',
        select: {
          selected: false,
          onToggle,
          label: 'Photo from September 11, 2026, Ceiling',
          ...select,
        },
        ...props,
      });
      return { onToggle, ...utils };
    }

    it('renders a labelled checkbox tile instead of a link', () => {
      const { container } = renderSelect();

      const box = screen.getByRole('checkbox', { name: 'Photo from September 11, 2026, Ceiling' });
      expect(box).not.toBeChecked();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByTestId('spot-thumbnail').tagName).toBe('LABEL');
      expect(container.querySelector('img')).toHaveAttribute('src', '/api/photos/p1/thumbnail?v=1');
    });

    it('calls onToggle when the checkbox is clicked and when the tile label is clicked', () => {
      const { onToggle } = renderSelect();

      fireEvent.click(screen.getByRole('checkbox'));
      expect(onToggle).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByTestId('spot-thumbnail'));
      expect(onToggle).toHaveBeenCalledTimes(2);
    });

    it('shows the selected cues only when selected', () => {
      const off = renderSelect({ selected: false });
      expect(off.container.querySelectorAll('[class*="selectedOverlay"]')).toHaveLength(0);
      expect(off.container.querySelectorAll('[class*="selectedRing"]')).toHaveLength(0);
      expect(screen.getByRole('checkbox')).not.toBeChecked();
      expect(screen.getByTestId('spot-thumbnail').className).not.toMatch(/selectedTile/);
      off.unmount();

      const on = renderSelect({ selected: true });
      expect(screen.getByRole('checkbox')).toBeChecked();
      expect(on.container.querySelectorAll('[class*="selectedOverlay"]')).toHaveLength(1);
      expect(on.container.querySelectorAll('[class*="selectedRing"]')).toHaveLength(1);
      expect(screen.getByTestId('spot-thumbnail').className).toMatch(/selectedTile/);
    });

    it('shows the date label when given and omits the body otherwise', () => {
      const withDate = renderSelect({}, { dateLabel: 'Sep 11, 2026' });
      expect(screen.getByText('Sep 11, 2026')).toBeInTheDocument();
      withDate.unmount();

      const { container } = renderSelect();
      expect(container.querySelector('[class*="body"]')).toBeNull();
    });

    it('locked tile: no checkbox, not focusable, shows the muted label', () => {
      const { container, onToggle } = renderSelect(
        { disabledLabel: 'Signed entry' },
        { dateLabel: 'Sep 11, 2026' },
      );

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      const tile = screen.getByTestId('spot-thumbnail');
      expect(tile.tagName).toBe('DIV');
      expect(tile).not.toHaveAttribute('tabindex');
      expect(tile).toHaveTextContent('Signed entry');
      expect(screen.getByText('Sep 11, 2026')).toBeInTheDocument();
      expect(container.querySelector('[class*="checkBadge"]')).toBeNull();
      fireEvent.click(tile);
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('locked tile: the accessible text names the photo (label) before "Signed entry"', () => {
      renderSelect({ disabledLabel: 'Signed entry' }, { dateLabel: 'Sep 11, 2026' });
      const tile = screen.getByTestId('spot-thumbnail');
      const label = screen.getByText('Photo from September 11, 2026, Ceiling');
      expect(label.className).toMatch(/srOnly/);
      const text = tile.textContent ?? '';
      expect(text.indexOf('Photo from September 11, 2026, Ceiling')).toBeLessThan(
        text.indexOf('Signed entry'),
      );
      expect(text).toContain('Sep 11, 2026');
    });

    it('locked tile without a date also carries the photo label', () => {
      renderSelect({ disabledLabel: 'Signed entry' });
      expect(screen.getByText('Photo from September 11, 2026, Ceiling')).toBeInTheDocument();
    });

    it('locked tile without a date still shows the label', () => {
      renderSelect({ disabledLabel: 'Signed entry' });
      expect(screen.getByText('Signed entry')).toBeInTheDocument();
    });

    it('shows the fallback when the image fails and when there is no src', () => {
      const { container, unmount } = renderSelect();
      fireEvent.error(container.querySelector('img')!);
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
      unmount();

      renderSelect({}, { src: null });
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });

    it('uses the custom testId', () => {
      renderSelect({}, { testId: 'no-area-photo-p1' });
      expect(screen.getByTestId('no-area-photo-p1')).toBeInTheDocument();
    });
  });
});

/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, afterEach, beforeEach } from '@jest/globals';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { installMatchMedia, type MatchMediaControl } from '../../test/matchMediaControl.js';
import { GanttLegend } from './GanttLegend.js';

const PHONE = '(max-width: 767px)';
let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia();
});
afterEach(() => {
  media.restore();
  delete document.documentElement.dataset.scrollLocked;
});

function setup(props: Partial<Parameters<typeof GanttLegend>[0]> = {}) {
  const onClose = jest.fn<() => void>();
  const returnFocusRef = createRef<HTMLElement>();
  const utils = render(
    <>
      <button type="button" ref={returnFocusRef as React.RefObject<HTMLButtonElement>}>
        legend button
      </button>
      <GanttLegend
        open
        id="legend-1"
        doneHidden={0}
        showDone={false}
        onClose={onClose}
        returnFocusRef={returnFocusRef}
        {...props}
      />
    </>,
  );
  return { ...utils, onClose };
}

const labels = () =>
  Array.from(document.querySelectorAll('li')).map((li) => li.textContent?.trim());

describe('GanttLegend strip (768 px and wider)', () => {
  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('schedule-legend')).toBeNull();
  });

  it('lists the statuses, late, planned, critical, milestone, delivery and today', () => {
    setup();
    const strip = screen.getByTestId('schedule-legend');
    expect(strip).toHaveAttribute('id', 'legend-1');
    expect(labels()).toEqual([
      'Not started',
      'In progress',
      'Done',
      'Late or held up: hatched and outlined',
      'Dashed outline: planned dates',
      'Thick orange border: critical path',
      'Milestone',
      'Delivery',
      'Today',
    ]);
  });

  it('hides the swatches from assistive technology', () => {
    setup();
    const swatches = document.querySelectorAll('svg');
    expect(swatches.length).toBe(9);
    swatches.forEach((svg) => expect(svg).toHaveAttribute('aria-hidden', 'true'));
  });

  it('notes how many done items the Done toggle hides', () => {
    setup({ doneHidden: 4, showDone: false });
    expect(screen.getByTestId('schedule-legend-done-hidden')).toHaveTextContent(
      '4 done items hidden',
    );
  });

  it('has no note when Done is shown or nothing was hidden', () => {
    const { unmount } = setup({ doneHidden: 4, showDone: true });
    expect(screen.queryByTestId('schedule-legend-done-hidden')).toBeNull();
    unmount();
    setup({ doneHidden: 0, showDone: false });
    expect(screen.queryByTestId('schedule-legend-done-hidden')).toBeNull();
  });
});

describe('GanttLegend sheet (under 768 px)', () => {
  beforeEach(() => media.set(PHONE, true));

  it('is a bottom sheet dialog titled Legend when open', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Legend' });
    expect(dialog).toHaveAttribute('id', 'legend-1');
    expect(dialog).toHaveTextContent('Dashed outline: planned dates');
  });

  it('exposes no dialog while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closing calls onClose', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId('schedule-legend-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

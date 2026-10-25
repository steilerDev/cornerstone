/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { makeBreakdown } from '../../test/breakdownFixtures.js';
import { BreakdownToolbar } from './BreakdownToolbar.js';
import type { BreakdownToolbarProps } from './BreakdownToolbar.js';
import type { BreakdownSettings } from './breakdownSettings.js';

const WIDE = '(min-width: 768px)';

const DEFAULTS: BreakdownSettings = {
  view: 'area',
  payment: 'all',
  estimate: 'expected',
  grants: false,
  deselected: new Set(),
};

let media: MatchMediaControl;

beforeEach(() => {
  media = installMatchMedia({ [WIDE]: true });
});

afterEach(() => {
  media.restore();
});

function renderToolbar(
  over: Partial<BreakdownToolbarProps> & { settings?: BreakdownSettings } = {},
) {
  const handlers = {
    onViewChange: jest.fn(),
    onPaymentChange: jest.fn(),
    onEstimateChange: jest.fn(),
    onGrantsChange: jest.fn(),
    onSourceToggle: jest.fn(),
    onSelectAllSources: jest.fn(),
  };
  const view = render(
    <MemoryRouter>
      <BreakdownToolbar breakdown={makeBreakdown()} settings={DEFAULTS} {...handlers} {...over} />
    </MemoryRouter>,
  );
  return { ...view, ...handlers };
}

const pressed = (el: HTMLElement) => el.getAttribute('aria-pressed');

describe('BreakdownToolbar', () => {
  describe('chip groups', () => {
    it('names the four view chips in a group "Break down by" and presses the current one', () => {
      renderToolbar({ settings: { ...DEFAULTS, view: 'category' } });
      const group = screen.getByRole('group', { name: 'Break down by' });
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Area', 'Type', 'Cost category', 'Funding source']);
      expect(pressed(screen.getByTestId('breakdown-view-category'))).toBe('true');
      expect(pressed(screen.getByTestId('breakdown-view-area'))).toBe('false');
    });

    it('names the payment chips in a group "Payment" and presses the current one', () => {
      renderToolbar({ settings: { ...DEFAULTS, payment: 'outstanding' } });
      const group = screen.getByRole('group', { name: 'Payment' });
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['All', 'Paid', 'Not yet paid']);
      expect(pressed(screen.getByTestId('breakdown-payment-outstanding'))).toBe('true');
    });

    it('labels the estimate chips by the visible text "Show estimates at"', () => {
      renderToolbar({ settings: { ...DEFAULTS, estimate: 'high' } });
      const group = screen.getByRole('group', { name: 'Show estimates at' });
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Low', 'Expected', 'High']);
      expect(pressed(screen.getByTestId('breakdown-estimate-high'))).toBe('true');
    });

    it('reports a clicked view, payment and estimate chip', async () => {
      const user = userEvent.setup();
      const { onViewChange, onPaymentChange, onEstimateChange } = renderToolbar();
      await user.click(screen.getByTestId('breakdown-view-source'));
      await user.click(screen.getByTestId('breakdown-payment-paid'));
      await user.click(screen.getByTestId('breakdown-estimate-low'));
      expect(onViewChange).toHaveBeenCalledWith('source');
      expect(onPaymentChange).toHaveBeenCalledWith('paid');
      expect(onEstimateChange).toHaveBeenCalledWith('low');
    });
  });

  describe('Show Grants', () => {
    it('offers a "Show" group with one Grants chip under All, not pressed by default', () => {
      renderToolbar();
      const group = screen.getByRole('group', { name: 'Show' });
      expect(within(group).getAllByRole('button')).toHaveLength(1);
      const chip = screen.getByTestId('breakdown-show-grants');
      expect(chip).toHaveTextContent('Grants');
      expect(pressed(chip)).toBe('false');
    });

    it('presses the chip when grants are on and reports the toggle both ways', async () => {
      const user = userEvent.setup();
      const off = renderToolbar();
      await user.click(screen.getByTestId('breakdown-show-grants'));
      expect(off.onGrantsChange).toHaveBeenCalledWith(true);
      off.unmount();

      const on = renderToolbar({ settings: { ...DEFAULTS, grants: true } });
      expect(pressed(screen.getByTestId('breakdown-show-grants'))).toBe('true');
      await user.click(screen.getByTestId('breakdown-show-grants'));
      expect(on.onGrantsChange).toHaveBeenCalledWith(false);
    });

    it.each(['paid', 'outstanding'] as const)('is hidden under %s', (payment) => {
      renderToolbar({ settings: { ...DEFAULTS, payment, grants: true } });
      expect(screen.queryByTestId('breakdown-show-grants')).toBeNull();
      expect(screen.queryByRole('group', { name: 'Show' })).toBeNull();
    });
  });

  describe('Funding source filter', () => {
    it('shows the label with a muted "n of N" and no active look when every source is on', () => {
      renderToolbar();
      const button = screen.getByTestId('breakdown-sources-button');
      expect(button).toHaveTextContent('Funding source');
      expect(button).toHaveTextContent('3 of 3');
      expect(button.className).not.toContain('sourceChipActive');
      expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('takes the active look and counts the selected sources when one is deselected', () => {
      renderToolbar({ settings: { ...DEFAULTS, deselected: new Set(['bs-b']) } });
      const button = screen.getByTestId('breakdown-sources-button');
      expect(button).toHaveTextContent('2 of 3');
      expect(button.className).toContain('sourceChipActive');
    });

    it('counts only sources and omits Unassigned when no line lacks a source', () => {
      renderToolbar({ breakdown: makeBreakdown({ hasUnassignedLines: false }) });
      expect(screen.getByTestId('breakdown-sources-button')).toHaveTextContent('2 of 2');
    });

    it('opens a dialog named Funding source with a checkbox per source and Unassigned last', async () => {
      const user = userEvent.setup();
      renderToolbar({ settings: { ...DEFAULTS, deselected: new Set(['bs-b']) } });
      await user.click(screen.getByTestId('breakdown-sources-button'));
      const dialog = screen.getByRole('dialog', { name: 'Funding source' });
      const boxes = within(dialog).getAllByRole('checkbox');
      expect(boxes.map((b) => b.getAttribute('data-testid'))).toEqual([
        'breakdown-source-bs-a',
        'breakdown-source-bs-b',
        'breakdown-source-unassigned',
      ]);
      expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, false, true]);
      expect(within(dialog).getByRole('checkbox', { name: 'Savings' })).toBeInTheDocument();
      expect(within(dialog).getByRole('checkbox', { name: 'Unassigned' })).toBeInTheDocument();
    });

    it('lists Unassigned while it is deselected even if no line lacks a source', async () => {
      const user = userEvent.setup();
      renderToolbar({
        breakdown: makeBreakdown({ hasUnassignedLines: false }),
        settings: { ...DEFAULTS, deselected: new Set(['unassigned']) },
      });
      await user.click(screen.getByTestId('breakdown-sources-button'));
      expect(screen.getByTestId('breakdown-source-unassigned')).not.toBeChecked();
    });

    it('reports the key of a clicked source checkbox', async () => {
      const user = userEvent.setup();
      const { onSourceToggle } = renderToolbar();
      await user.click(screen.getByTestId('breakdown-sources-button'));
      await user.click(screen.getByTestId('breakdown-source-bs-b'));
      await user.click(screen.getByTestId('breakdown-source-unassigned'));
      expect(onSourceToggle.mock.calls).toEqual([['bs-b'], ['unassigned']]);
    });

    it('keeps at least one selected: the last checked box is aria-disabled, described, and a no-op', async () => {
      const user = userEvent.setup();
      const { onSourceToggle } = renderToolbar({
        settings: { ...DEFAULTS, deselected: new Set(['bs-b', 'unassigned']) },
      });
      await user.click(screen.getByTestId('breakdown-sources-button'));
      const last = screen.getByTestId('breakdown-source-bs-a');
      expect(last).toBeChecked();
      expect(last).toHaveAttribute('aria-disabled', 'true');
      expect(last).not.toBeDisabled();
      expect(last).toHaveAccessibleDescription('Keep at least one funding source selected');
      await user.click(last);
      expect(onSourceToggle).not.toHaveBeenCalled();
      expect(last).toBeChecked();
      // The unchecked ones stay usable.
      await user.click(screen.getByTestId('breakdown-source-bs-b'));
      expect(onSourceToggle).toHaveBeenCalledWith('bs-b');
    });

    it('does not lock any box while two or more are selected', async () => {
      const user = userEvent.setup();
      renderToolbar();
      await user.click(screen.getByTestId('breakdown-sources-button'));
      for (const key of ['bs-a', 'bs-b', 'unassigned']) {
        const box = screen.getByTestId(`breakdown-source-${key}`);
        expect(box).not.toHaveAttribute('aria-disabled');
        expect(box).not.toHaveAttribute('aria-describedby');
      }
    });

    it('selects all from the panel footer and closes it with Done', async () => {
      const user = userEvent.setup();
      const { onSelectAllSources } = renderToolbar({
        settings: { ...DEFAULTS, deselected: new Set(['bs-b']) },
      });
      await user.click(screen.getByTestId('breakdown-sources-button'));
      await user.click(screen.getByRole('button', { name: 'Select all' }));
      expect(onSelectAllSources).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('breakdown-sources-button')).toHaveFocus();
    });

    it('uses a bottom sheet with Select all and Done below 768px', async () => {
      media.set(WIDE, false);
      const user = userEvent.setup();
      const { onSelectAllSources, onSourceToggle } = renderToolbar();
      await user.click(screen.getByTestId('breakdown-sources-button'));
      const sheet = screen.getByRole('dialog', { name: 'Funding source' });
      expect(sheet).toBe(screen.getByTestId('breakdown-sources-sheet'));
      await user.click(within(sheet).getByTestId('breakdown-source-bs-a'));
      expect(onSourceToggle).toHaveBeenCalledWith('bs-a');
      await user.click(screen.getByTestId('breakdown-sources-sheet-clear'));
      expect(onSelectAllSources).toHaveBeenCalledTimes(1);
      await user.click(screen.getByTestId('breakdown-sources-done'));
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('marks real source names as user text and the Unassigned fallback as plain text', async () => {
      const user = userEvent.setup();
      renderToolbar();
      await user.click(screen.getByTestId('breakdown-sources-button'));
      expect(screen.getByText('Savings').className).toContain('userText');
      expect(screen.getByText('Unassigned').className).not.toContain('userText');
    });
  });

  it('scrolls the chip groups below 768px and wraps them from 768px', () => {
    const layoutOf = (testId: string) =>
      screen.getByTestId(testId).closest('[data-layout]')?.getAttribute('data-layout');
    const wide = renderToolbar();
    expect(layoutOf('breakdown-view-area')).toBe('wrap');
    expect(layoutOf('breakdown-payment-all')).toBe('wrap');
    expect(layoutOf('breakdown-estimate-low')).toBe('wrap');
    wide.unmount();
    media.set(WIDE, false);
    renderToolbar();
    expect(layoutOf('breakdown-view-area')).toBe('scroll');
    expect(layoutOf('breakdown-payment-all')).toBe('scroll');
    expect(layoutOf('breakdown-estimate-low')).toBe('scroll');
    // Grants and the Funding source chip share the last row and always wrap.
    expect(layoutOf('breakdown-show-grants')).toBe('wrap');
  });

  it('has no duplicate test ids', async () => {
    const user = userEvent.setup();
    const { container } = renderToolbar();
    await user.click(screen.getByTestId('breakdown-sources-button'));
    expect(findDuplicateTestIds(document)).toEqual([]);
    expect(findDuplicateTestIds(container)).toEqual([]);
  });
});

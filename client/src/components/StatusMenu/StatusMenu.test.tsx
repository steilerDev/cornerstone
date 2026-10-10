/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type * as StatusMenuModule from './StatusMenu.js';
import type { StatusMenuProps, StatusMenuTransition } from './StatusMenu.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: jest.fn(() => ({
    locale: 'en' as const,
    resolvedLocale: 'en' as const,
    vatRate: 0.19,
    currency: 'EUR',
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  })),
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Loaded lazily: a static import would evaluate the real LocaleContext before the mock exists.
let StatusMenu: typeof StatusMenuModule.StatusMenu;

type S = 'a' | 'b' | 'c';

const VARIANTS = {
  a: { label: 'Alpha', className: 'variantA' },
  b: { label: 'Beta', className: 'variantB' },
  c: { label: 'Gamma' },
};

const TODAY = '2026-08-07';

const plain: StatusMenuTransition<S>[] = [
  { to: 'b', direction: 'forward', label: 'Mark beta' },
  { to: 'c', direction: 'forward', label: 'Mark gamma' },
  { to: 'a', direction: 'backward', label: 'Back to “Alpha”' },
];

const withDate = (date: StatusMenuTransition<S>['date']): StatusMenuTransition<S>[] => [
  { to: 'b', direction: 'forward', label: 'Mark beta', date },
  { to: 'c', direction: 'forward', label: 'Mark gamma' },
  { to: 'a', direction: 'backward', label: 'Back to “Alpha”' },
];

let desktop = true;

function installMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: desktop && query.includes('min-width: 1024px'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function fakeOnlyDate(now: Date) {
  jest.useFakeTimers({
    now,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'queueMicrotask',
      'nextTick',
      'performance',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
    ],
  } as never);
}

type Overrides = Partial<StatusMenuProps<S>>;

function renderMenu(overrides: Overrides = {}) {
  const onApply = jest.fn<StatusMenuProps<S>['onApply']>().mockResolvedValue(undefined);
  const props: StatusMenuProps<S> = {
    transitions: plain,
    badge: { variants: VARIANTS, value: 'a' },
    currentLabel: 'Alpha',
    onApply,
    testId: 'sm',
    ...overrides,
  };
  const utils = render(
    <MemoryRouter>
      <StatusMenu {...props} />
    </MemoryRouter>,
  );
  return { ...utils, onApply: props.onApply as typeof onApply, props };
}

function open() {
  fireEvent.click(screen.getByTestId('sm'));
}

function rows() {
  return screen.getAllByRole('menuitem');
}

beforeEach(async () => {
  if (!StatusMenu) StatusMenu = (await import('./StatusMenu.js')).StatusMenu;
  desktop = true;
  installMatchMedia();
  fakeOnlyDate(new Date(2026, 7, 7, 12, 0, 0));
});

afterEach(() => {
  jest.useRealTimers();
  delete document.documentElement.dataset.scrollLocked;
  document.body.innerHTML = '';
});

describe('StatusMenu', () => {
  describe('plain badge', () => {
    it('renders a non-interactive Badge when no transition is allowed', () => {
      renderMenu({ transitions: [] });
      const badge = screen.getByTestId('sm');
      expect(badge.tagName).toBe('SPAN');
      expect(badge).toHaveTextContent('Alpha');
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  describe('chip trigger', () => {
    it('shows the current label and is a menu button whose name equals its text', () => {
      renderMenu();
      const trigger = screen.getByRole('button', { name: 'Alpha' });
      expect(trigger).toBe(screen.getByTestId('sm'));
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveClass('variantA');
    });

    it('describes itself with "Change status" without changing the name', () => {
      renderMenu();
      const trigger = screen.getByTestId('sm');
      expect(trigger).toHaveAccessibleName('Alpha');
      expect(trigger).toHaveAccessibleDescription('Change status');
    });

    it('opens a menu with the header and the rows, forward before backward', () => {
      renderMenu();
      open();
      const trigger = screen.getByTestId('sm');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const panel = screen.getByRole('menu');
      expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
      expect(screen.getByText('Now: Alpha')).toBeInTheDocument();
      expect(rows().map((r) => r.textContent)).toEqual([
        'Mark beta',
        'Mark gamma',
        'Back to “Alpha”',
      ]);
      expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('moves focus to the first row on open', () => {
      renderMenu();
      open();
      expect(rows()[0]).toHaveFocus();
    });

    it('draws no separator when only one direction is offered', () => {
      renderMenu({ transitions: [plain[0]!, plain[1]!] });
      open();
      expect(screen.queryByRole('separator')).toBeNull();
    });

    it('clicking the trigger again closes the menu and keeps focus on it', () => {
      renderMenu();
      open();
      fireEvent.click(screen.getByTestId('sm'));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByTestId('sm')).toHaveFocus();
    });
  });

  describe('applying a transition', () => {
    it('applies a row without a date step at once, with no date', async () => {
      const { onApply } = renderMenu();
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', null));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes the surface and returns focus to the trigger while the request runs', async () => {
      let resolve!: () => void;
      const onApply = jest.fn<StatusMenuProps<S>['onApply']>(
        () => new Promise<void>((r) => (resolve = r)),
      );
      renderMenu({ onApply });
      open();
      fireEvent.click(screen.getByTestId('sm-option-c'));
      expect(screen.queryByRole('menu')).toBeNull();
      await act(async () => resolve());
      expect(screen.getByTestId('sm')).toHaveFocus();
    });

    it('is busy while the request runs: aria-disabled (never disabled) and further clicks are ignored', async () => {
      let resolve!: () => void;
      const onApply = jest.fn<StatusMenuProps<S>['onApply']>(
        () => new Promise<void>((r) => (resolve = r)),
      );
      renderMenu({ onApply });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      const trigger = screen.getByTestId('sm');
      expect(trigger).toHaveAttribute('aria-disabled', 'true');
      expect(trigger).toHaveAttribute('aria-busy', 'true');
      expect(trigger).not.toBeDisabled();

      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(onApply).toHaveBeenCalledTimes(1);

      await act(async () => resolve());
      expect(trigger).not.toHaveAttribute('aria-disabled');
      expect(trigger).not.toHaveAttribute('aria-busy');
    });

    it('goes idle again when onApply rejects, without an unhandled rejection', async () => {
      const onApply = jest.fn<StatusMenuProps<S>['onApply']>().mockRejectedValue(new Error('boom'));
      renderMenu({ onApply });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      await waitFor(() => expect(screen.getByTestId('sm')).not.toHaveAttribute('aria-busy'));
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('closes without applying when the row equals the current status', async () => {
      const { onApply } = renderMenu({
        transitions: [{ to: 'a', direction: 'backward', label: 'Back to “Alpha”' }],
      });
      open();
      fireEvent.click(screen.getByTestId('sm-option-a'));
      expect(onApply).not.toHaveBeenCalled();
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('date step', () => {
    it('shows a chevron and aria-haspopup=dialog only on rows with a date step', () => {
      renderMenu({ transitions: withDate({ question: 'When?' }) });
      open();
      expect(screen.getByTestId('sm-option-b')).toHaveAttribute('aria-haspopup', 'dialog');
      expect(screen.getByTestId('sm-option-b')).toHaveTextContent('›');
      expect(screen.getByTestId('sm-option-c')).not.toHaveAttribute('aria-haspopup');
      expect(screen.getByTestId('sm-option-c')).not.toHaveTextContent('›');
    });

    it('opens the question as a dialog and focuses Today', () => {
      renderMenu({ transitions: withDate({ question: 'When did it start?' }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      const dialog = screen.getByRole('dialog', { name: 'When did it start?' });
      expect(dialog).toHaveTextContent('When did it start?');
      expect(screen.getByTestId('sm-date-today')).toHaveFocus();
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('Today applies at once with the local date', async () => {
      const { onApply } = renderMenu({ transitions: withDate({ question: 'When?' }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      fireEvent.click(screen.getByTestId('sm-date-today'));
      await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', TODAY));
    });

    it('offers the planned chip with its date when the plan lies in the past', async () => {
      const { onApply } = renderMenu({
        transitions: withDate({ question: 'When?', plannedDate: '2026-08-01' }),
      });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      const planned = screen.getByTestId('sm-date-planned');
      expect(planned).toHaveTextContent('As planned');
      expect(planned.getAttribute('aria-label')).toMatch(/^As planned, .*2026/);
      fireEvent.click(planned);
      await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', '2026-08-01'));
    });

    it('uses the custom planned label', () => {
      renderMenu({
        transitions: withDate({
          question: 'When?',
          plannedDate: '2026-08-01',
          plannedLabel: 'On target',
        }),
      });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      expect(screen.getByTestId('sm-date-planned')).toHaveTextContent('On target');
    });

    it.each([
      ['null', null],
      ['empty', ''],
      ['today', TODAY],
      ['in the future', '2026-08-08'],
    ])('hides the planned chip when the plan is %s', (_name, plannedDate) => {
      renderMenu({ transitions: withDate({ question: 'When?', plannedDate }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      expect(screen.queryByTestId('sm-date-planned')).toBeNull();
      expect(screen.getByTestId('sm-date-today')).toBeInTheDocument();
    });

    it('hides the planned chip when no planned date is configured at all', () => {
      renderMenu({ transitions: withDate({ question: 'When?' }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      expect(screen.queryByTestId('sm-date-planned')).toBeNull();
    });

    it('computes "today" when the step opens, not when the component mounted', () => {
      renderMenu({ transitions: withDate({ question: 'When?', plannedDate: '2026-08-08' }) });
      jest.setSystemTime(new Date(2026, 7, 9, 12, 0, 0));
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      // The plan (08-08) is now in the past relative to 08-09.
      expect(screen.getByTestId('sm-date-planned')).toBeInTheDocument();
    });

    describe('Pick a date', () => {
      function openPick(date: StatusMenuTransition<S>['date'] = { question: 'When?' }) {
        const utils = renderMenu({ transitions: withDate(date) });
        open();
        fireEvent.click(screen.getByTestId('sm-option-b'));
        fireEvent.click(screen.getByTestId('sm-date-pick'));
        return utils;
      }

      it('reveals a date input that is focused, capped at today and floored at minDate', () => {
        openPick({ question: 'When?', minDate: '2026-08-03' });
        const input = screen.getByTestId('sm-date-input');
        expect(input).toHaveFocus();
        expect(input).toHaveAttribute('type', 'date');
        expect(input).toHaveAttribute('max', TODAY);
        expect(input).toHaveAttribute('min', '2026-08-03');
        expect(screen.getByTestId('sm-date-pick')).toHaveAttribute('aria-expanded', 'true');
      });

      it('has no min attribute without a minDate', () => {
        openPick();
        expect(screen.getByTestId('sm-date-input')).not.toHaveAttribute('min');
      });

      it('applies a valid date', async () => {
        const { onApply } = openPick();
        fireEvent.change(screen.getByTestId('sm-date-input'), { target: { value: '2026-08-05' } });
        fireEvent.click(screen.getByTestId('sm-date-set'));
        await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', '2026-08-05'));
      });

      it('applies today itself (the upper bound is inclusive)', async () => {
        const { onApply } = openPick();
        fireEvent.change(screen.getByTestId('sm-date-input'), { target: { value: TODAY } });
        fireEvent.click(screen.getByTestId('sm-date-set'));
        await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', TODAY));
      });

      it('rejects a date after today with an inline error and does not apply', () => {
        const { onApply } = openPick();
        const input = screen.getByTestId('sm-date-input');
        fireEvent.change(input, { target: { value: '2026-08-08' } });
        fireEvent.click(screen.getByTestId('sm-date-set'));
        expect(screen.getByText('Pick a date on or before today.')).toBeInTheDocument();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(onApply).not.toHaveBeenCalled();
      });

      it('rejects a date before minDate with an inline error and does not apply', () => {
        const { onApply } = openPick({ question: 'When?', minDate: '2026-08-03' });
        fireEvent.change(screen.getByTestId('sm-date-input'), { target: { value: '2026-08-02' } });
        fireEvent.click(screen.getByTestId('sm-date-set'));
        expect(screen.getByText('Pick a date on or after the start date.')).toBeInTheDocument();
        expect(onApply).not.toHaveBeenCalled();
      });

      it('accepts exactly minDate (the lower bound is inclusive)', async () => {
        const { onApply } = openPick({ question: 'When?', minDate: '2026-08-03' });
        fireEvent.change(screen.getByTestId('sm-date-input'), { target: { value: '2026-08-03' } });
        fireEvent.click(screen.getByTestId('sm-date-set'));
        await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', '2026-08-03'));
      });

      it('clears the error as soon as the value changes', () => {
        openPick();
        const input = screen.getByTestId('sm-date-input');
        fireEvent.change(input, { target: { value: '2026-08-08' } });
        fireEvent.click(screen.getByTestId('sm-date-set'));
        fireEvent.change(input, { target: { value: '2026-08-05' } });
        expect(screen.queryByText('Pick a date on or before today.')).toBeNull();
        expect(input).not.toHaveAttribute('aria-invalid');
      });

      it('does nothing when Set date is pressed with no value', () => {
        const { onApply } = openPick();
        fireEvent.click(screen.getByTestId('sm-date-set'));
        expect(onApply).not.toHaveBeenCalled();
        expect(screen.queryByText('Pick a date on or before today.')).toBeNull();
      });

      it('submits on Enter inside the input', async () => {
        const { onApply } = openPick();
        const input = screen.getByTestId('sm-date-input');
        fireEvent.change(input, { target: { value: '2026-08-05' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', '2026-08-05'));
      });
    });

    describe('leaving the step', () => {
      it('Back returns to the list with focus on the row that opened the step', () => {
        renderMenu({ transitions: withDate({ question: 'When?' }) });
        open();
        fireEvent.click(screen.getByTestId('sm-option-b'));
        fireEvent.click(screen.getByTestId('sm-back'));
        expect(screen.getByRole('menu')).toBeInTheDocument();
        expect(screen.getByTestId('sm-option-b')).toHaveFocus();
      });

      it('Escape in the step closes the surface and returns focus to the trigger', () => {
        const { onApply } = renderMenu({ transitions: withDate({ question: 'When?' }) });
        open();
        fireEvent.click(screen.getByTestId('sm-option-b'));
        fireEvent.keyDown(screen.getByTestId('sm-date-today'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByTestId('sm')).toHaveFocus();
        expect(onApply).not.toHaveBeenCalled();
      });

      it('reopening after a dismissal starts at the list again, with the pick closed', () => {
        renderMenu({ transitions: withDate({ question: 'When?' }) });
        open();
        fireEvent.click(screen.getByTestId('sm-option-b'));
        fireEvent.click(screen.getByTestId('sm-date-pick'));
        fireEvent.mouseDown(document.body);
        open();
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('sm-option-b'));
        expect(screen.queryByTestId('sm-date-input')).toBeNull();
        expect(screen.getByTestId('sm-date-pick')).toHaveAttribute('aria-expanded', 'false');
      });
    });
  });

  describe('keyboard', () => {
    it('ArrowDown on the trigger opens the menu on the first row', () => {
      renderMenu();
      fireEvent.keyDown(screen.getByTestId('sm'), { key: 'ArrowDown' });
      expect(rows()[0]).toHaveFocus();
    });

    it('ArrowUp on the trigger opens the menu on the last row', () => {
      renderMenu();
      fireEvent.keyDown(screen.getByTestId('sm'), { key: 'ArrowUp' });
      expect(rows()[2]).toHaveFocus();
    });

    it('Enter / Space (a native click) opens on the first row', () => {
      renderMenu();
      fireEvent.click(screen.getByTestId('sm'));
      expect(rows()[0]).toHaveFocus();
    });

    it('ArrowDown and ArrowUp move between rows and wrap around', () => {
      renderMenu();
      open();
      fireEvent.keyDown(rows()[0]!, { key: 'ArrowDown' });
      expect(rows()[1]).toHaveFocus();
      fireEvent.keyDown(rows()[1]!, { key: 'ArrowDown' });
      expect(rows()[2]).toHaveFocus();
      fireEvent.keyDown(rows()[2]!, { key: 'ArrowDown' });
      expect(rows()[0]).toHaveFocus();
      fireEvent.keyDown(rows()[0]!, { key: 'ArrowUp' });
      expect(rows()[2]).toHaveFocus();
      fireEvent.keyDown(rows()[2]!, { key: 'ArrowUp' });
      expect(rows()[1]).toHaveFocus();
    });

    it('Home and End jump to the first and last rows', () => {
      renderMenu();
      open();
      fireEvent.keyDown(rows()[0]!, { key: 'End' });
      expect(rows()[2]).toHaveFocus();
      fireEvent.keyDown(rows()[2]!, { key: 'Home' });
      expect(rows()[0]).toHaveFocus();
    });

    it('Escape closes and returns focus to the trigger', () => {
      renderMenu();
      open();
      fireEvent.keyDown(rows()[0]!, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByTestId('sm')).toHaveFocus();
    });

    it('Tab closes and continues from the trigger', () => {
      renderMenu();
      open();
      fireEvent.keyDown(rows()[1]!, { key: 'Tab' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByTestId('sm')).toHaveFocus();
    });

    it('keys typed in the menu do not leak to ancestors', () => {
      const outer = jest.fn();
      const { baseElement } = renderMenu();
      baseElement.addEventListener('keydown', outer);
      open();
      fireEvent.keyDown(rows()[0]!, { key: 'ArrowDown' });
      expect(outer).not.toHaveBeenCalled();
      baseElement.removeEventListener('keydown', outer);
    });
  });

  describe('dismissal', () => {
    it('an outside press closes the menu', () => {
      renderMenu();
      open();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('a press on the trigger is not an outside press', () => {
      renderMenu();
      open();
      fireEvent.mouseDown(screen.getByTestId('sm'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('a route change while open closes the menu', async () => {
      function Host() {
        const navigate = useNavigate();
        return (
          <>
            <button type="button" onClick={() => navigate('/elsewhere')}>
              go
            </button>
            <StatusMenu<S>
              transitions={plain}
              badge={{ variants: VARIANTS, value: 'a' }}
              currentLabel="Alpha"
              onApply={async () => {}}
              testId="sm"
            />
          </>
        );
      }
      render(
        <MemoryRouter>
          <Host />
        </MemoryRouter>,
      );
      open();
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.click(screen.getByText('go'));
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    });
  });

  describe('button appearance', () => {
    it('is a plain button labelled "Set status" by default, without the status icon', () => {
      renderMenu({ appearance: 'button' });
      const trigger = screen.getByRole('button', { name: 'Set status' });
      expect(trigger).not.toHaveClass('variantA');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('uses buttonLabel and opens the same menu', () => {
      renderMenu({ appearance: 'button', buttonLabel: 'Update' });
      fireEvent.click(screen.getByRole('button', { name: 'Update' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('ArrowDown also opens a button appearance', () => {
      renderMenu({ appearance: 'button' });
      fireEvent.keyDown(screen.getByTestId('sm'), { key: 'ArrowDown' });
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });

  describe('action appearance', () => {
    it('shows the label of the chosen transition and applies a dateless one on click', async () => {
      const { onApply } = renderMenu({ appearance: 'action', actionTo: 'b' });
      const trigger = screen.getByRole('button', { name: 'Mark beta' });
      expect(trigger).not.toHaveAttribute('aria-haspopup');
      fireEvent.click(trigger);
      await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', null));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('opens the date step directly (no list, no Back) for a dated transition', () => {
      renderMenu({
        appearance: 'action',
        actionTo: 'b',
        transitions: withDate({ question: 'When did it arrive?' }),
      });
      const trigger = screen.getByTestId('sm');
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
      fireEvent.click(trigger);
      expect(screen.getByRole('dialog', { name: 'When did it arrive?' })).toBeInTheDocument();
      expect(screen.queryByTestId('sm-back')).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('ignores the arrow keys (no list to open)', () => {
      renderMenu({ appearance: 'action', actionTo: 'b' });
      fireEvent.keyDown(screen.getByTestId('sm'), { key: 'ArrowDown' });
      fireEvent.keyDown(screen.getByTestId('sm'), { key: 'ArrowUp' });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('does nothing when actionTo is not an allowed transition', () => {
      const { onApply } = renderMenu({
        appearance: 'action',
        actionTo: 'c',
        transitions: [plain[0]!],
      });
      fireEvent.click(screen.getByTestId('sm'));
      expect(onApply).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('phone sheet', () => {
    beforeEach(() => {
      desktop = false;
      installMatchMedia();
    });

    it('opens the list in a Sheet titled "Change status" with menu rows', () => {
      renderMenu();
      open();
      const sheet = screen.getByRole('dialog', { name: 'Change status' });
      expect(sheet).toBe(screen.getByTestId('sm-panel'));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      expect(rows()).toHaveLength(3);
    });

    it('titles the sheet with the question on the date step and applies Today', async () => {
      const { onApply } = renderMenu({ transitions: withDate({ question: 'When did it start?' }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      expect(screen.getByRole('dialog', { name: 'When did it start?' })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('sm-date-today'));
      await waitFor(() => expect(onApply).toHaveBeenCalledWith('b', TODAY));
    });

    it('closing the sheet returns focus to the trigger', () => {
      renderMenu();
      open();
      fireEvent.click(screen.getByTestId('sm-panel-close'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('sm')).toHaveFocus();
    });
  });

  describe.each([
    ['desktop popover', true],
    ['phone sheet', false],
  ])('menu structure (%s)', (_name, isDesktop) => {
    beforeEach(() => {
      desktop = isDesktop;
      installMatchMedia();
    });

    it('the menu holds only menuitems and separators; the header sits outside it', () => {
      renderMenu();
      open();
      const menu = screen.getByRole('menu');
      const children = Array.from(menu.children);
      expect(children.length).toBeGreaterThan(0);
      for (const child of children) {
        expect(['menuitem', 'separator']).toContain(child.getAttribute('role'));
      }
      const header = screen.getByText('Now: Alpha');
      expect(menu.contains(header)).toBe(false);
    });

    it('the menu is labelled by the header', () => {
      renderMenu();
      open();
      const menu = screen.getByRole('menu');
      const header = screen.getByText('Now: Alpha');
      expect(header.id).not.toBe('');
      expect(menu).toHaveAttribute('aria-labelledby', header.id);
      expect(menu).toHaveAccessibleName('Now: Alpha');
    });

    it('aria-controls is the menu id in the list step', () => {
      renderMenu();
      open();
      const menu = screen.getByRole('menu');
      expect(menu.id).not.toBe('');
      expect(screen.getByTestId('sm')).toHaveAttribute('aria-controls', menu.id);
    });

    it('aria-controls is the panel id in the date step', () => {
      renderMenu({ transitions: withDate({ question: 'When?' }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      const controls = screen.getByTestId('sm').getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      const target = document.getElementById(controls!);
      expect(target).toBe(screen.getByTestId('sm-panel'));
      expect(target).toBe(screen.getByRole('dialog', { name: 'When?' }));
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('has no aria-controls while closed', () => {
      renderMenu();
      expect(screen.getByTestId('sm')).not.toHaveAttribute('aria-controls');
    });
  });

  describe('aria-haspopup per appearance', () => {
    it.each(['chip', 'button'] as const)('%s opens a menu', (appearance) => {
      renderMenu({ appearance });
      expect(screen.getByTestId('sm')).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('action that opens the date step announces a dialog', () => {
      renderMenu({
        appearance: 'action',
        actionTo: 'b',
        transitions: withDate({ question: 'When?' }),
      });
      expect(screen.getByTestId('sm')).toHaveAttribute('aria-haspopup', 'dialog');
    });

    it('action that applies at once has no popup', () => {
      renderMenu({ appearance: 'action', actionTo: 'b' });
      expect(screen.getByTestId('sm')).not.toHaveAttribute('aria-haspopup');
    });
  });

  describe('Pick a date chip toggles (#2209 UX)', () => {
    function openStep() {
      renderMenu({ transitions: withDate({ question: 'When?' }) });
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
    }

    it('a second press collapses the field', () => {
      openStep();
      const pick = screen.getByTestId('sm-date-pick');
      fireEvent.click(pick);
      expect(screen.getByTestId('sm-date-input')).toBeInTheDocument();
      expect(pick).toHaveAttribute('aria-expanded', 'true');
      fireEvent.click(pick);
      expect(screen.queryByTestId('sm-date-input')).toBeNull();
      expect(pick).toHaveAttribute('aria-expanded', 'false');
    });

    it('collapsing clears a field error so reopening starts clean', () => {
      openStep();
      const pick = screen.getByTestId('sm-date-pick');
      fireEvent.click(pick);
      fireEvent.change(screen.getByTestId('sm-date-input'), { target: { value: '2026-08-08' } });
      fireEvent.click(screen.getByTestId('sm-date-set'));
      expect(screen.getByText('Pick a date on or before today.')).toBeInTheDocument();

      fireEvent.click(pick);
      fireEvent.click(pick);
      expect(screen.queryByText('Pick a date on or before today.')).toBeNull();
      expect(screen.getByTestId('sm-date-input')).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('phone sheet stays mounted (#2209 UX)', () => {
    beforeEach(() => {
      desktop = false;
      installMatchMedia();
    });

    it('closed: the sheet is inert with no dialog role, but its rows keep their test ids', () => {
      renderMenu();
      const panel = screen.getByTestId('sm-panel');
      expect(panel).toHaveAttribute('inert');
      expect(panel).not.toHaveAttribute('role');
      expect(screen.queryByRole('dialog')).toBeNull();
      // The content is mounted but sits inside the inert panel, so it is not reachable.
      expect(screen.getByTestId('sm-option-b').closest('[inert]')).toBe(panel);
    });

    it('open: a dialog while open, and inert again after closing', () => {
      renderMenu();
      open();
      const panel = screen.getByTestId('sm-panel');
      expect(panel).not.toHaveAttribute('inert');
      expect(panel).toHaveAttribute('role', 'dialog');
      expect(screen.getByRole('menu')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('sm-panel-close'));
      expect(screen.getByTestId('sm-panel')).toHaveAttribute('inert');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.getByTestId('sm-option-b')).toBeInTheDocument();
    });

    it('the desktop popover, in contrast, is not mounted while closed', () => {
      desktop = true;
      installMatchMedia();
      renderMenu();
      expect(screen.queryByTestId('sm-panel')).toBeNull();
      expect(screen.queryByTestId('sm-option-b')).toBeNull();
    });
  });

  describe('desktop popover', () => {
    it('renders in an anchored panel, not a sheet', () => {
      renderMenu();
      open();
      // The panel is plain content; the menu role lives on the inner list.
      expect(screen.getByTestId('sm-panel')).not.toHaveAttribute('role');
      expect(screen.getByTestId('sm-panel')).toContainElement(screen.getByRole('menu'));
      expect(screen.queryByTestId('sm-panel-close')).toBeNull();
    });
  });

  describe('focus when the control turns into a plain Badge', () => {
    function Host({ useFallback }: { useFallback: boolean }) {
      const [transitions, setTransitions] = useState(plain);
      const fallbackRef = useRef<HTMLButtonElement>(null);
      return (
        <MemoryRouter>
          <main>
            <h1>Page heading</h1>
            <button ref={fallbackRef} type="button">
              fallback
            </button>
            <StatusMenu<S>
              transitions={transitions}
              badge={{ variants: VARIANTS, value: 'a' }}
              currentLabel="Alpha"
              focusFallbackRef={useFallback ? fallbackRef : undefined}
              onApply={async () => {
                setTransitions([]);
              }}
              testId="sm"
            />
          </main>
        </MemoryRouter>
      );
    }

    it('moves focus to focusFallbackRef instead of <body>', async () => {
      render(<Host useFallback />);
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'fallback' })).toHaveFocus());
      expect(screen.getByTestId('sm').tagName).toBe('SPAN');
    });

    it('falls back to the page heading when there is no fallback ref', async () => {
      render(<Host useFallback={false} />);
      open();
      fireEvent.click(screen.getByTestId('sm-option-b'));
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Page heading' })).toHaveFocus(),
      );
    });
  });
});

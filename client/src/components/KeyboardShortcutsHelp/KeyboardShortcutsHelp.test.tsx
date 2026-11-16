/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp.js';
import type { KeyboardShortcutsHelpProps } from './KeyboardShortcutsHelp.js';
import type { RegisteredShortcut, ShortcutGroup } from '../../hooks/shortcutRegistry.js';

// The overlay renders through the shared Modal (dialog role, aria-modal, backdrop, Escape and the
// focus trap are covered by Modal.test.tsx). These tests cover the groups, rows, key caps, the
// "turned off" marking and the footer switch (#2253).

const row = (key: string, description: string, group: ShortcutGroup): RegisteredShortcut => ({
  key,
  description,
  group,
  handler: () => {},
});

const PAGE = [row('e', 'Edit this task', 'page'), row('Delete', 'Delete this task', 'page')];
const GLOBAL = [
  row('Mod+z', 'Undo the last change', 'global'),
  row('?', 'Show keyboard shortcuts', 'global'),
  row('n', 'Open the New menu', 'global'),
  row('/', 'Search this list', 'global'),
  row('Escape', 'Close the open dialog, menu or search', 'global'),
  row('Mod+k', 'Search everywhere', 'global'),
];
const GO_TO = [row('g s', 'Go to Schedule', 'goTo'), row('g h', 'Go to Home', 'goTo')];
const ALL = [...PAGE, ...GLOBAL, ...GO_TO];

function renderHelp(overrides: Partial<KeyboardShortcutsHelpProps> = {}) {
  const props: KeyboardShortcutsHelpProps = {
    shortcuts: ALL,
    singleKeyEnabled: true,
    onSingleKeyEnabledChange: () => {},
    onClose: () => {},
    ...overrides,
  };
  return render(<KeyboardShortcutsHelp {...props} />);
}

const rowKeys = (table: HTMLElement) =>
  within(table)
    .getAllByTestId('keyboard-shortcut-row')
    .map((r) => r.getAttribute('data-key'));

describe('KeyboardShortcutsHelp', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders inside a Modal titled "Keyboard shortcuts" with dialog semantics, portalled to body', () => {
    const { baseElement } = renderHelp();
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(baseElement.querySelector('[role="dialog"]')).toBe(dialog);
  });

  it('shows three group headings in the order On this page, Everywhere, Go to', () => {
    renderHelp();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'On this page',
      'Everywhere',
      'Go to',
    ]);
  });

  it('labels each table with its heading and renders no table header', () => {
    renderHelp();
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(3);
    expect(tables[0]).toHaveAccessibleName('On this page');
    expect(tables[1]).toHaveAccessibleName('Everywhere');
    expect(tables[2]).toHaveAccessibleName('Go to');
    for (const table of tables) {
      expect(table.querySelector('thead')).toBeNull();
      expect(within(table).queryAllByRole('columnheader')).toHaveLength(0);
    }
  });

  it('lists each group rows in its own table', () => {
    renderHelp();
    const [page, everywhere, goTo] = screen.getAllByRole('table');
    expect(rowKeys(page!)).toEqual(['e', 'Delete']);
    expect(rowKeys(everywhere!)).toHaveLength(6);
    expect(rowKeys(goTo!)).toEqual(['g s', 'g h']);
    expect(within(page!).getByText('Edit this task')).toBeInTheDocument();
    expect(within(goTo!).getByText('Go to Schedule')).toBeInTheDocument();
  });

  it('orders Everywhere as search, slash, n, ?, Esc, undo even when registered differently', () => {
    renderHelp();
    expect(rowKeys(screen.getAllByRole('table')[1]!)).toEqual([
      'Mod+k',
      '/',
      'n',
      '?',
      'Escape',
      'Mod+z',
    ]);
  });

  it('shows the empty state under the On this page heading when the page registered nothing', () => {
    renderHelp({ shortcuts: [...GLOBAL, ...GO_TO] });
    expect(screen.getByRole('heading', { name: 'On this page' })).toBeInTheDocument();
    expect(screen.getByText('This page has no shortcuts of its own.')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });

  it('treats page shortcuts without a description as empty and hides blank rows', () => {
    renderHelp({
      shortcuts: [...PAGE, row('Backspace', '', 'page')],
    });
    expect(rowKeys(screen.getAllByRole('table')[0]!)).toEqual(['e', 'Delete']);
    renderHelp({ shortcuts: [row('x', '', 'page')] });
    expect(screen.getAllByText('This page has no shortcuts of its own.')).toHaveLength(1);
  });

  it('omits the Everywhere and Go to groups when they have no rows', () => {
    renderHelp({ shortcuts: PAGE });
    expect(screen.queryByRole('heading', { name: 'Everywhere' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Go to' })).toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('renders a sequence as two kbd caps with a "then" span between them', () => {
    renderHelp();
    const sequence = screen
      .getAllByTestId('keyboard-shortcut-row')
      .find((r) => r.dataset.key === 'g s')!;
    const keyCell = sequence.querySelector('td')!;
    const kbds = keyCell.querySelectorAll('kbd');
    expect(kbds).toHaveLength(2);
    expect(kbds[0]).toHaveTextContent('g');
    expect(kbds[1]).toHaveTextContent('s');
    const then = keyCell.querySelector('span:not([aria-hidden])')!;
    expect(then).toHaveTextContent('then');
    expect(kbds[0]!.nextElementSibling).toBe(then);
    expect(then.nextElementSibling).toBe(kbds[1]);
  });

  it('gives symbol caps screen-reader names', () => {
    renderHelp();
    const everywhere = screen.getAllByRole('table')[1]!;
    const cell = (key: string) =>
      within(everywhere)
        .getAllByTestId('keyboard-shortcut-row')
        .find((r) => r.dataset.key === key)!
        .querySelector('td')!;
    expect(cell('?')).toHaveTextContent('Question mark');
    expect(cell('/')).toHaveTextContent('Slash');
    expect(cell('Escape')).toHaveTextContent('Escape');
    expect(cell('Escape').querySelector('[aria-hidden="true"]')).toHaveTextContent('Esc');
    expect(cell('n').querySelector('[aria-hidden]')).toBeNull();
  });

  describe('platform key caps', () => {
    const platformSpy = () => jest.spyOn(navigator, 'platform', 'get');

    it('shows Ctrl K and Ctrl Z without spoken names on non-Apple platforms', () => {
      platformSpy().mockReturnValue('Win32');
      renderHelp();
      const everywhere = screen.getAllByRole('table')[1]!;
      expect(within(everywhere).getByText('Ctrl K')).toBeInTheDocument();
      expect(within(everywhere).getByText('Ctrl Z')).toBeInTheDocument();
      expect(within(everywhere).queryByText('⌘K')).toBeNull();
      expect(within(everywhere).queryByText('Command K')).toBeNull();
    });

    it('shows ⌘K and ⌘Z with spoken names on Apple platforms', () => {
      platformSpy().mockReturnValue('MacIntel');
      renderHelp();
      const everywhere = screen.getAllByRole('table')[1]!;
      expect(within(everywhere).getByText('⌘K')).toBeInTheDocument();
      expect(within(everywhere).getByText('⌘Z')).toBeInTheDocument();
      expect(within(everywhere).getByText('Command K')).toBeInTheDocument();
      expect(within(everywhere).getByText('Command Z')).toBeInTheDocument();
      expect(within(everywhere).queryByText('Ctrl K')).toBeNull();
    });
  });

  describe('single-key switch', () => {
    it('renders a labelled switch in the footer, checked while on', () => {
      renderHelp();
      const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
      expect(toggle).toBeChecked();
    });

    it('is unchecked while off', () => {
      renderHelp({ singleKeyEnabled: false });
      expect(screen.getByRole('switch', { name: 'Single-key shortcuts' })).not.toBeChecked();
    });

    it('reports the new value on click and on the keyboard (Space)', async () => {
      const onChange = jest.fn<(enabled: boolean) => void>();
      renderHelp({ onSingleKeyEnabledChange: onChange });
      const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
      await userEvent.click(toggle);
      expect(onChange).toHaveBeenLastCalledWith(false);
      toggle.focus();
      await userEvent.keyboard(' ');
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('reports true when turning a switched-off preference back on', async () => {
      const onChange = jest.fn<(enabled: boolean) => void>();
      renderHelp({ singleKeyEnabled: false, onSingleKeyEnabledChange: onChange });
      await userEvent.click(screen.getByRole('switch', { name: 'Single-key shortcuts' }));
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('marks no row as turned off while on', () => {
      renderHelp();
      expect(screen.queryAllByTestId('keyboard-shortcut-off')).toHaveLength(0);
      expect(document.querySelectorAll('[data-off]')).toHaveLength(0);
    });

    it('marks the single-key rows (/, n, ?, e, g s, g h) turned off and keeps Delete, Esc, chords on', () => {
      renderHelp({ singleKeyEnabled: false });
      const rows = screen.getAllByTestId('keyboard-shortcut-row');
      const off = rows.filter((r) => r.hasAttribute('data-off')).map((r) => r.dataset.key);
      expect(off.sort()).toEqual(['/', '?', 'e', 'g h', 'g s', 'n']);
      const on = rows.filter((r) => !r.hasAttribute('data-off')).map((r) => r.dataset.key);
      expect(on.sort()).toEqual(['Delete', 'Escape', 'Mod+k', 'Mod+z']);
      const badges = screen.getAllByTestId('keyboard-shortcut-off');
      expect(badges).toHaveLength(6);
      for (const badge of badges) expect(badge).toHaveTextContent('Turned off');
      for (const r of rows.filter((x) => !x.hasAttribute('data-off'))) {
        expect(within(r).queryByTestId('keyboard-shortcut-off')).toBeNull();
      }
    });
  });

  describe('Modal wiring', () => {
    it('calls onClose for Escape, the close button and the backdrop', async () => {
      const onClose = jest.fn<() => void>();
      renderHelp({ onClose });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onClose).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
      expect(onClose).toHaveBeenCalledTimes(2);
      await userEvent.click(document.querySelector('[class*="modalBackdrop"]')!);
      expect(onClose).toHaveBeenCalledTimes(3);
    });
  });
});

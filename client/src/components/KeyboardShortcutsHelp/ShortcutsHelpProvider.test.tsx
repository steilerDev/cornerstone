/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ShortcutRegistryProvider, useShortcutRegistry } from '../../hooks/shortcutRegistry.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { NavContext } from '../../navigation/navConfig.js';
import { ShortcutsHelpProvider, useShortcutsHelp } from './ShortcutsHelpProvider.js';

const CTX: NavContext = { role: 'member', paperlessConfigured: false };

let registryProbe: ReturnType<typeof useShortcutRegistry> = null;
const openerRef = createRef<HTMLButtonElement>();

function Opener() {
  const help = useShortcutsHelp();
  registryProbe = useShortcutRegistry();
  return (
    <>
      <button type="button" ref={openerRef} onClick={() => help.open(openerRef)}>
        open with ref
      </button>
      <button type="button" onClick={() => help.open()}>
        open without ref
      </button>
      <output data-testid="enabled">{String(help.singleKeyEnabled)}</output>
      <input data-testid="field" />
    </>
  );
}

function PageWithShortcuts() {
  useKeyboardShortcuts([
    { key: 'e', handler: () => {}, description: 'Edit this task' },
    { key: 'Delete', handler: () => {}, description: 'Delete this task' },
  ]);
  return null;
}

function Shell({ page = false }: { page?: boolean }) {
  return (
    <MemoryRouter>
      <ShortcutRegistryProvider>
        <ShortcutsHelpProvider navContext={CTX}>
          <Opener />
          {page && <PageWithShortcuts />}
        </ShortcutsHelpProvider>
      </ShortcutRegistryProvider>
    </MemoryRouter>
  );
}

const press = (key: string, target: EventTarget = document) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const dialog = () => screen.queryByRole('dialog', { name: 'Keyboard shortcuts' });

describe('ShortcutsHelpProvider (#2253)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('opens the one dialog on a global ? and closes it with Esc (AC2)', () => {
    render(<Shell />);
    expect(dialog()).toBeNull();
    const event = press('?');
    expect(event.defaultPrevented).toBe(true);
    expect(dialog()).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    press('Escape');
    expect(dialog()).toBeNull();
  });

  it('a second ? while the dialog is open opens nothing new', () => {
    render(<Shell />);
    press('?');
    press('?');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('ignores ? typed in a text field (AC3)', () => {
    render(<Shell />);
    const field = screen.getByTestId('field');
    field.focus();
    press('?', field);
    expect(dialog()).toBeNull();
  });

  it('ignores ? while the single-key switch is off, but the opener still works (AC6)', async () => {
    localStorage.setItem('singleKeyShortcuts', 'off');
    render(<Shell />);
    const event = press('?');
    expect(event.defaultPrevented).toBe(false);
    expect(dialog()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'open without ref' }));
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Single-key shortcuts' })).not.toBeChecked();
  });

  it('returns focus to the given ref when closed (avatar / More-sheet openers)', async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole('button', { name: 'open with ref' }));
    expect(dialog()).toBeInTheDocument();
    expect(openerRef.current).not.toHaveFocus();
    press('Escape');
    expect(dialog()).toBeNull();
    expect(openerRef.current).toHaveFocus();
  });

  it('closes via the close button without a return ref and does not throw', async () => {
    render(<Shell />);
    await userEvent.click(screen.getByRole('button', { name: 'open without ref' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(dialog()).toBeNull();
  });

  it('lists the page shortcuts under On this page and the shell rows elsewhere', () => {
    render(<Shell page />);
    press('?');
    const [page, everywhere, goTo] = screen.getAllByRole('table');
    const keys = (table: HTMLElement) =>
      within(table)
        .getAllByTestId('keyboard-shortcut-row')
        .map((r) => r.getAttribute('data-key'));
    expect(keys(page!)).toEqual(['e', 'Delete']);
    expect(keys(everywhere!)).toEqual(['Mod+k', '?', 'Escape', 'Mod+z']);
    expect(keys(goTo!)).toEqual(['g h', 'g t', 'g s', 'g p', 'g d', 'g f', 'g c', 'g m']);
  });

  it('shows the empty state when the page registered nothing', () => {
    render(<Shell />);
    press('?');
    expect(screen.getByText('This page has no shortcuts of its own.')).toBeInTheDocument();
  });

  it('registers the documentation rows Mod+k, Escape and Mod+z in the global group', () => {
    render(<Shell />);
    const global = registryProbe!.snapshot().filter((s) => s.group === 'global');
    expect(global.map((s) => [s.key, s.description])).toEqual([
      ['?', 'Show keyboard shortcuts'],
      ['Mod+k', 'Search everywhere'],
      ['Escape', 'Close the open dialog, menu or search'],
      ['Mod+z', 'Undo the last change'],
    ]);
    // documentation-only: their handlers are inert and open nothing
    for (const s of global.filter((g) => g.key !== '?')) act(() => s.handler());
    expect(dialog()).toBeNull();
  });

  it('takes the registry snapshot when the dialog opens', () => {
    render(<Shell />);
    act(() => {
      registryProbe!.register('late', [{ key: 'q', handler: () => {}, description: 'Late page' }]);
    });
    press('?');
    expect(screen.getByText('Late page')).toBeInTheDocument();
  });

  describe('footer switch', () => {
    it('is on by default and toggles off then on, writing storage and keeping the dialog open', async () => {
      render(<Shell />);
      expect(screen.getByTestId('enabled')).toHaveTextContent('true');
      press('?');
      const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
      expect(toggle).toBeChecked();
      await userEvent.click(toggle);
      expect(toggle).not.toBeChecked();
      expect(localStorage.getItem('singleKeyShortcuts')).toBe('off');
      expect(registryProbe!.singleKeyEnabled()).toBe(false);
      expect(dialog()).toBeInTheDocument();
      expect(screen.getByTestId('enabled')).toHaveTextContent('false');
      await userEvent.click(toggle);
      expect(toggle).toBeChecked();
      expect(localStorage.getItem('singleKeyShortcuts')).toBeNull();
    });

    it('works from the keyboard (Space)', async () => {
      render(<Shell />);
      press('?');
      const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
      toggle.focus();
      await userEvent.keyboard(' ');
      expect(toggle).not.toBeChecked();
      expect(localStorage.getItem('singleKeyShortcuts')).toBe('off');
    });

    it('marks the single-key rows Turned off and keeps Delete, Esc and chords on', async () => {
      render(<Shell page />);
      press('?');
      await userEvent.click(screen.getByRole('switch', { name: 'Single-key shortcuts' }));
      const rows = screen.getAllByTestId('keyboard-shortcut-row');
      const off = rows.filter((r) => r.hasAttribute('data-off')).map((r) => r.dataset.key);
      expect(off).toEqual(
        expect.arrayContaining(['e', '?', 'g h', 'g t', 'g s', 'g p', 'g d', 'g f', 'g c', 'g m']),
      );
      expect(off).toHaveLength(10);
      const on = rows.filter((r) => !r.hasAttribute('data-off')).map((r) => r.dataset.key);
      expect(on.sort()).toEqual(['Delete', 'Escape', 'Mod+k', 'Mod+z']);
      expect(screen.getAllByTestId('keyboard-shortcut-off')).toHaveLength(10);
    });

    it('persists across a remount and keeps ? and g sequences off', async () => {
      const first = render(<Shell />);
      press('?');
      await userEvent.click(screen.getByRole('switch', { name: 'Single-key shortcuts' }));
      first.unmount();
      render(<Shell />);
      expect(screen.getByTestId('enabled')).toHaveTextContent('false');
      press('?');
      expect(dialog()).toBeNull();
    });
  });

  describe('outside a provider', () => {
    it('open() does nothing and singleKeyEnabled is true', async () => {
      render(<Opener />);
      expect(screen.getByTestId('enabled')).toHaveTextContent('true');
      await userEvent.click(screen.getByRole('button', { name: 'open without ref' }));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('without a registry provider', () => {
    it('still opens an overlay with the empty page state', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <MemoryRouter>
          <ShortcutsHelpProvider navContext={CTX}>
            <Opener />
          </ShortcutsHelpProvider>
        </MemoryRouter>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'open without ref' }));
      expect(dialog()).toBeInTheDocument();
      expect(screen.getByText('This page has no shortcuts of its own.')).toBeInTheDocument();
      const toggle = screen.getByRole('switch', { name: 'Single-key shortcuts' });
      await userEvent.click(toggle);
      expect(toggle).not.toBeChecked();
    });
  });
});

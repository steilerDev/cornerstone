/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PaperlessStatusResponse } from '@cornerstone/shared';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as ContextTypes from './CommandSearchContext.js';
import type * as CreateMenuTypes from '../CreateMenu/CreateMenuContext.js';
import type * as RegistryTypes from '../../hooks/shortcutRegistry.js';
import type * as ShortcutsTypes from '../../hooks/useKeyboardShortcuts.js';
import type { OverflowMenuControl } from '../OverflowMenu/OverflowMenu.js';

const mockStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({ getPaperlessStatus: mockStatus }));

let CommandSearchProvider: typeof ContextTypes.CommandSearchProvider;
let useCommandSearch: typeof ContextTypes.useCommandSearch;
let usePaperlessBaseUrl: typeof ContextTypes.usePaperlessBaseUrl;
let CreateMenuProvider: typeof CreateMenuTypes.CreateMenuProvider;
let useCreateMenuShell: typeof CreateMenuTypes.useCreateMenuShell;
let ShortcutRegistryProvider: typeof RegistryTypes.ShortcutRegistryProvider;
let useShortcutRegistry: typeof RegistryTypes.useShortcutRegistry;
let useKeyboardShortcuts: typeof ShortcutsTypes.useKeyboardShortcuts;

beforeEach(async () => {
  mockStatus.mockReset();
  if (!CommandSearchProvider) {
    ({ CommandSearchProvider, useCommandSearch, usePaperlessBaseUrl } =
      await import('./CommandSearchContext.js'));
    ({ CreateMenuProvider, useCreateMenuShell } =
      await import('../CreateMenu/CreateMenuContext.js'));
    ({ ShortcutRegistryProvider, useShortcutRegistry } =
      await import('../../hooks/shortcutRegistry.js'));
    ({ useKeyboardShortcuts } = await import('../../hooks/useKeyboardShortcuts.js'));
  }
});

afterEach(() => {
  document.body.innerHTML = '';
});

function Probe() {
  const api = useCommandSearch();
  return (
    <div>
      <output data-testid="available">{String(api.available)}</output>
      <output data-testid="is-open">{String(api.isOpen)}</output>
      <button type="button" data-testid="open" onClick={() => api.open()}>
        open
      </button>
      <button type="button" data-testid="open-query" onClick={() => api.open({ query: 'roof' })}>
        open with query
      </button>
      <button type="button" data-testid="close" onClick={api.close}>
        close
      </button>
      <button type="button" data-testid="toggle" onClick={api.toggle}>
        toggle
      </button>
    </div>
  );
}

function ShortcutList() {
  const registry = useShortcutRegistry();
  return (
    <button
      type="button"
      data-testid="read-shortcuts"
      onClick={() => {
        const rows = registry?.snapshot() ?? [];
        document.body.dataset.shortcuts = rows.map((s) => `${s.key}:${s.description}`).join('|');
      }}
    >
      read
    </button>
  );
}

function ControlAttach({ control }: { control: OverflowMenuControl }) {
  const { controlRef } = useCreateMenuShell();
  controlRef.current = control;
  return null;
}

function PageSlash({ handler }: { handler: () => void }) {
  useKeyboardShortcuts([{ key: '/', handler, description: 'Page slash' }]);
  return null;
}

interface Harness {
  onOpen: jest.Mock<(o: ContextTypes.CommandSearchOpenOptions) => void>;
  onClose: jest.Mock<() => void>;
  menuClose: jest.Mock<OverflowMenuControl['close']>;
}

function setup(isOpen = false, children: React.ReactNode = null): Harness {
  const onOpen = jest.fn<(o: ContextTypes.CommandSearchOpenOptions) => void>();
  const onClose = jest.fn<() => void>();
  const menuClose = jest.fn<OverflowMenuControl['close']>();
  const control: OverflowMenuControl = {
    open: jest.fn<OverflowMenuControl['open']>(),
    close: menuClose,
    isOpen: () => false,
  };
  render(
    <MemoryRouter>
      <ShortcutRegistryProvider>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
          <ControlAttach control={control} />
          <CommandSearchProvider isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
            <Probe />
            <ShortcutList />
            {children}
          </CommandSearchProvider>
        </CreateMenuProvider>
      </ShortcutRegistryProvider>
    </MemoryRouter>,
  );
  return { onOpen, onClose, menuClose };
}

/** Dispatches a cancelable keydown and reports whether preventDefault ran. */
function press(
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
): { prevented: boolean } {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return { prevented: event.defaultPrevented };
}

describe('Ctrl/Cmd K', () => {
  it.each([
    ['Control', { ctrlKey: true }],
    ['Meta', { metaKey: true }],
  ])('opens the search with %s+K and prevents the browser default', (_name, mod) => {
    const { onOpen } = setup();
    const { prevented } = press(document.body, 'k', mod);
    expect(prevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('accepts an upper-case K (Caps Lock)', () => {
    const { onOpen } = setup();
    press(document.body, 'K', { ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens from inside a text field whose React keydown handler stops propagation', () => {
    const { onOpen } = setup(
      false,
      <input data-testid="field" onKeyDown={(e) => e.stopPropagation()} />,
    );
    const field = screen.getByTestId('field');
    field.focus();
    // fireEvent goes through React's root listener, which stops the native propagation.
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      field.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('closes on a second press while open and prevents the default', () => {
    const { onOpen, onClose } = setup(true);
    const { prevented } = press(document.body, 'k', { ctrlKey: true });
    expect(prevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('prevents the browser default but does not open over another dialog', () => {
    const { onOpen } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    const { prevented } = press(document.body, 'k', { metaKey: true });
    expect(prevented).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each([
    ['auto-repeat', { ctrlKey: true, repeat: true }],
    ['IME composition', { ctrlKey: true, isComposing: true }],
    ['Alt held', { ctrlKey: true, altKey: true }],
    ['Shift held', { ctrlKey: true, shiftKey: true }],
    ['no modifier', {}],
  ])('ignores %s', (_name, init) => {
    const { onOpen } = setup();
    const { prevented } = press(document.body, 'k', init);
    expect(prevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('ignores other keys with Ctrl held', () => {
    const { onOpen } = setup();
    const { prevented } = press(document.body, 'j', { ctrlKey: true });
    expect(prevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const { unmount } = render(
      <MemoryRouter>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
          <CommandSearchProvider isOpen={false} onOpen={jest.fn()} onClose={jest.fn()}>
            <span />
          </CommandSearchProvider>
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    unmount();
    const { prevented } = press(document.body, 'k', { ctrlKey: true });
    expect(prevented).toBe(false);
  });
});

describe('open / close / toggle', () => {
  it('open passes the options on and closes the New menu first', () => {
    const { onOpen, menuClose } = setup();
    fireEvent.click(screen.getByTestId('open-query'));
    expect(menuClose).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ query: 'roof' });
  });

  it('open without options passes an empty object', () => {
    const { onOpen } = setup();
    fireEvent.click(screen.getByTestId('open'));
    expect(onOpen).toHaveBeenCalledWith({});
  });

  it('open does nothing while another modal dialog is open', () => {
    const { onOpen, menuClose } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    fireEvent.click(screen.getByTestId('open'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(menuClose).not.toHaveBeenCalled();
  });

  it('close calls onClose', () => {
    const { onClose } = setup(true);
    fireEvent.click(screen.getByTestId('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('toggle opens when closed and closes when open', () => {
    const closed = setup(false);
    fireEvent.click(screen.getByTestId('toggle'));
    expect(closed.onOpen).toHaveBeenCalledTimes(1);
    expect(closed.onClose).not.toHaveBeenCalled();
    document.body.innerHTML = '';
    const opened = setup(true);
    fireEvent.click(screen.getByTestId('toggle'));
    expect(opened.onClose).toHaveBeenCalledTimes(1);
    expect(opened.onOpen).not.toHaveBeenCalled();
  });

  it('exposes available and isOpen', () => {
    setup(true);
    expect(screen.getByTestId('available').textContent).toBe('true');
    expect(screen.getByTestId('is-open').textContent).toBe('true');
  });
});

describe('the shell "/" shortcut', () => {
  function stubVisibility(field: HTMLElement, visible: boolean | 'unsupported') {
    if (visible === 'unsupported') {
      Object.defineProperty(field, 'checkVisibility', { value: undefined, configurable: true });
      Object.defineProperty(field, 'getClientRects', {
        value: () => [{}],
        configurable: true,
      });
    } else {
      Object.defineProperty(field, 'checkVisibility', { value: () => visible, configurable: true });
    }
  }

  it('is registered as a fallback with its description', () => {
    setup();
    fireEvent.click(screen.getByTestId('read-shortcuts'));
    expect(document.body.dataset.shortcuts?.split('|')).toContain(
      '/:Search this list, or search everywhere',
    );
    delete document.body.dataset.shortcuts;
  });

  it('focuses and selects a visible page search field instead of opening', () => {
    const { onOpen } = setup(
      false,
      <input data-page-search="" data-testid="page-search" defaultValue="roof" />,
    );
    const field = screen.getByTestId('page-search') as HTMLInputElement;
    stubVisibility(field, true);
    const selectSpy = jest.spyOn(field, 'select');
    const { prevented } = press(document.body, '/');
    expect(prevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the search when the page search field is not visible', () => {
    const { onOpen } = setup(false, <input data-page-search="" data-testid="page-search" />);
    stubVisibility(screen.getByTestId('page-search'), false);
    press(document.body, '/');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(screen.getByTestId('page-search'));
  });

  it('opens the search when there is no page search field', () => {
    const { onOpen } = setup();
    press(document.body, '/');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('falls back to client rects when checkVisibility is unavailable', () => {
    const { onOpen } = setup(false, <input data-page-search="" data-testid="page-search" />);
    const field = screen.getByTestId('page-search');
    stubVisibility(field, 'unsupported');
    press(document.body, '/');
    expect(document.activeElement).toBe(field);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens when checkVisibility is unavailable and the field has no layout', () => {
    const { onOpen } = setup(false, <input data-page-search="" data-testid="page-search" />);
    const field = screen.getByTestId('page-search');
    Object.defineProperty(field, 'checkVisibility', { value: undefined, configurable: true });
    press(document.body, '/');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('is ignored while typing in an input', () => {
    const { onOpen } = setup(false, <input data-testid="plain" />);
    press(screen.getByTestId('plain'), '/');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('is ignored while another modal dialog is open', () => {
    const { onOpen } = setup();
    const dialog = document.createElement('div');
    dialog.setAttribute('aria-modal', 'true');
    document.body.appendChild(dialog);
    press(document.body, '/');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('yields to a page that registers its own "/"', () => {
    const pageHandler = jest.fn();
    const { onOpen } = setup(false, <PageSlash handler={pageHandler} />);
    press(document.body, '/');
    expect(pageHandler).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('useCommandSearch outside a provider', () => {
  it('is unavailable and every call does nothing', () => {
    let api: ContextTypes.CommandSearchApi | null = null;
    function Capture() {
      api = useCommandSearch();
      return null;
    }
    render(<Capture />);
    expect(api).not.toBeNull();
    const detached = api as unknown as ContextTypes.CommandSearchApi;
    expect(detached.available).toBe(false);
    expect(detached.isOpen).toBe(false);
    expect(() => {
      detached.open({ query: 'x' });
      detached.close();
      detached.toggle();
    }).not.toThrow();
  });
});

describe('usePaperlessBaseUrl', () => {
  function Reader({ onRead }: { onRead: (get: () => Promise<string | null>) => void }) {
    onRead(usePaperlessBaseUrl());
    return null;
  }

  function renderReader() {
    let getter: (() => Promise<string | null>) | null = null;
    render(
      <MemoryRouter>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
          <CommandSearchProvider isOpen={false} onOpen={jest.fn()} onClose={jest.fn()}>
            <Reader onRead={(g) => (getter = g)} />
          </CommandSearchProvider>
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    expect(getter).not.toBeNull();
    return getter as unknown as () => Promise<string | null>;
  }

  const STATUS: PaperlessStatusResponse = {
    configured: true,
    reachable: true,
    error: null,
    paperlessUrl: 'https://docs.example.test',
    filterTag: null,
  };

  it('fetches the status once and returns the browser-facing URL', async () => {
    mockStatus.mockResolvedValue(STATUS);
    const get = renderReader();
    await expect(get()).resolves.toBe('https://docs.example.test');
    await expect(get()).resolves.toBe('https://docs.example.test');
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('returns null when Paperless is not configured', async () => {
    mockStatus.mockResolvedValue({ ...STATUS, configured: false });
    await expect(renderReader()()).resolves.toBeNull();
  });

  it('returns null when the configured status carries no URL', async () => {
    mockStatus.mockResolvedValue({ ...STATUS, paperlessUrl: null });
    await expect(renderReader()()).resolves.toBeNull();
  });

  it('maps a failed request to null and does not retry', async () => {
    mockStatus.mockRejectedValue(new Error('down'));
    const get = renderReader();
    await expect(get()).resolves.toBeNull();
    await expect(get()).resolves.toBeNull();
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('resolves null without a provider and never calls the API', async () => {
    let getter: (() => Promise<string | null>) | null = null;
    render(<Reader onRead={(g) => (getter = g)} />);
    await expect((getter as unknown as () => Promise<string | null>)()).resolves.toBeNull();
    expect(mockStatus).not.toHaveBeenCalled();
  });
});

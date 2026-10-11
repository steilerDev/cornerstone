/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShortcutRegistryProvider, useShortcutRegistry } from '../../hooks/shortcutRegistry.js';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts.js';
import type { OverflowMenuControl } from '../OverflowMenu/OverflowMenu.js';
import {
  CreateMenuProvider,
  useCreateContext,
  useCreateMenu,
  useCreateMenuShell,
  useCreatePrefill,
} from './CreateMenuContext.js';

function Probe() {
  const { open, close, isOpen } = useCreateMenu();
  const prefill = useCreatePrefill();
  return (
    <div>
      <button type="button" data-testid="open" onClick={() => open()}>
        open
      </button>
      <button type="button" data-testid="close" onClick={close}>
        close
      </button>
      <output data-testid="is-open">{String(isOpen)}</output>
      <output data-testid="prefill">{JSON.stringify(prefill)}</output>
    </div>
  );
}

function ShortcutList() {
  const registry = useShortcutRegistry();
  const [text, setText] = useState('');
  return (
    <div>
      <button
        type="button"
        data-testid="read-shortcuts"
        onClick={() =>
          setText((registry?.snapshot() ?? []).map((s) => `${s.key}:${s.description}`).join('|'))
        }
      >
        read
      </button>
      <output data-testid="shortcuts">{text}</output>
    </div>
  );
}

const readShortcuts = () => {
  fireEvent.click(screen.getByTestId('read-shortcuts'));
  return screen.getByTestId('shortcuts').textContent;
};

function makeControl() {
  const open = jest.fn<OverflowMenuControl['open']>();
  const close = jest.fn<OverflowMenuControl['close']>();
  const control: OverflowMenuControl = { open, close, isOpen: () => false };
  return { control, open, close };
}

function ControlAttach({ control }: { control: OverflowMenuControl }) {
  const { controlRef } = useCreateMenuShell();
  const attachedRef = useRef(false);
  if (!attachedRef.current) {
    controlRef.current = control;
    attachedRef.current = true;
  }
  return null;
}

function Context({ areaId, date }: { areaId?: string; date?: string }) {
  useCreateContext({ areaId, date });
  return null;
}

function setup(
  props: { wide?: boolean; sheetOpen?: boolean; money?: boolean } = {},
  children: React.ReactNode = null,
) {
  const onSheetOpenChange = jest.fn<(open: boolean) => void>();
  const utils = render(
    <MemoryRouter>
      <ShortcutRegistryProvider>
        <CreateMenuProvider
          moneyPage={props.money ?? false}
          wide={props.wide ?? true}
          sheetOpen={props.sheetOpen ?? false}
          onSheetOpenChange={onSheetOpenChange}
        >
          <Probe />
          <ShortcutList />
          {children}
        </CreateMenuProvider>
      </ShortcutRegistryProvider>
    </MemoryRouter>,
  );
  return { onSheetOpenChange, ...utils };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('CreateMenuProvider.open', () => {
  it('opens the desktop menu through the control, focusing the first row, with the focused element as opener', () => {
    const { control, open: openMock } = makeControl();
    const { onSheetOpenChange } = setup({ wide: true }, <ControlAttach control={control} />);
    const opener = screen.getByTestId('open');
    opener.focus();
    fireEvent.click(opener);
    expect(openMock.mock.calls).toHaveLength(1);
    expect(openMock.mock.calls[0]?.[0]).toBe('first');
    expect(openMock.mock.calls[0]?.[1] === opener).toBe(true);
    expect(onSheetOpenChange).not.toHaveBeenCalled();
  });

  it('passes no return element when focus is on the body (Escape then returns to the New button)', () => {
    const { control, open: openMock } = makeControl();
    setup({ wide: true }, <ControlAttach control={control} />);
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    act(() => {
      fireEvent.keyDown(document, { key: 'n' });
    });
    expect(openMock.mock.calls).toHaveLength(1);
    expect(openMock.mock.calls[0]?.[0]).toBe('first');
    expect(openMock.mock.calls[0]?.[1]).toBeNull();
  });

  it('opens the sheet below the wide breakpoint', () => {
    const { control, open: openMock } = makeControl();
    const { onSheetOpenChange } = setup({ wide: false }, <ControlAttach control={control} />);
    fireEvent.click(screen.getByTestId('open'));
    expect(onSheetOpenChange).toHaveBeenCalledWith(true);
    expect(openMock).not.toHaveBeenCalled();
  });

  it('does nothing while a modal is open', () => {
    const { onSheetOpenChange } = setup({ wide: false });
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    fireEvent.click(screen.getByTestId('open'));
    expect(onSheetOpenChange).not.toHaveBeenCalled();
  });

  it('close() closes the control and the sheet', () => {
    const { control, close: closeMock } = makeControl();
    const { onSheetOpenChange } = setup({}, <ControlAttach control={control} />);
    fireEvent.click(screen.getByTestId('close'));
    expect(closeMock).toHaveBeenCalled();
    expect(onSheetOpenChange).toHaveBeenCalledWith(false);
  });

  it('reports the sheet state as isOpen', () => {
    setup({ sheetOpen: true, wide: false });
    expect(screen.getByTestId('is-open').textContent).toBe('true');
  });
});

describe('outside a provider', () => {
  it('open and close are harmless no-ops and the pre-fill is empty', () => {
    render(<Probe />);
    fireEvent.click(screen.getByTestId('open'));
    fireEvent.click(screen.getByTestId('close'));
    expect(screen.getByTestId('is-open').textContent).toBe('false');
    expect(screen.getByTestId('prefill').textContent).toBe('{}');
  });

  it('useCreateContext is a no-op', () => {
    expect(() => render(<Context areaId="a1" />)).not.toThrow();
  });
});

describe('useCreateContext', () => {
  it('registers a sanitized pre-fill and clears it on unmount', () => {
    const { rerender } = setup({}, <Context areaId="a1" date="2026-02-30" />);
    expect(JSON.parse(screen.getByTestId('prefill').textContent ?? '{}')).toEqual({
      areaId: 'a1',
    });
    rerender(
      <MemoryRouter>
        <ShortcutRegistryProvider>
          <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
            <Probe />
          </CreateMenuProvider>
        </ShortcutRegistryProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('prefill').textContent).toBe('{}');
  });

  it('updates when the context changes', () => {
    function Host({ date }: { date: string }) {
      return <Context date={date} />;
    }
    const { rerender } = render(
      <MemoryRouter>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          <Probe />
          <Host date="2026-03-01" />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('prefill').textContent).toContain('2026-03-01');
    rerender(
      <MemoryRouter>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={() => {}}>
          <Probe />
          <Host date="2026-04-01" />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('prefill').textContent).toContain('2026-04-01');
  });
});

describe('the shell n shortcut', () => {
  const press = (key: string) =>
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    });

  it('is listed as "Open the New menu" when no page owns n', () => {
    setup();
    expect(readShortcuts()).toBe('n:Open the New menu');
  });

  it('opens the sheet on n below the wide breakpoint', () => {
    const { onSheetOpenChange } = setup({ wide: false });
    press('n');
    expect(onSheetOpenChange).toHaveBeenCalledWith(true);
  });

  it("yields to a page's own n (the page handler runs, the menu stays closed)", () => {
    const pageHandler = jest.fn<() => void>();
    function PageN() {
      useKeyboardShortcuts([{ key: 'n', handler: pageHandler, description: 'page n' }]);
      return null;
    }
    const { onSheetOpenChange } = setup({ wide: false }, <PageN />);
    press('n');
    expect(pageHandler).toHaveBeenCalledTimes(1);
    expect(onSheetOpenChange).not.toHaveBeenCalled();
    expect(readShortcuts()).toBe('n:page n');
  });

  it('does not fire while a modal is open', () => {
    const { onSheetOpenChange } = setup({ wide: false });
    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    press('n');
    expect(onSheetOpenChange).not.toHaveBeenCalled();
  });
});

describe('useCreateMenuShell', () => {
  it('exposes the shell fields and toggles the sheet', () => {
    function Shell() {
      const shell = useCreateMenuShell();
      return (
        <button type="button" data-testid="toggle" onClick={shell.toggleSheet}>
          {`${shell.moneyPage}|${shell.sheetOpen}|${shell.sheetId !== ''}`}
        </button>
      );
    }
    const onSheetOpenChange = jest.fn<(open: boolean) => void>();
    render(
      <MemoryRouter>
        <CreateMenuProvider moneyPage wide={false} sheetOpen onSheetOpenChange={onSheetOpenChange}>
          <Shell />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('toggle').textContent).toBe('true|true|true');
    fireEvent.click(screen.getByTestId('toggle'));
    expect(onSheetOpenChange).toHaveBeenCalledWith(false);
  });

  it('is detached outside a provider', () => {
    function Shell() {
      const shell = useCreateMenuShell();
      shell.toggleSheet();
      return <span data-testid="detached">{shell.sheetId === '' ? 'detached' : 'live'}</span>;
    }
    render(<Shell />);
    expect(screen.getByTestId('detached').textContent).toBe('detached');
  });
});

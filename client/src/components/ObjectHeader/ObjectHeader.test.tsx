/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createRef } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedOrigin } from '../../test/originProbe';
import type * as ObjectHeaderModule from './ObjectHeader.js';
import type { ObjectHeaderProps } from './ObjectHeader.js';
import type { StatusMenuTransition } from '../StatusMenu/StatusMenu.js';

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

const showToast = jest.fn();
jest.unstable_mockModule('../Toast/ToastContext.js', () => ({
  useToast: () => ({ showToast }),
}));

let entriesLanguage: 'de' | 'en' | null = 'de';
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => entriesLanguage,
}));

const copyText = jest.fn<(text: string) => Promise<boolean>>();
jest.unstable_mockModule('../../lib/copyText.js', () => ({
  copyText: (text: string) => copyText(text),
}));

let ObjectHeader: typeof ObjectHeaderModule.ObjectHeader;

type S = 'planned' | 'done';
const transitions: StatusMenuTransition<S>[] = [
  { to: 'done', direction: 'forward', label: 'Mark done' },
];

beforeEach(async () => {
  if (!ObjectHeader) ObjectHeader = (await import('./ObjectHeader.js')).ObjectHeader;
  showToast.mockReset();
  copyText.mockReset();
  copyText.mockResolvedValue(true);
  entriesLanguage = 'de';
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderHeader(
  overrides: Partial<ObjectHeaderProps<S>> = {},
  url = '/project/work-items/w1?tab=cost&depError=1&payment=2',
) {
  const props: ObjectHeaderProps<S> = {
    title: 'Fixture task',
    primary: { kind: 'button', label: 'Do it', onClick: jest.fn(), testId: 'primary-button' },
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ObjectHeader<S> {...props} />
      <OriginProbe />
    </MemoryRouter>,
  );
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Page actions' }));

describe('ObjectHeader', () => {
  it('renders one h1 with the entries language and the user-text class', () => {
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1, name: 'Fixture task' });
    expect(h1).toHaveAttribute('lang', 'de');
    expect(h1).toHaveClass('userText', 'title');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('object-header')).toBeInTheDocument();
  });

  it('gives a translated fallback title no lang and no hyphenation class', () => {
    renderHeader({ title: 'Untitled task', titleIsUserText: false });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).not.toHaveAttribute('lang');
    expect(h1).not.toHaveClass('userText');
    expect(h1).toHaveClass('title');
  });

  it('omits lang while the entries language is unknown but keeps the class', () => {
    entriesLanguage = null;
    renderHeader();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).not.toHaveAttribute('lang');
    expect(h1).toHaveClass('userText');
  });

  it('passes headingRef to the h1', () => {
    const headingRef = createRef<HTMLHeadingElement>();
    renderHeader({ headingRef });
    expect(headingRef.current).toBe(screen.getByRole('heading', { level: 1 }));
    expect(headingRef.current).toHaveAttribute('tabindex', '-1');
  });

  it('renders the breadcrumbs slot before the header row and a custom test id', () => {
    renderHeader({ breadcrumbs: <nav data-testid="crumbs">Trail</nav>, testId: 'custom-header' });
    const root = screen.getByTestId('custom-header');
    expect(root.firstElementChild).toBe(screen.getByTestId('crumbs'));
  });

  it('renders the status slot and the secondary once, in DOM order title, status, secondary, primary, menu', () => {
    renderHeader({
      status: <span data-testid="status-slot">Planned</span>,
      secondary: <button type="button">Secondary</button>,
    });
    const order = [
      screen.getByRole('heading', { level: 1 }),
      screen.getByTestId('status-slot'),
      screen.getByRole('button', { name: 'Secondary' }),
      screen.getByTestId('primary-button'),
      screen.getByRole('button', { name: 'Page actions' }),
    ];
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(
        order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: 'Secondary' })).toHaveLength(1);
    expect(screen.getByTestId('object-header').querySelector('header')).toHaveClass('hasSecondary');
  });

  it('renders no status or secondary wrapper when none is given', () => {
    renderHeader();
    expect(screen.getByTestId('object-header').querySelector('.status')).toBeNull();
    expect(screen.getByTestId('object-header').querySelector('.secondary')).toBeNull();
    expect(screen.getByTestId('object-header').querySelector('header')).not.toHaveClass(
      'hasSecondary',
    );
  });

  describe('primary', () => {
    it('kind=button: exactly one element carries the primary class and it runs onClick', () => {
      const onClick = jest.fn();
      renderHeader({ primary: { kind: 'button', label: 'Do it', onClick, testId: 'p' } });
      const root = screen.getByTestId('object-header');
      expect(root.querySelectorAll('.primary')).toHaveLength(1);
      const button = screen.getByRole('button', { name: 'Do it' });
      expect(button).toHaveClass('primary');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('kind=button: is aria-disabled and inert while busy', () => {
      const onClick = jest.fn();
      renderHeader({
        primary: { kind: 'button', label: 'Do it', onClick, busy: true, testId: 'p' },
      });
      const button = screen.getByTestId('p');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('kind=button: not busy has no aria-disabled or aria-busy', () => {
      renderHeader({
        primary: { kind: 'button', label: 'Do it', onClick: jest.fn(), busy: false, testId: 'p' },
      });
      expect(screen.getByTestId('p')).not.toHaveAttribute('aria-disabled');
      expect(screen.getByTestId('p')).not.toHaveAttribute('aria-busy');
    });

    it('kind=link: an anchor with the href that navigates carrying the given state', () => {
      renderHeader({
        primary: {
          kind: 'link',
          label: 'Log',
          to: '/diary/new',
          state: { origin: { to: '/from' } },
          testId: 'log-link',
        },
      });
      const root = screen.getByTestId('object-header');
      expect(root.querySelectorAll('.primary')).toHaveLength(1);
      const link = screen.getByRole('link', { name: 'Log' });
      expect(link).toHaveClass('primary');
      expect(link).toHaveAttribute('href', '/diary/new');
      fireEvent.click(link);
      expect(screen.getByTestId('probe-path')).toHaveTextContent('/diary/new');
      expect(probedOrigin()).toEqual({ to: '/from' });
    });

    it('kind=status: a StatusMenu action trigger carries the primary class and applies the transition', async () => {
      const onApply = jest.fn<(to: S, date: string | null) => Promise<void>>().mockResolvedValue();
      renderHeader({
        primary: {
          kind: 'status',
          status: {
            transitions,
            badge: {
              variants: { planned: { label: 'Planned' }, done: { label: 'Done' } },
              value: 'planned',
            },
            currentLabel: 'Planned',
            onApply,
            actionTo: 'done',
            testId: 'status-primary',
          },
        },
      });
      const root = screen.getByTestId('object-header');
      expect(root.querySelectorAll('.primary')).toHaveLength(1);
      const trigger = screen.getByRole('button', { name: 'Mark done' });
      expect(trigger).toHaveClass('primary');
      expect(trigger).not.toHaveClass('plainButton');
      fireEvent.click(trigger);
      await waitFor(() => expect(onApply).toHaveBeenCalledWith('done', null));
    });

    it('the source carries exactly one styles.primary usage (pattern-baseline guard)', () => {
      const source = fs.readFileSync(
        path.join(path.dirname(new URL(import.meta.url).pathname), 'ObjectHeader.tsx'),
        'utf8',
      );
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code.match(/styles\.primary\b/g)).toHaveLength(1);
    });
  });

  describe('page menu', () => {
    it('is named "Page actions" and lists Copy link and Print only, without Delete', () => {
      renderHeader();
      openMenu();
      const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
      expect(items.map((i) => i.textContent)).toEqual(['Copy link', 'Print']);
      expect(screen.queryByTestId('object-header-delete')).toBeNull();
      expect(screen.queryByRole('separator')).toBeNull();
    });

    it('adds a separator and a destructive Delete only with onDelete, and Delete runs it', () => {
      const onDelete = jest.fn();
      renderHeader({ menu: { onDelete } });
      openMenu();
      const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
      expect(items.map((i) => i.textContent)).toEqual(['Copy link', 'Print', 'Delete']);
      expect(screen.getByRole('separator')).toBeInTheDocument();
      expect(screen.getByTestId('object-header-delete').className).toContain('itemDanger');
      fireEvent.click(screen.getByTestId('object-header-delete'));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('places extra items after Print and before the separator', () => {
      renderHeader({
        menu: {
          onDelete: jest.fn(),
          extraItems: [{ id: 'dup', label: 'Duplicate', onClick: jest.fn(), testId: 'extra-dup' }],
        },
      });
      openMenu();
      const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
      expect(items.map((i) => i.textContent)).toEqual([
        'Copy link',
        'Print',
        'Duplicate',
        'Delete',
      ]);
    });

    it('Copy link copies origin + pathname + only the tab param and shows an info toast', async () => {
      renderHeader();
      openMenu();
      fireEvent.click(screen.getByTestId('object-header-copy-link'));
      await waitFor(() => expect(showToast).toHaveBeenCalledWith('info', 'Link copied.'));
      expect(copyText).toHaveBeenCalledWith(
        `${window.location.origin}/project/work-items/w1?tab=cost`,
      );
    });

    it('Copy link omits ?tab= when the URL has none and drops transient params', async () => {
      renderHeader({}, '/project/work-items/w1?depError=1');
      openMenu();
      fireEvent.click(screen.getByTestId('object-header-copy-link'));
      await waitFor(() => expect(copyText).toHaveBeenCalled());
      expect(copyText).toHaveBeenCalledWith(`${window.location.origin}/project/work-items/w1`);
    });

    it('Copy link url-encodes the tab value', async () => {
      renderHeader({}, '/p?tab=a%20b');
      openMenu();
      fireEvent.click(screen.getByTestId('object-header-copy-link'));
      await waitFor(() => expect(copyText).toHaveBeenCalled());
      expect(copyText).toHaveBeenCalledWith(`${window.location.origin}/p?tab=a%20b`);
    });

    it('Copy link shows an error toast when the clipboard fails', async () => {
      copyText.mockResolvedValue(false);
      renderHeader();
      openMenu();
      fireEvent.click(screen.getByTestId('object-header-copy-link'));
      await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
      expect(showToast).toHaveBeenCalledWith('error', expect.stringMatching(/copy/i));
      expect(showToast).not.toHaveBeenCalledWith('info', expect.anything());
    });

    it('Print closes the menu, then calls window.print on the next frame', async () => {
      const print = jest.spyOn(window, 'print').mockImplementation(() => {});
      let frame: FrameRequestCallback = () => {};
      jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frame = cb;
        return 7;
      });
      renderHeader();
      openMenu();
      fireEvent.click(screen.getByTestId('object-header-print'));
      expect(screen.queryByRole('menu')).toBeNull();
      expect(print).not.toHaveBeenCalled();
      frame(0);
      expect(print).toHaveBeenCalledTimes(1);
    });

    it('cancels a pending print frame when the header unmounts', () => {
      const print = jest.spyOn(window, 'print').mockImplementation(() => {});
      jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 11);
      const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
      const view = renderHeader();
      openMenu();
      fireEvent.click(screen.getByTestId('object-header-print'));
      view.unmount();
      expect(cancel).toHaveBeenCalledWith(11);
      expect(print).not.toHaveBeenCalled();
    });

    it('does not cancel anything on unmount when no print is pending', () => {
      const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
      renderHeader().unmount();
      expect(cancel).not.toHaveBeenCalled();
    });
  });
});

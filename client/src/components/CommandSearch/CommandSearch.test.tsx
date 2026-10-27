/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type { PaperlessStatusResponse, SearchResponse } from '@cornerstone/shared';
import type * as SearchApiTypes from '../../lib/searchApi.js';
import type * as PaperlessApiTypes from '../../lib/paperlessApi.js';
import type * as TradesApiTypes from '../../lib/tradesApi.js';
import type * as CommandSearchTypes from './CommandSearch.js';
import type * as ContextTypes from './CommandSearchContext.js';
import type * as CreateMenuTypes from '../CreateMenu/CreateMenuContext.js';
import { ApiClientError, NetworkError } from '../../lib/apiClient.js';
import { navSections } from '../../navigation/navConfig.js';
import type { NavContext } from '../../navigation/navConfig.js';
import { resolveNavActive } from '../../navigation/navActive.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds.js';
import { makeGroup, makeItem, makeResponse } from '../../test/commandSearchFixtures.js';

const mockSearch = jest.fn<typeof SearchApiTypes.searchEverywhere>();
jest.unstable_mockModule('../../lib/searchApi.js', () => ({ searchEverywhere: mockSearch }));

const mockFetchTrades = jest.fn<typeof TradesApiTypes.fetchTrades>();
jest.unstable_mockModule('../../lib/tradesApi.js', () => ({ fetchTrades: mockFetchTrades }));

const mockStatus = jest.fn<typeof PaperlessApiTypes.getPaperlessStatus>();
jest.unstable_mockModule('../../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockStatus,
  listPaperlessDocuments: jest.fn(),
}));

const mockRefreshAuth = jest.fn<() => Promise<void>>();
jest.unstable_mockModule('../../contexts/AuthContext.js', () => ({
  useAuth: () => ({ refreshAuth: mockRefreshAuth }),
}));

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => ({
  useLocale: () => ({
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  }),
  RESOLVED_LOCALES: ['en', 'de'],
  LocaleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let CommandSearch: typeof CommandSearchTypes.CommandSearch;
let CommandSearchProvider: typeof ContextTypes.CommandSearchProvider;
let useCommandSearch: typeof ContextTypes.useCommandSearch;
let CreateMenuProvider: typeof CreateMenuTypes.CreateMenuProvider;

const CTX: NavContext = { role: 'admin', paperlessConfigured: true };
const SECTIONS = navSections(CTX);
const UNCONFIGURED: PaperlessStatusResponse = {
  configured: false,
  reachable: false,
  error: null,
  paperlessUrl: null,
  filterTag: null,
};

let media: MatchMediaControl;
// focusPageHeadingWhenReady keeps a requestAnimationFrame loop alive for up to 60 frames; left
// running it would steal focus into the next test's heading, so every frame is cancelled per test.
const pendingFrames = new Set<number>();
let rafSpy: ReturnType<typeof jest.spyOn> | null = null;

beforeEach(async () => {
  mockSearch.mockReset();
  mockFetchTrades.mockReset();
  mockFetchTrades.mockResolvedValue({ trades: [] });
  mockStatus.mockReset();
  mockRefreshAuth.mockReset();
  mockStatus.mockResolvedValue(UNCONFIGURED);
  media = installMatchMedia();
  const realRaf = window.requestAnimationFrame.bind(window);
  rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = realRaf((time) => {
      pendingFrames.delete(id);
      cb(time);
    });
    pendingFrames.add(id);
    return id;
  });
  if (!CommandSearch) {
    ({ CommandSearch } = await import('./CommandSearch.js'));
    ({ CommandSearchProvider, useCommandSearch } = await import('./CommandSearchContext.js'));
    ({ CreateMenuProvider } = await import('../CreateMenu/CreateMenuContext.js'));
  }
});

afterEach(() => {
  pendingFrames.forEach((id) => window.cancelAnimationFrame(id));
  pendingFrames.clear();
  rafSpy?.mockRestore();
  media.restore();
});

// ---- data -----------------------------------------------------------------------------------

const WORK_ITEMS = makeGroup(
  'work_item',
  [
    makeItem({
      id: 'w1',
      label: 'Roof tiles',
      status: 'in_progress',
      areaPath: [
        { id: 'a1', name: 'Ground floor' },
        { id: 'a2', name: 'Kitchen' },
      ],
    }),
    makeItem({ id: 'w2', label: 'Kitchen roof vent', status: 'unknown_state' }),
  ],
  { total: 2 },
);
const VENDOR = makeGroup('vendor', [
  makeItem({
    id: 'v1',
    label: 'Acme Roofing',
    sublabel: 'Roofing',
    phone: '+49 (30) 123-456',
    matchedField: 'phone',
  }),
]);
const DOC = makeGroup('paperless_document', [
  makeItem({ id: 'd1', label: 'Roof survey', date: '2026-01-02', matchedField: 'fullText' }),
]);

function full(q: string): SearchResponse {
  return makeResponse(q, { work_item: WORK_ITEMS, vendor: VENDOR, paperless_document: DOC });
}

function respondWith(build: (q: string) => SearchResponse): void {
  mockSearch.mockImplementation((params) => Promise.resolve(build(params.q)));
}

// ---- harness --------------------------------------------------------------------------------

interface HarnessProps {
  wide?: boolean;
  /** Open at once with this query; null renders closed. */
  startQuery?: string | null;
  active?: boolean;
  onCloseSpy?: () => void;
  withListField?: boolean;
  /** The destination heading renders this many ms after a navigation (a lazy page). */
  headingDelay?: number;
}

function PageHeading({ pathname, delay }: { pathname: string; delay: number }) {
  const [shown, setShown] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return shown ? <h1>{`Page ${pathname}`}</h1> : null;
}

function Probe() {
  const { pathname, search } = useLocation();
  const type = useNavigationType();
  return (
    <>
      <output data-testid="loc">{`${pathname}${search}`}</output>
      <output data-testid="nav-type">{type}</output>
    </>
  );
}

function Inner({
  wide,
  startQuery,
  active,
  onCloseSpy,
  withListField,
  headingDelay,
}: Required<HarnessProps>) {
  const location = useLocation();
  const [request, setRequest] = useState<{
    key: string;
    query: string;
    returnFocusRef?: RefObject<HTMLElement | null>;
  } | null>(startQuery === null ? null : { key: location.key, query: startQuery });
  const open = request !== null && request.key === location.key;
  const fieldRef = useRef<HTMLInputElement>(null);
  const close = () => {
    onCloseSpy();
    setRequest(null);
  };
  const resolved = active ? resolveNavActive(location.pathname, SECTIONS) : null;
  return (
    <>
      <CommandSearchProvider
        isOpen={open}
        onOpen={(o) =>
          setRequest({
            key: location.key,
            query: o.query ?? '',
            ...(o.returnFocusRef ? { returnFocusRef: o.returnFocusRef } : {}),
          })
        }
        onClose={close}
      >
        <main>
          <PageHeading key={location.pathname} pathname={location.pathname} delay={headingDelay} />
          <Opener fieldRef={fieldRef} />
          {withListField && <input data-testid="list-field" ref={fieldRef} />}
        </main>
        {open && request && (
          <CommandSearch
            wide={wide}
            initialQuery={request.query}
            {...(request.returnFocusRef ? { returnFocusRef: request.returnFocusRef } : {})}
            onClose={close}
            navContext={CTX}
            sections={SECTIONS}
            active={resolved}
          />
        )}
      </CommandSearchProvider>
      <Probe />
    </>
  );
}

function Opener({ fieldRef }: { fieldRef: RefObject<HTMLInputElement | null> }) {
  const api = useCommandSearch();
  return (
    <>
      <button type="button" data-testid="opener" onClick={() => api.open()}>
        open
      </button>
      <button
        type="button"
        data-testid="opener-field"
        onClick={() => api.open({ query: 'zzq', returnFocusRef: fieldRef })}
      >
        open from field
      </button>
    </>
  );
}

function Tree({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[routeUrl('workItems')]}>
      <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
        {children}
      </CreateMenuProvider>
    </MemoryRouter>
  );
}

function renderSearch(props: HarnessProps = {}) {
  const full: Required<HarnessProps> = {
    wide: true,
    startQuery: 'zzq',
    active: true,
    onCloseSpy: () => {},
    withListField: false,
    headingDelay: 0,
    ...props,
  };
  const utils = render(
    <Tree>
      <Inner {...full} />
    </Tree>,
  );
  return {
    ...utils,
    rerenderWith: (next: HarnessProps) =>
      utils.rerender(
        <Tree>
          <Inner {...full} {...next} />
        </Tree>,
      ),
  };
}

const input = () => screen.getByTestId('command-search-input') as HTMLInputElement;
const status = () => screen.getByTestId('command-search-status');
const option = (type: string, id: string) =>
  screen.getByTestId(`command-search-option-${type}-${id}`);

async function settled(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId('command-search-listbox')).not.toHaveAttribute('aria-busy');
  });
}

// ---- tests ----------------------------------------------------------------------------------

describe('CommandSearch containers', () => {
  it('renders the wide search as a palette dialog without a close button', async () => {
    respondWith(full);
    renderSearch({ wide: true });
    await settled();
    const dialog = screen.getByRole('dialog', { name: 'Search everywhere' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The title is a visually hidden h2 that names the dialog.
    expect(within(dialog).getByRole('heading', { name: 'Search everywhere' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /close/i })).toBeNull();
    expect(screen.queryByTestId('command-search-sheet')).toBeNull();
  });

  it('renders the compact search as a full-screen sheet with the field in the header', async () => {
    respondWith(full);
    renderSearch({ wide: false });
    await settled();
    const sheet = screen.getByTestId('command-search-sheet');
    expect(sheet).toHaveAttribute('data-open', 'true');
    expect(sheet).toHaveAttribute('role', 'dialog');
    expect(screen.getByRole('dialog', { name: 'Search everywhere' })).toBe(sheet);
    expect(sheet.querySelector('[data-testid="command-search-input-row"]')).not.toBeNull();
    expect(within(sheet).getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('keeps the query and results and refocuses the field when the container switches', async () => {
    respondWith(full);
    const { rerenderWith } = renderSearch({ wide: true });
    await settled();
    await userEvent.setup().type(input(), 'x');
    expect(input().value).toBe('zzqx');
    rerenderWith({ wide: false });
    expect(screen.getByTestId('command-search-sheet')).toBeInTheDocument();
    expect(input().value).toBe('zzqx');
    await waitFor(() => expect(document.activeElement).toBe(input()));
    expect(screen.getByTestId('command-search-listbox')).toBeInTheDocument();
  });

  it('does not render the Sheet inside an inert ancestor', async () => {
    respondWith(full);
    renderSearch({ wide: false });
    await settled();
    expect(screen.getByTestId('command-search-sheet').closest('[inert]')).toBeNull();
  });
});

describe('combobox semantics', () => {
  it('exposes the combobox attributes and an empty listbox for an empty query', async () => {
    renderSearch({ startQuery: '' });
    const field = input();
    expect(field).toHaveAttribute('role', 'combobox');
    expect(field).toHaveAttribute('aria-label', 'Search everywhere');
    expect(field).toHaveAttribute('aria-autocomplete', 'list');
    expect(field).toHaveAttribute('aria-haspopup', 'listbox');
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(field).toHaveAttribute('maxlength', '100');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(field).not.toHaveAttribute('aria-activedescendant');
    const listbox = screen.getByRole('listbox', { name: 'Search results' });
    expect(field.getAttribute('aria-controls')).toBe(listbox.id);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('expands, activates the first option and links the active descendant', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    const field = input();
    expect(field).toHaveAttribute('aria-expanded', 'true');
    const active = option('work_item', 'w1');
    expect(active).toHaveAttribute('role', 'option');
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(field.getAttribute('aria-activedescendant')).toBe(active.id);
    expect(option('work_item', 'w2')).toHaveAttribute('aria-selected', 'false');
  });

  it('renders groups with labelled headers that are not headings', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    const groups = screen.getAllByRole('group');
    const names = groups.map((g) => g.getAttribute('data-testid'));
    expect(names).toEqual([
      'command-search-group-work_item',
      'command-search-group-vendor',
      'command-search-group-paperless_document',
    ]);
    const tasks = screen.getByRole('group', { name: 'Tasks' });
    expect(within(tasks).queryByRole('heading')).toBeNull();
    expect(screen.getByRole('group', { name: 'Companies' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Documents' })).toBeInTheDocument();
  });

  it('has unique test ids', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(findDuplicateTestIds(document.body)).toEqual([]);
  });

  it('moves the active row with the pointer', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    fireEvent.pointerMove(option('work_item', 'w2'));
    expect(option('work_item', 'w2')).toHaveAttribute('aria-selected', 'true');
    expect(option('work_item', 'w1')).toHaveAttribute('aria-selected', 'false');
    expect(input().getAttribute('aria-activedescendant')).toBe(option('work_item', 'w2').id);
  });

  it('keeps focus in the field when the pointer presses a result', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(fireEvent.mouseDown(screen.getByTestId('command-search-listbox'))).toBe(false);
    expect(document.activeElement).toBe(input());
  });
});

describe('rows', () => {
  it('shows chips for known statuses and none for an unknown one', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(within(option('work_item', 'w1')).getByText('In progress')).toBeInTheDocument();
    const second = option('work_item', 'w2');
    expect(second.textContent).not.toContain('unknown_state');
    expect(second.querySelectorAll('[class*="badge" i]')).toHaveLength(0);
  });

  it('marks the match in the title and renders the area path without list markup', async () => {
    respondWith((q) => full(q));
    renderSearch({ startQuery: 'roof' });
    await settled();
    const row = option('work_item', 'w1');
    expect(Array.from(row.querySelectorAll('mark')).map((m) => m.textContent)).toEqual(['Roof']);
    expect(row.textContent).toContain('Ground floor');
    expect(row.textContent).toContain('Kitchen');
    expect(row.querySelector('nav, ol')).toBeNull();
  });

  it('marks a German-folded match', async () => {
    respondWith((q) =>
      makeResponse(q, {
        work_item: makeGroup('work_item', [makeItem({ id: 'g1', label: 'Müller Fassade' })]),
      }),
    );
    renderSearch({ startQuery: 'mueller' });
    await settled();
    expect(option('work_item', 'g1').querySelector('mark')?.textContent).toBe('Müller');
  });

  it('shows "Found in" for a field that is not visible in the row', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(option('vendor', 'v1').textContent).toContain('Found in Phone');
    expect(option('work_item', 'w1').textContent).not.toContain('Found in');
  });

  it('gives a company a Call link next to its row', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    const call = screen.getByTestId('command-search-call-v1');
    expect(call).toHaveAttribute('href', 'tel:+4930123456');
    expect(call).toHaveAttribute('tabindex', '-1');
    expect(call).toHaveAttribute('aria-label', 'Call Acme Roofing on +49 (30) 123-456');
    expect(call.id).toBe(`${option('vendor', 'v1').id}-call`);
    const describedBy = option('vendor', 'v1').getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe('Press Shift+Enter to call');
    // The Call link is a sibling of the option, not a child of it.
    expect(option('vendor', 'v1').contains(call)).toBe(false);
  });

  it('renders a document without a link base as a disabled option that explains why', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    await waitFor(() =>
      expect(option('paperless_document', 'd1')).toHaveAttribute('aria-disabled', 'true'),
    );
    const row = option('paperless_document', 'd1');
    expect(row).toHaveAttribute('aria-selected', 'false');
    expect(row.textContent).toContain("Can't be opened from here");
    expect(row.textContent).toContain('Found in Document text');
    expect(row.tagName).toBe('DIV');
  });

  it('turns a document into an external link once the Paperless URL is known', async () => {
    mockStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: 'https://docs.example.test/',
      filterTag: null,
    });
    respondWith(full);
    renderSearch();
    await settled();
    await waitFor(() => expect(option('paperless_document', 'd1').tagName).toBe('A'));
    const link = option('paperless_document', 'd1');
    expect(link).toHaveAttribute('href', 'https://docs.example.test/documents/d1/details');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link.getAttribute('aria-describedby')).toBeTruthy();
    expect(mockStatus).toHaveBeenCalledTimes(1);
  });

  it('does not ask for the Paperless URL when no document is shown', async () => {
    respondWith((q) => makeResponse(q, { work_item: WORK_ITEMS }));
    renderSearch();
    await settled();
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('labels an invoice without a number by its status word', async () => {
    respondWith((q) =>
      makeResponse(q, {
        invoice: makeGroup('invoice', [
          makeItem({ id: 'i1', label: null, status: 'quotation', sublabel: 'Acme Roofing' }),
        ]),
      }),
    );
    renderSearch();
    await settled();
    const row = option('invoice', 'i1');
    expect(row.textContent).toContain('Offer');
    expect(row.textContent).toContain('Acme Roofing');
  });

  it('shows a destination first with its former name', async () => {
    respondWith((q) => makeResponse(q));
    renderSearch({ startQuery: 'Gantt' });
    await settled();
    const dest = screen.getByTestId('command-search-dest-scheduleGantt');
    expect(dest).toHaveAttribute('aria-label', 'Go to Schedule');
    expect(dest).toHaveAttribute('href', routeUrl('scheduleGantt'));
    expect(dest.textContent).toContain('Formerly “Gantt”');
    expect(dest.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Go to' })).toBeInTheDocument();
    expect(input().getAttribute('aria-activedescendant')).toBe(dest.id);
  });
});

describe('keyboard', () => {
  it('moves down and up through the options, wrapping and skipping the disabled one', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    await waitFor(() =>
      expect(option('paperless_document', 'd1')).toHaveAttribute('aria-disabled', 'true'),
    );
    const user = userEvent.setup();
    const selected = () =>
      screen
        .getAllByRole('option')
        .filter((o) => o.getAttribute('aria-selected') === 'true')
        .map((o) => o.getAttribute('data-testid'));
    expect(selected()).toEqual(['command-search-option-work_item-w1']);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toEqual(['command-search-option-work_item-w2']);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toEqual(['command-search-option-vendor-v1']);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toEqual(['command-search-option-work_item-w1']);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toEqual(['command-search-option-vendor-v1']);
    expect(input().getAttribute('aria-activedescendant')).toBe(option('vendor', 'v1').id);
  });

  it('wraps to the last option on ArrowUp from the first', async () => {
    respondWith((q) => makeResponse(q, { work_item: WORK_ITEMS }));
    renderSearch();
    await settled();
    await userEvent.setup().keyboard('{ArrowUp}');
    expect(option('work_item', 'w2')).toHaveAttribute('aria-selected', 'true');
  });

  it('starts at the first option on ArrowDown and the last on ArrowUp when none is active', async () => {
    renderSearch({ startQuery: '' });
    const user = userEvent.setup();
    await user.type(input(), 't');
    const rows = screen.getAllByRole('option');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((r) => r.getAttribute('aria-selected') === 'false')).toBe(true);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    await user.clear(input());
    await user.type(input(), 't');
    expect(
      screen.getAllByRole('option').every((r) => r.getAttribute('aria-selected') === 'false'),
    ).toBe(true);
    await user.keyboard('{ArrowUp}');
    const after = screen.getAllByRole('option');
    expect(after[after.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('does nothing on arrow keys when there are no options', async () => {
    renderSearch({ startQuery: '' });
    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
  });

  it('opens the active result with Enter, pushing history with the origin as state', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe(routeUrl('workItem', { id: 'w1' })),
    );
    await waitFor(() => expect(screen.getByTestId('nav-type').textContent).toBe('PUSH'));
  });

  it('carries the origin of the page it was opened from', async () => {
    respondWith(full);
    let state: unknown = null;
    function StateProbe() {
      state = useLocation().state;
      return null;
    }
    render(
      <MemoryRouter initialEntries={[routeUrl('workItems')]}>
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
          <Inner
            wide
            startQuery="zzq"
            active
            onCloseSpy={() => {}}
            withListField={false}
            headingDelay={0}
          />
          <StateProbe />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    await settled();
    await userEvent.setup().keyboard('{Enter}');
    expect((state as { origin?: { to: string } } | null)?.origin?.to).toBe(routeUrl('workItems'));
  });

  it('replaces history for a Go to destination inside the same section', async () => {
    respondWith((q) => makeResponse(q));
    renderSearch({ startQuery: 'Gantt', active: true });
    await settled();
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByTestId('loc').textContent).toBe(routeUrl('scheduleGantt')),
    );
    await waitFor(() => expect(screen.getByTestId('nav-type').textContent).toBe('REPLACE'));
  });

  it('pushes a destination when no sidebar entry is active', async () => {
    respondWith((q) => makeResponse(q));
    renderSearch({ startQuery: 'Gantt', active: false });
    await settled();
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() => expect(screen.getByTestId('nav-type').textContent).toBe('PUSH'));
    expect(screen.getByTestId('nav-type').textContent).toBe('PUSH');
  });

  it('expands a group on Enter over "Show more" without closing', async () => {
    const closed = jest.fn();
    mockSearch.mockImplementation((params) =>
      Promise.resolve(
        params.types
          ? makeResponse(params.q, {
              work_item: makeGroup(
                'work_item',
                ['a', 'b', 'c', 'd'].map((id) => makeItem({ id, label: `Item ${id}` })),
                { total: 4 },
              ),
            })
          : makeResponse(params.q, {
              work_item: makeGroup(
                'work_item',
                ['a', 'b'].map((id) => makeItem({ id, label: `Item ${id}` })),
                { total: 4 },
              ),
            }),
      ),
    );
    renderSearch({ onCloseSpy: closed });
    await settled();
    const user = userEvent.setup();
    const more = screen.getByTestId('command-search-more-work_item');
    expect(more.textContent).toBe('Show 2 more');
    expect(screen.getByTestId('command-search-group-work_item').textContent).toContain('2 of 4');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(more).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(option('work_item', 'd')).toBeInTheDocument());
    expect(screen.queryByTestId('command-search-more-work_item')).toBeNull();
    expect(option('work_item', 'c')).toHaveAttribute('aria-selected', 'true');
    expect(closed).not.toHaveBeenCalled();
    expect(mockSearch).toHaveBeenLastCalledWith(
      { q: 'zzq', types: ['work_item'], limit: 20, tradeIds: [] },
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId('command-search-group-work_item').textContent).not.toContain('of 4');
  });

  it('expands a group when "Show more" is clicked', async () => {
    mockSearch.mockImplementation((params) =>
      Promise.resolve(
        makeResponse(params.q, {
          work_item: makeGroup(
            'work_item',
            ['a', 'b', ...(params.types ? ['c'] : [])].map((id) => makeItem({ id })),
            { total: 3 },
          ),
        }),
      ),
    );
    renderSearch();
    await settled();
    fireEvent.click(screen.getByTestId('command-search-more-work_item'));
    await waitFor(() => expect(option('work_item', 'c')).toBeInTheDocument());
  });

  it('clicks the Call link of the active company on Shift+Enter, and only for companies', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    const user = userEvent.setup();
    const call = screen.getByTestId('command-search-call-v1');
    const clicked = jest.fn((e: Event) => e.preventDefault());
    call.addEventListener('click', clicked);
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(clicked).not.toHaveBeenCalled();
    expect(screen.getByTestId('loc').textContent).toBe(routeUrl('workItems'));
    fireEvent.pointerMove(option('vendor', 'v1'));
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('loc').textContent).toBe(routeUrl('workItems'));
  });

  it('runs a pending debounce on Enter when no option is active', async () => {
    respondWith((q) => makeResponse(q, { work_item: WORK_ITEMS }));
    renderSearch({ startQuery: '' });
    const user = userEvent.setup();
    await user.type(input(), 'zzq{Enter}');
    expect(mockSearch).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(option('work_item', 'w1')).toBeInTheDocument());
  });

  it('ignores Enter while composing', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(screen.getByTestId('loc').textContent).toBe(routeUrl('workItems'));
  });

  it('keeps the Home and End keys for the text field', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(fireEvent.keyDown(input(), { key: 'Home' })).toBe(true);
    expect(fireEvent.keyDown(input(), { key: 'End' })).toBe(true);
  });

  it('prevents the default of the arrow keys', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(fireEvent.keyDown(input(), { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(input(), { key: 'ArrowUp' })).toBe(false);
  });
});

describe('tab order (D11)', () => {
  it('cycles input, Clear without visiting result links in the palette', async () => {
    respondWith(full);
    renderSearch({ wide: true });
    await settled();
    const user = userEvent.setup();
    expect(document.activeElement).toBe(input());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('command-search-clear'));
    await user.tab();
    expect(document.activeElement).toBe(input());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByTestId('command-search-clear'));
  });

  it('cycles input, Clear and Close in the sheet without visiting result links', async () => {
    respondWith(full);
    renderSearch({ wide: false });
    await settled();
    const user = userEvent.setup();
    expect(document.activeElement).toBe(input());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('command-search-clear'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /close/i }));
    await user.tab();
    expect(document.activeElement).toBe(input());
  });
});

describe('closing and focus', () => {
  it('closes on Escape and returns focus to the opener', async () => {
    respondWith(full);
    renderSearch({ startQuery: null });
    const user = userEvent.setup();
    const opener = screen.getByTestId('opener');
    await user.click(opener);
    await waitFor(() => expect(document.activeElement).toBe(input()));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes on Escape in the sheet and returns focus to the opener', async () => {
    respondWith(full);
    renderSearch({ startQuery: null, wide: false });
    const user = userEvent.setup();
    const opener = screen.getByTestId('opener');
    await user.click(opener);
    await waitFor(() => expect(document.activeElement).toBe(input()));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('command-search-sheet')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('closes when the backdrop is clicked', async () => {
    const closed = jest.fn();
    renderSearch({ startQuery: '', onCloseSpy: closed });
    const backdrop = document.querySelector('[class*="modalBackdrop"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the list field even though the opener button still exists', async () => {
    respondWith(full);
    renderSearch({ startQuery: null, withListField: true });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('opener-field'));
    await waitFor(() => expect(document.activeElement).toBe(input()));
    expect(input().value).toBe('zzq');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByTestId('list-field'));
  });

  it('selects a prefilled query so typing replaces it', async () => {
    respondWith(full);
    renderSearch({ startQuery: 'zzq' });
    await settled();
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(3);
  });

  it('lands focus on the destination heading after choosing a result, never on the body', async () => {
    respondWith(full);
    renderSearch({ startQuery: null, withListField: true });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('opener-field'));
    await settled();
    await user.keyboard('{Enter}');
    const expected = `Page ${routeUrl('workItem', { id: 'w1' })}`;
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement?.textContent).toBe(expected);
    });
    // The field it was opened from does not steal focus back.
    expect(document.activeElement).not.toBe(screen.getByTestId('list-field'));
  });

  it('lands focus on the heading after choosing in the sheet', async () => {
    respondWith(full);
    renderSearch({ startQuery: null, wide: false });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('opener'));
    await user.type(input(), 'zzq');
    await settled();
    await waitFor(() => expect(option('work_item', 'w1')).toBeInTheDocument());
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(screen.queryByTestId('command-search-sheet')).toBeNull();
      expect(document.activeElement?.textContent).toBe(
        `Page ${routeUrl('workItem', { id: 'w1' })}`,
      );
    });
  });

  it('closes by itself when the chosen target is the page it is already on', async () => {
    respondWith((q) => makeResponse(q));
    const closed = jest.fn();
    renderSearch({ startQuery: 'Tasks', onCloseSpy: closed });
    await settled();
    const dest = screen.getByTestId('command-search-dest-workItems');
    expect(dest).toHaveAttribute('href', routeUrl('workItems'));
    fireEvent.click(dest);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes on any real navigation, including going back', async () => {
    respondWith(full);
    function Back() {
      return null;
    }
    render(
      <MemoryRouter
        initialEntries={[routeUrl('workItems'), routeUrl('milestones')]}
        initialIndex={1}
      >
        <CreateMenuProvider moneyPage={false} wide sheetOpen={false} onSheetOpenChange={jest.fn()}>
          <Inner
            wide
            startQuery="zzq"
            active
            onCloseSpy={() => {}}
            withListField={false}
            headingDelay={0}
          />
          <BackButton />
          <Back />
        </CreateMenuProvider>
      </MemoryRouter>,
    );
    await settled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('back'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('loc').textContent).toBe(routeUrl('workItems'));
  });

  it('does not close or navigate the page for a modified click on a result', async () => {
    respondWith(full);
    const closed = jest.fn();
    renderSearch({ onCloseSpy: closed });
    await settled();
    fireEvent.click(option('work_item', 'w1'), { ctrlKey: true });
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

function BackButton() {
  // A Back press: the shell closes the search because the real location key changes.
  const navigate = useNavigationBack();
  return (
    <button type="button" data-testid="back" onClick={navigate}>
      back
    </button>
  );
}

import { useNavigate } from 'react-router-dom';
function useNavigationBack() {
  const navigate = useNavigate();
  return () => navigate(-1);
}

describe('states', () => {
  it('shows the hint for an empty query and no request', () => {
    renderSearch({ startQuery: '' });
    expect(screen.getByText(/Type to search tasks, purchases/)).toBeInTheDocument();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('shows the Esc hint only when the field is empty and the container is wide', async () => {
    const { unmount } = renderSearch({ startQuery: '', wide: true });
    expect(document.querySelector('kbd')?.textContent).toBe('Esc');
    expect(document.querySelector('kbd')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('command-search-clear')).toBeNull();
    unmount();
    renderSearch({ startQuery: '', wide: false });
    expect(document.querySelector('kbd')).toBeNull();
  });

  it('shows destinations and a "too short" hint for one character, without a request', async () => {
    renderSearch({ startQuery: '' });
    await userEvent.setup().type(input(), 't');
    expect(
      screen.getByText('Type at least 2 characters to search everything.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('clears the query with the Clear button and keeps focus in the field', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('command-search-clear'));
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Type to search tasks, purchases/)).toBeInTheDocument();
  });

  it('shows the skeleton on the first load only, hidden from assistive technology', async () => {
    let resolveFirst: (r: SearchResponse) => void = () => {};
    mockSearch.mockImplementationOnce(
      () => new Promise<SearchResponse>((resolve) => (resolveFirst = resolve)),
    );
    renderSearch();
    await waitFor(() =>
      expect(document.querySelector('[aria-hidden="true"] [aria-busy="true"]')).not.toBeNull(),
    );
    expect(screen.getByTestId('command-search-listbox')).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolveFirst(full('zzq')));
    await settled();
    expect(document.querySelector('[aria-hidden="true"] [aria-busy="true"]')).toBeNull();
  });

  it('keeps the old rows and shows the spinner, not the skeleton, while refetching', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    let resolveNext: (r: SearchResponse) => void = () => {};
    mockSearch.mockImplementationOnce(
      () => new Promise<SearchResponse>((resolve) => (resolveNext = resolve)),
    );
    await userEvent.setup().type(input(), 'x');
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('command-search-listbox')).toHaveAttribute('aria-busy', 'true'),
    );
    expect(option('work_item', 'w1')).toBeInTheDocument();
    expect(document.querySelector('[aria-hidden="true"] [aria-busy="true"]')).toBeNull();
    expect(
      document.querySelector('[data-testid="command-search-input-row"] [aria-hidden="true"]'),
    ).not.toBeNull();
    await act(async () => resolveNext(full('zzqx')));
  });

  it('shows the empty state when nothing matches', async () => {
    respondWith((q) => makeResponse(q));
    renderSearch({ startQuery: 'zzq' });
    await settled();
    const empty = await screen.findByTestId('command-search-empty');
    expect(empty.textContent).toContain('No results for “zzq”');
    expect(empty.textContent).toContain('Try another spelling');
  });

  it('shows "nothing else found" when only destinations match', async () => {
    respondWith((q) => makeResponse(q));
    renderSearch({ startQuery: 'Gantt' });
    await settled();
    expect(await screen.findByText('Nothing else found for “Gantt”.')).toBeInTheDocument();
    expect(screen.queryByTestId('command-search-empty')).toBeNull();
  });

  it('shows the documents-unavailable note under its header while keeping other results', async () => {
    respondWith((q) =>
      makeResponse(q, {
        work_item: WORK_ITEMS,
        paperless_document: makeGroup('paperless_document', [], { status: 'unavailable' }),
      }),
    );
    renderSearch();
    await settled();
    const note = screen.getByTestId('command-search-documents-unavailable');
    expect(note.textContent).toContain("Documents can't be reached right now");
    expect(screen.getByRole('group', { name: 'Documents' })).toContainElement(note);
    expect(option('work_item', 'w1')).toBeInTheDocument();
    expect(screen.queryByTestId('command-search-empty')).toBeNull();
  });

  it('shows the capped note at 20 results with more available', async () => {
    respondWith((q) =>
      makeResponse(q, {
        work_item: makeGroup(
          'work_item',
          Array.from({ length: 20 }, (_, i) => makeItem({ id: `c${i}`, label: `Cap ${i}` })),
          { total: 33 },
        ),
      }),
    );
    renderSearch();
    await settled();
    expect(
      screen.getByText('Showing 20 of 33. Narrow your search to see the rest.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('command-search-more-work_item')).toBeNull();
    expect(screen.getByTestId('command-search-group-work_item').textContent).toContain('20 of 33');
  });

  it('shows an error banner with Try again, keeps destinations, and retries', async () => {
    mockSearch.mockRejectedValueOnce(new NetworkError('x', null));
    renderSearch({ startQuery: 'Gantt' });
    const retry = await screen.findByTestId('command-search-retry');
    expect(screen.getByRole('alert').textContent).toContain("Search didn't work");
    expect(screen.getByTestId('command-search-dest-scheduleGantt')).toBeInTheDocument();
    expect(status().textContent).toBe('');
    respondWith(full);
    await userEvent.setup().click(retry);
    await waitFor(() => expect(screen.queryByTestId('command-search-retry')).toBeNull());
    expect(option('work_item', 'w1')).toBeInTheDocument();
  });

  it('never shows the server message in the error state', async () => {
    mockSearch.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'database exploded' }),
    );
    renderSearch();
    await screen.findByTestId('command-search-retry');
    expect(document.body.textContent).not.toContain('database exploded');
    expect(document.body.textContent).not.toContain('INTERNAL_ERROR');
  });

  it('refreshes the session on a 401 and shows the error state meanwhile', async () => {
    mockRefreshAuth.mockResolvedValue(undefined);
    mockSearch.mockRejectedValueOnce(
      new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'nope' }),
    );
    renderSearch();
    await screen.findByTestId('command-search-retry');
    expect(mockRefreshAuth).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the session on other errors', async () => {
    mockSearch.mockRejectedValueOnce(new NetworkError('x', null));
    renderSearch();
    await screen.findByTestId('command-search-retry');
    expect(mockRefreshAuth).not.toHaveBeenCalled();
  });
});

describe('live region', () => {
  it('stays empty while the typed text is ahead of the settled response, then announces the new count', async () => {
    respondWith((q) =>
      q === 'ab'
        ? makeResponse(q, { work_item: makeGroup('work_item', [makeItem({ id: 'one' })]) })
        : makeResponse(q, { work_item: WORK_ITEMS, vendor: VENDOR }),
    );
    renderSearch({ startQuery: 'ab' });
    await settled();
    // One item plus the destinations "ab" matches.
    const before = status().textContent;
    expect(before).toMatch(/^\d+ results?$/);
    fireEvent.change(input(), { target: { value: 'abc' } });
    // Under the 250 ms debounce: the old response is on screen but no longer matches the text.
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(status().textContent).toBe('');
    await waitFor(() => expect(status().textContent).toMatch(/^\d+ results?$/));
    expect(status().textContent).not.toBe(before);
    // Three items (two tasks and a company) plus the destinations "abc" matches.
    const count = Number(status().textContent!.split(' ')[0]);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('is a persistent status region without aria-live or aria-atomic', () => {
    renderSearch({ startQuery: '' });
    const live = status();
    expect(live).toHaveAttribute('role', 'status');
    expect(live).not.toHaveAttribute('aria-live');
    expect(live).not.toHaveAttribute('aria-atomic');
    expect(live.textContent).toBe('');
  });

  it('announces the result count once a response settles', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(status().textContent).toBe('4 results');
  });

  it('uses the singular for one result', async () => {
    respondWith((q) =>
      makeResponse(q, { work_item: makeGroup('work_item', [makeItem({ id: 'only' })]) }),
    );
    renderSearch();
    await settled();
    expect(status().textContent).toBe('1 result');
  });

  it('says that more are available when a group has more', async () => {
    respondWith((q) =>
      makeResponse(q, {
        work_item: makeGroup('work_item', [makeItem(), makeItem()], { total: 9 }),
      }),
    );
    renderSearch();
    await settled();
    expect(status().textContent).toBe('2 results shown. More are available.');
  });

  it('announces that there are no results', async () => {
    respondWith((q) => makeResponse(q));
    renderSearch();
    await settled();
    expect(status().textContent).toBe('No results for zzq');
  });

  it('appends that documents are unavailable', async () => {
    respondWith((q) =>
      makeResponse(q, {
        work_item: makeGroup('work_item', [makeItem()]),
        paperless_document: makeGroup('paperless_document', [], { status: 'unavailable' }),
      }),
    );
    renderSearch();
    await settled();
    expect(status().textContent).toBe('1 result Documents are not available right now.');
  });

  it('stays silent while loading', async () => {
    mockSearch.mockImplementation(() => new Promise(() => {}));
    renderSearch();
    await act(async () => {});
    expect(status().textContent).toBe('');
  });

  it('stays silent on error', async () => {
    mockSearch.mockRejectedValueOnce(new NetworkError('x', null));
    renderSearch();
    await screen.findByTestId('command-search-retry');
    expect(status().textContent).toBe('');
  });
});

describe('footer', () => {
  it('is shown for a wide container with a fine pointer, hidden from assistive technology', async () => {
    media.set('(pointer: fine)', true);
    respondWith((q) => makeResponse(q, { work_item: WORK_ITEMS }));
    renderSearch({ wide: true });
    await settled();
    const footer = screen.getByTestId('command-search-footer');
    expect(footer).toHaveAttribute('aria-hidden', 'true');
    expect(footer.textContent).toBe('↑ ↓ to move · Enter to open · Esc to close');
  });

  it('adds the call hint while a company with a phone is active', async () => {
    media.set('(pointer: fine)', true);
    respondWith((q) => makeResponse(q, { vendor: VENDOR }));
    renderSearch({ wide: true });
    await settled();
    expect(screen.getByTestId('command-search-footer').textContent).toContain(
      'Shift+Enter to call',
    );
  });

  it('is not shown without a fine pointer', async () => {
    respondWith(full);
    renderSearch({ wide: true });
    await settled();
    expect(screen.queryByTestId('command-search-footer')).toBeNull();
  });

  it('is not shown in the compact sheet', async () => {
    media.set('(pointer: fine)', true);
    respondWith(full);
    renderSearch({ wide: false });
    await settled();
    expect(screen.queryByTestId('command-search-footer')).toBeNull();
  });
});

describe('pointer and composition', () => {
  it('activates a destination, a "Show more" row and an external link on pointer move', async () => {
    mockStatus.mockResolvedValue({
      configured: true,
      reachable: true,
      error: null,
      paperlessUrl: 'https://docs.example.test',
      filterTag: null,
    });
    respondWith((q) =>
      makeResponse(q, {
        work_item: makeGroup('work_item', [makeItem({ id: 'a' }), makeItem({ id: 'b' })], {
          total: 6,
        }),
        paperless_document: DOC,
      }),
    );
    renderSearch({ startQuery: 'Gantt' });
    await settled();
    await waitFor(() => expect(option('paperless_document', 'd1').tagName).toBe('A'));
    fireEvent.pointerMove(option('work_item', 'b'));
    fireEvent.pointerMove(screen.getByTestId('command-search-dest-scheduleGantt'));
    expect(screen.getByTestId('command-search-dest-scheduleGantt')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.pointerMove(screen.getByTestId('command-search-more-work_item'));
    expect(screen.getByTestId('command-search-more-work_item')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.pointerMove(option('paperless_document', 'd1'));
    expect(option('paperless_document', 'd1')).toHaveAttribute('aria-selected', 'true');
  });

  it('titles an untitled diary entry with its type word and the day and month', async () => {
    respondWith((q) =>
      makeResponse(q, {
        diary_entry: makeGroup('diary_entry', [
          makeItem({ id: 'e1', label: null, kind: 'site_visit', date: '2026-03-04' }),
        ]),
      }),
    );
    renderSearch();
    await settled();
    const row = option('diary_entry', 'e1');
    expect(row.textContent).toMatch(/^Site visit · /);
    expect(row.textContent).toContain('4');
  });

  it('does not search while composing and searches the composed text', async () => {
    respondWith(full);
    renderSearch({ startQuery: '' });
    fireEvent.compositionStart(input());
    fireEvent.change(input(), { target: { value: 'ka' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(mockSearch).not.toHaveBeenCalled();
    expect(input().value).toBe('ka');
    fireEvent.compositionEnd(input(), { currentTarget: input() });
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    expect(mockSearch.mock.calls[0]?.[0]).toEqual({ q: 'ka', tradeIds: [] });
  });
});

describe('active option bookkeeping', () => {
  it('clears the active row when its option disappears', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    fireEvent.pointerMove(option('work_item', 'w2'));
    // A new, shorter response without w2 arrives for a longer query.
    respondWith((q) =>
      makeResponse(q, { work_item: makeGroup('work_item', [WORK_ITEMS.items[0]!]) }),
    );
    await userEvent.setup().type(input(), 'x');
    await waitFor(() =>
      expect(screen.queryByTestId('command-search-option-work_item-w2')).toBeNull(),
    );
    expect(input().getAttribute('aria-activedescendant')).toBe(option('work_item', 'w1').id);
  });

  it('drops the active descendant when the active destination vanishes while the old results stay', async () => {
    respondWith((q) => makeResponse(q, { work_item: WORK_ITEMS }));
    renderSearch({ startQuery: 'Gantt' });
    await settled();
    const dest = screen.getByTestId('command-search-dest-scheduleGantt');
    expect(input().getAttribute('aria-activedescendant')).toBe(dest.id);
    // The next response never arrives: the old results stay, but "Ganttx" matches no destination.
    mockSearch.mockImplementation(() => new Promise(() => {}));
    await userEvent.setup().type(input(), 'x');
    await waitFor(() =>
      expect(screen.queryByTestId('command-search-dest-scheduleGantt')).toBeNull(),
    );
    expect(option('work_item', 'w1')).toBeInTheDocument();
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    expect(
      screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true'),
    ).toHaveLength(0);
  });
});

describe('refetch and region behaviour', () => {
  /** Settles `zzq`, then starts a refetch (`zzqx`) that stays pending. */
  async function startRefetch(): Promise<(r: SearchResponse) => void> {
    respondWith(full);
    renderSearch();
    await settled();
    let resolveNext: (r: SearchResponse) => void = () => {};
    mockSearch.mockImplementationOnce(
      () => new Promise<SearchResponse>((resolve) => (resolveNext = resolve)),
    );
    await userEvent.setup().type(input(), 'x');
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('command-search-listbox')).toHaveAttribute('aria-busy', 'true'),
    );
    return (r) => resolveNext(r);
  }

  it('shows the spinner image while refetching and removes it afterwards', async () => {
    const resolveNext = await startRefetch();
    const row = screen.getByTestId('command-search-input-row');
    const spinner = row.querySelector('svg[role="img"]');
    expect(spinner).not.toBeNull();
    expect(spinner!.parentElement).toHaveAttribute('aria-hidden', 'true');
    await act(async () => resolveNext(full('zzqx')));
    await settled();
    expect(row.querySelector('svg[role="img"]')).toBeNull();
  });

  it('shows no spinner on the first load (the skeleton covers it)', async () => {
    mockSearch.mockImplementation(() => new Promise(() => {}));
    renderSearch();
    await act(async () => {});
    expect(
      screen.getByTestId('command-search-input-row').querySelector('svg[role="img"]'),
    ).toBeNull();
  });

  it('keeps the live region empty while a refetch is running, although old rows are shown', async () => {
    const resolveNext = await startRefetch();
    expect(option('work_item', 'w1')).toBeInTheDocument();
    expect(status().textContent).toBe('');
    await act(async () => resolveNext(full('zzqx')));
    await settled();
    expect(status().textContent).toBe('4 results');
  });

  it('stays silent when a refetch fails although the old rows are still shown', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    expect(status().textContent).toBe('4 results');
    mockSearch.mockRejectedValueOnce(new NetworkError('x', null));
    await userEvent.setup().type(input(), 'x');
    await screen.findByTestId('command-search-retry');
    expect(option('work_item', 'w1')).toBeInTheDocument();
    expect(status().textContent).toBe('');
  });

  it('scrolls the results back to the top when a new response settles', async () => {
    respondWith(full);
    renderSearch();
    await settled();
    const region = screen.getByTestId('command-search-results');
    const writes: number[] = [];
    Object.defineProperty(region, 'scrollTop', {
      configurable: true,
      get: () => 120,
      set: (value: number) => {
        writes.push(value);
      },
    });
    await userEvent.setup().type(input(), 'x');
    await waitFor(() => expect(writes).toContain(0));
  });

  it('shows no skeleton for a one-character query typed after a skeleton was due', async () => {
    mockSearch.mockImplementation(() => new Promise(() => {}));
    renderSearch({ startQuery: '' });
    await userEvent.setup().type(input(), 'zz');
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(document.querySelector('[aria-hidden="true"] [aria-busy="true"]')).not.toBeNull(),
    );
    await userEvent.setup().keyboard('{Backspace}');
    expect(document.querySelector('[aria-hidden="true"] [aria-busy="true"]')).toBeNull();
  });
});

describe('focus handover when choosing a result', () => {
  function trackFocus(element: HTMLElement): string[] {
    const events: string[] = [];
    element.addEventListener('focus', () => events.push(element.getAttribute('data-testid') ?? ''));
    return events;
  }

  it('never gives focus back to the list field it was opened from', async () => {
    respondWith(full);
    renderSearch({ startQuery: null, withListField: true });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('opener-field'));
    await settled();
    const focused = trackFocus(screen.getByTestId('list-field'));
    const openerFocused = trackFocus(screen.getByTestId('opener-field'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe(
        `Page ${routeUrl('workItem', { id: 'w1' })}`,
      ),
    );
    expect(focused).toEqual([]);
    expect(openerFocused).toEqual([]);
  });

  it('never gives focus back to the button that opened it', async () => {
    respondWith(full);
    renderSearch({ startQuery: null });
    const user = userEvent.setup();
    const opener = screen.getByTestId('opener');
    await user.click(opener);
    await waitFor(() => expect(document.activeElement).toBe(input()));
    await user.type(input(), 'zzq');
    await waitFor(() => expect(option('work_item', 'w1')).toBeInTheDocument());
    const focused = trackFocus(opener);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe(
        `Page ${routeUrl('workItem', { id: 'w1' })}`,
      ),
    );
    expect(focused).toEqual([]);
  });

  it('waits for a lazily rendered destination heading and focuses it, never the body', async () => {
    respondWith(full);
    renderSearch({ startQuery: null, headingDelay: 80 });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('opener'));
    await waitFor(() => expect(document.activeElement).toBe(input()));
    await user.type(input(), 'zzq');
    await waitFor(() => expect(option('work_item', 'w1')).toBeInTheDocument());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe(
        `Page ${routeUrl('workItem', { id: 'w1' })}`,
      ),
    );
  });
});

describe('CommandSearch trade names (#2213)', () => {
  // The stored name is German; the English translation of trades.roofing is "Roofing".
  const roofing = {
    id: 't-roof',
    name: 'Dachdecker',
    translationKey: 'trades.roofing',
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    vendorCount: 0,
  };
  const custom = { ...roofing, id: 't-custom', name: 'Roofing Extras', translationKey: null };
  const tiling = { ...roofing, id: 't-tile', name: 'Fliesen', translationKey: null };

  it('loads the trades once when the palette opens, not per keystroke', async () => {
    respondWith(full);
    renderSearch({ startQuery: '' });
    const user = userEvent.setup();
    await user.type(input(), 'roof');
    await settled();

    expect(mockFetchTrades).toHaveBeenCalledTimes(1);
  });

  it('sends the ids of trades whose displayed name contains the query', async () => {
    mockFetchTrades.mockResolvedValue({ trades: [roofing, custom, tiling] });
    respondWith(full);
    renderSearch({ startQuery: '' });
    await waitFor(() => expect(mockFetchTrades).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    const user = userEvent.setup();

    await user.type(input(), 'roof');

    await waitFor(() =>
      expect(mockSearch).toHaveBeenLastCalledWith(
        { q: 'roof', tradeIds: ['t-roof', 't-custom'] },
        expect.any(AbortSignal),
      ),
    );
  });

  it('matches the translated name, not the stored name', async () => {
    mockFetchTrades.mockResolvedValue({ trades: [roofing] });
    respondWith(full);
    renderSearch({ startQuery: '' });
    await waitFor(() => expect(mockFetchTrades).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    const user = userEvent.setup();

    await user.type(input(), 'dachd');

    await waitFor(() =>
      expect(mockSearch).toHaveBeenLastCalledWith(
        { q: 'dachd', tradeIds: [] },
        expect.any(AbortSignal),
      ),
    );
  });

  it('sends the same tradeIds when a group is expanded', async () => {
    mockFetchTrades.mockResolvedValue({ trades: [roofing] });
    mockSearch.mockImplementation((params) =>
      Promise.resolve(
        makeResponse(params.q, {
          work_item: makeGroup(
            'work_item',
            ['a', 'b', ...(params.types ? ['c'] : [])].map((id) => makeItem({ id })),
            { total: 3 },
          ),
        }),
      ),
    );
    renderSearch({ startQuery: 'roof' });
    await settled();
    fireEvent.click(screen.getByTestId('command-search-more-work_item'));
    await waitFor(() => expect(option('work_item', 'c')).toBeInTheDocument());

    expect(mockSearch).toHaveBeenLastCalledWith(
      { q: 'roof', types: ['work_item'], limit: 20, tradeIds: ['t-roof'] },
      expect.any(AbortSignal),
    );
  });

  it('keeps searching, without tradeIds, when the trades cannot be loaded', async () => {
    mockFetchTrades.mockRejectedValue(new NetworkError('offline', null));
    respondWith(full);
    renderSearch({ startQuery: 'roof' });
    await settled();

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSearch.mock.calls[0]![0]).toEqual({ q: 'roof', tradeIds: [] });
    expect(option('vendor', 'v1')).toBeInTheDocument();
  });

  it('ignores trades that arrive after the palette closed (no state update, no error)', async () => {
    let resolveTrades: (value: { trades: (typeof roofing)[] }) => void = () => {};
    mockFetchTrades.mockImplementation(
      () =>
        new Promise((resolve) => (resolveTrades = resolve)) as ReturnType<typeof mockFetchTrades>,
    );
    respondWith(full);
    const { unmount } = renderSearch({ startQuery: 'roof' });
    await settled();
    unmount();

    await act(async () => {
      resolveTrades({ trades: [roofing] });
      await Promise.resolve();
    });

    expect(mockFetchTrades).toHaveBeenCalledTimes(1);
  });
});

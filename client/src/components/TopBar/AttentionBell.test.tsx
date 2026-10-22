/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AttentionResponse, AttentionRow } from '@cornerstone/shared';
import { AttentionContext } from '../../attention/attentionContext.js';
import type { ShellAttention } from '../../attention/attentionContext.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { renderInAttentionProviders } from '../../test/attentionHarness.js';
import { makeAttention, makeRow } from '../../test/attentionFixtures.js';
import type * as BellModule from './AttentionBell.js';

let AttentionBell: typeof BellModule.AttentionBell;
let media: MatchMediaControl;

const lateTasks = (n: number): AttentionRow[] =>
  Array.from({ length: n }, (_, i) =>
    makeRow('N1', {
      subject: { type: 'work_item', id: `t${i}`, label: `Task ${i}`, area: null },
      link: { route: 'workItem', params: { id: `t${i}` }, query: {} },
    }),
  );

interface CtxOptions {
  data?: AttentionResponse | null;
  status?: ShellAttention['status'];
  includeSnoozed?: boolean;
}

const refreshStale = jest.fn<(maxAgeMs: number) => void>();
const retry = jest.fn<() => void>();
const refresh = jest.fn<() => void>();
const removeRow = jest.fn<(key: string, reason: 'done' | 'notNow') => void>();

function makeCtx({ data = null, status = 'ready', includeSnoozed = false }: CtxOptions = {}) {
  const homeHeadingRef = createRef<HTMLHeadingElement>();
  const ctx: ShellAttention = {
    data,
    status,
    error: status === 'error' ? { code: null } : null,
    includeSnoozed,
    setIncludeSnoozed: jest.fn(),
    refresh,
    retry,
    removeRow,
    refreshStale,
    homeHeadingRef,
  };
  return ctx;
}

function renderBell(
  options: CtxOptions & { withHomeHeading?: boolean } = {},
  route = '/budget/overview',
) {
  const { withHomeHeading = true, ...ctxOptions } = options;
  const ctx = makeCtx(ctxOptions);
  const utils = renderInAttentionProviders(
    <AttentionContext value={ctx}>
      {withHomeHeading ? (
        <h2 ref={ctx.homeHeadingRef} tabIndex={-1}>
          Home heading
        </h2>
      ) : null}
      <button type="button" data-testid="elsewhere">
        elsewhere
      </button>
      <AttentionBell />
    </AttentionContext>,
    { entries: [route] },
  );
  return { ...utils, ctx };
}

const bell = () => screen.getByTestId('top-bar-attention');
const openBell = () => fireEvent.click(bell());
const panel = () => screen.getByTestId('top-bar-attention-panel');
const bellRows = () => panel().querySelectorAll('li[data-testid^="bell-attention-row-"]');

beforeEach(async () => {
  if (!AttentionBell) ({ AttentionBell } = await import('./AttentionBell.js'));
  media = installMatchMedia({ '(min-width: 1024px)': true });
  refreshStale.mockReset();
  retry.mockReset();
  refresh.mockReset();
  removeRow.mockReset();
});

afterEach(() => {
  media.restore();
});

describe('AttentionBell button', () => {
  it('is named "Needs attention" with no badge while loading', () => {
    renderBell({ data: null, status: 'loading' });
    expect(screen.getByRole('button', { name: 'Needs attention' })).toBe(bell());
    expect(screen.queryByTestId('top-bar-attention-badge')).toBeNull();
  });

  it('is named "Needs attention" with no badge after a failed first load', () => {
    renderBell({ data: null, status: 'error' });
    expect(bell()).toHaveAccessibleName('Needs attention');
    expect(screen.queryByTestId('top-bar-attention-badge')).toBeNull();
  });

  it('is named "Needs attention" with no badge at a count of 0', () => {
    renderBell({ data: makeAttention([]) });
    expect(bell()).toHaveAccessibleName('Needs attention');
    expect(screen.queryByTestId('top-bar-attention-badge')).toBeNull();
  });

  it('with a count of 3 is named "Needs attention, 3" and shows the badge "3"', () => {
    renderBell({ data: makeAttention(lateTasks(3)) });
    expect(bell()).toHaveAccessibleName('Needs attention, 3');
    expect(screen.getByTestId('top-bar-attention-badge')).toHaveTextContent(/^3$/);
  });

  it('with a count of 1 uses the singular name key', () => {
    renderBell({ data: makeAttention(lateTasks(1)) });
    expect(bell()).toHaveAccessibleName('Needs attention, 1');
  });

  it('caps the badge at 99+ while the name keeps the exact count', () => {
    renderBell({ data: makeAttention(lateTasks(9), [], { count: 120 }) });
    expect(screen.getByTestId('top-bar-attention-badge')).toHaveTextContent(/^99\+$/);
    expect(bell()).toHaveAccessibleName('Needs attention, 120');
  });

  it('is a live popup trigger: no aria-disabled, haspopup dialog', () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    expect(bell()).not.toHaveAttribute('aria-disabled');
    expect(bell()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell()).toHaveAttribute('type', 'button');
  });

  it('sets aria-expanded and aria-controls only while open', () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    expect(bell()).toHaveAttribute('aria-expanded', 'false');
    expect(bell()).not.toHaveAttribute('aria-controls');
    openBell();
    expect(bell()).toHaveAttribute('aria-expanded', 'true');
    expect(bell()).toHaveAttribute('aria-controls', panel().id);
    openBell();
    expect(bell()).toHaveAttribute('aria-expanded', 'false');
    expect(bell()).not.toHaveAttribute('aria-controls');
  });

  it('badge equals data.count even when tidyUp has rows (AC4)', () => {
    const tidy = [
      makeRow('H4'),
      makeRow('H4', { subject: { type: 'work_item', id: 'wi-9', label: 'Tidy two', area: null } }),
    ];
    renderBell({ data: makeAttention(lateTasks(1), tidy) });
    expect(screen.getByTestId('top-bar-attention-badge')).toHaveTextContent(/^1$/);
    expect(bell()).toHaveAccessibleName('Needs attention, 1');
  });
});

describe('AttentionBell popover', () => {
  it('is closed until the bell is pressed', () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    expect(refreshStale).not.toHaveBeenCalled();
  });

  it('opens a dialog named "Needs attention" and refreshes with the 60 s rule', () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    expect(screen.getByRole('dialog', { name: 'Needs attention' })).toBe(panel());
    expect(refreshStale).toHaveBeenCalledTimes(1);
    expect(refreshStale).toHaveBeenCalledWith(60_000);
  });

  it('moves focus to the heading on open', async () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    const heading = within(panel()).getByRole('heading', { name: 'Needs attention' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('shows the count "(3)" beside the heading', () => {
    renderBell({ data: makeAttention(lateTasks(3)) });
    openBell();
    expect(within(panel()).getByText('(3)')).toBeInTheDocument();
  });

  it('shows no count beside the heading while there is no data', () => {
    renderBell({ data: null, status: 'loading' });
    openBell();
    expect(within(panel()).queryByText(/\(\d+\)/)).toBeNull();
  });

  it('lists the first 8 rows and a "Show all" control for the rest', () => {
    renderBell({ data: makeAttention(lateTasks(10)) });
    openBell();
    expect(bellRows()).toHaveLength(8);
    expect(within(panel()).getByTestId('bell-attention-show-all')).toHaveTextContent('10');
  });

  it('filters out snoozed rows even when includeSnoozed is on', () => {
    const rows = lateTasks(2);
    const snoozed = makeRow('N1', {
      subject: { type: 'work_item', id: 'snoozed-1', label: 'Snoozed task', area: null },
      snoozedUntil: '2026-03-20',
    });
    renderBell({ data: makeAttention([...rows, snoozed], [], { count: 2 }), includeSnoozed: true });
    openBell();
    expect(within(panel()).queryByTestId(`bell-attention-row-${snoozed.key}`)).toBeNull();
    expect(within(panel()).getByTestId(`bell-attention-row-${rows[0]!.key}`)).toBeInTheDocument();
    expect(within(panel()).getByTestId(`bell-attention-row-${rows[1]!.key}`)).toBeInTheDocument();
  });

  it('never renders tidy-up or standing entries (AC4)', () => {
    const tidy = makeRow('H4', {
      subject: { type: 'work_item', id: 'tidy-1', label: 'Tidy one', area: null },
    });
    const data = makeAttention(lateTasks(1), [tidy], {
      standing: [
        {
          key: 'standing-1',
          rule: 'S1',
          subject: { type: 'budget_source', id: 'src-1', label: 'Loan A', area: null },
          amount: 1000,
          params: { rule: 'S1', allocated: 1000, sourceAmount: 2000 },
          link: { route: 'budgetSources', params: {}, query: {} },
        },
      ],
    });
    renderBell({ data });
    openBell();
    expect(within(panel()).queryByTestId(`bell-attention-row-${tidy.key}`)).toBeNull();
    expect(within(panel()).queryByTestId('bell-attention-row-standing-1')).toBeNull();
    expect(bellRows()).toHaveLength(1);
  });

  it('shows a skeleton while the first load runs', () => {
    renderBell({ data: null, status: 'loading' });
    openBell();
    expect(panel().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(panel()).queryByTestId('top-bar-attention-retry')).toBeNull();
  });

  it('is not busy once data is shown', () => {
    renderBell({ data: makeAttention(lateTasks(1)) });
    openBell();
    expect(panel().querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('shows the failure message and Try again calls retry', () => {
    renderBell({ data: null, status: 'error' });
    openBell();
    expect(within(panel()).getByText("Couldn't load Needs attention.")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByTestId('top-bar-attention-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps the rows and offers no error when a refresh failed but data exists', () => {
    renderBell({ data: makeAttention(lateTasks(1)), status: 'error' });
    openBell();
    expect(within(panel()).queryByTestId('top-bar-attention-retry')).toBeNull();
    expect(bellRows()).toHaveLength(1);
  });

  it('shows the empty state at a count of 0', () => {
    renderBell({ data: makeAttention([]) });
    openBell();
    expect(within(panel()).getByText('✓')).toBeInTheDocument();
    expect(within(panel()).queryByTestId('bell-attention-list')).toBeNull();
  });

  it('shows the empty state when every row is snoozed', () => {
    const snoozed = makeRow('N1', { snoozedUntil: '2026-03-20' });
    renderBell({ data: makeAttention([snoozed], [], { count: 0 }), includeSnoozed: true });
    openBell();
    expect(within(panel()).queryByTestId('bell-attention-list')).toBeNull();
    expect(within(panel()).getByText('✓')).toBeInTheDocument();
  });

  it('always has the Open Home footer link to Home', () => {
    renderBell({ data: null, status: 'loading' });
    openBell();
    const link = within(panel()).getByTestId('top-bar-attention-open-home');
    expect(link).toHaveTextContent('Open Home');
    expect(link).toHaveAttribute('href', '/');
  });
});

describe('AttentionBell closing', () => {
  it('Escape closes the panel and focuses the bell', async () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    await waitFor(() => expect(within(panel()).getByRole('heading')).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    expect(bell()).toHaveFocus();
  });

  it('pressing the bell while open closes it and focus stays on the bell', () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    bell().focus();
    fireEvent.mouseDown(bell());
    openBell();
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    expect(bell()).toHaveFocus();
    expect(refreshStale).toHaveBeenCalledTimes(1);
  });

  it('an outside press does not throw when the bell unmounts before the frame runs', async () => {
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent) => errors.push(e.error);
    window.addEventListener('error', onError);
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    fireEvent.mouseDown(document.body);
    cleanup();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
  });

  it('an outside press closes the panel and returns focus to the bell when it would be lost', async () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    await waitFor(() => expect(within(panel()).getByRole('heading')).toHaveFocus());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    await waitFor(() => expect(bell()).toHaveFocus());
  });

  it('an outside press on another control keeps focus there instead of stealing it', async () => {
    renderBell({ data: makeAttention(lateTasks(2)) });
    openBell();
    const other = screen.getByTestId('elsewhere');
    other.focus();
    fireEvent.mouseDown(other);
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(other).toHaveFocus();
  });

  it('a row link navigates and closes the panel', () => {
    const rows = lateTasks(2);
    const { log } = renderBell({ data: makeAttention(rows) });
    openBell();
    const row = within(panel()).getByTestId(`bell-attention-row-${rows[0]!.key}`);
    fireEvent.click(within(row).getAllByRole('link')[0]!);
    expect(log.actions.some((a) => a.startsWith('PUSH /tasks/') || a.startsWith('PUSH '))).toBe(
      true,
    );
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
  });
});

describe('AttentionBell Open Home', () => {
  it('off Home it pushes Home, closes the panel and does not move focus to Home', async () => {
    const { log } = renderBell({ data: makeAttention(lateTasks(1)) }, '/budget/overview');
    openBell();
    fireEvent.click(within(panel()).getByTestId('top-bar-attention-open-home'));
    expect(log.actions).toEqual(['PUSH /']);
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(screen.getByText('Home heading')).not.toHaveFocus();
  });

  it('on Home it replaces the entry, closes the panel and focuses the Home heading', async () => {
    const { log } = renderBell({ data: makeAttention(lateTasks(1)) }, '/');
    openBell();
    fireEvent.click(within(panel()).getByTestId('top-bar-attention-open-home'));
    expect(log.actions).toEqual(['REPLACE /']);
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    await waitFor(() => expect(screen.getByText('Home heading')).toHaveFocus());
  });

  it('on Home without a mounted Home heading it still closes without throwing', async () => {
    renderBell({ data: makeAttention(lateTasks(1)), withHomeHeading: false }, '/');
    openBell();
    fireEvent.click(within(panel()).getByTestId('top-bar-attention-open-home'));
    expect(screen.queryByTestId('top-bar-attention-panel')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(bell()).toBeInTheDocument();
  });

  it('on a path the route map does not know it behaves like off Home (push)', () => {
    const { log } = renderBell({ data: makeAttention(lateTasks(1)) }, '/no-such-page');
    openBell();
    fireEvent.click(within(panel()).getByTestId('top-bar-attention-open-home'));
    expect(log.actions).toEqual(['PUSH /']);
  });

  it('a later route dismissal off Home does not reuse a stale Home-focus flag', async () => {
    renderBell({ data: makeAttention(lateTasks(1)) }, '/budget/overview');
    openBell();
    fireEvent.click(within(panel()).getByTestId('top-bar-attention-open-home'));
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    });
    expect(screen.getByText('Home heading')).not.toHaveFocus();
  });
});

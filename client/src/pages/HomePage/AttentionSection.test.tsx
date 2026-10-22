/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import type { AttentionResponse } from '@cornerstone/shared';
import type * as AttentionApiTypes from '../../lib/attentionApi.js';
import type * as SectionModule from './AttentionSection.js';
import type * as AttentionHookModule from '../../hooks/useAttention.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { renderHome } from '../../test/homeRender.js';
import { makeAttention, makeRow } from '../../test/attentionFixtures.js';

const mockGetAttention = jest.fn<typeof AttentionApiTypes.getAttention>();
const mockNotNow = jest.fn<typeof AttentionApiTypes.notNow>();
const mockUndoNotNow = jest.fn<typeof AttentionApiTypes.undoNotNow>();
jest.unstable_mockModule('../../lib/attentionApi.js', () => ({
  getAttention: mockGetAttention,
  notNow: mockNotNow,
  undoNotNow: mockUndoNotNow,
}));

let AttentionSection: typeof SectionModule.AttentionSection;
let useAttention: typeof AttentionHookModule.useAttention;
let media: MatchMediaControl;

function Live() {
  const attention = useAttention();
  const headingRef = useRef<HTMLHeadingElement>(null);
  return <AttentionSection attention={attention} headingRef={headingRef} />;
}

/** N-th distinct late task (N1) row. */
function taskRows(count: number) {
  return Array.from({ length: count }, (_v, i) =>
    makeRow('N1', {
      subject: { type: 'work_item', id: `wi-${i + 1}`, label: `Task ${i + 1}`, area: null },
      link: { route: 'workItem', params: { id: `wi-${i + 1}` }, query: {} },
    }),
  );
}

function lateData(count: number, overrides: Partial<AttentionResponse> = {}) {
  return makeAttention(taskRows(count), [], overrides);
}

beforeEach(async () => {
  if (!AttentionSection) {
    ({ AttentionSection } = await import('./AttentionSection.js'));
    ({ useAttention } = await import('../../hooks/useAttention.js'));
  }
  mockGetAttention.mockReset();
  mockNotNow.mockReset();
  mockUndoNotNow.mockReset();
  media = installMatchMedia({ '(min-width: 768px)': true });
});

afterEach(() => media.restore());

describe('AttentionSection', () => {
  it('shows a skeleton and a busy section while the first load runs', () => {
    mockGetAttention.mockReturnValue(new Promise(() => {}));
    renderHome(<Live />);
    expect(screen.getByTestId('home-needs-attention')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an error with a retry that reloads', async () => {
    mockGetAttention.mockRejectedValueOnce(new Error('boom'));
    renderHome(<Live />);

    expect(await screen.findByText("Couldn't load Needs attention.")).toBeInTheDocument();
    mockGetAttention.mockResolvedValue(lateData(1));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Task 1')).toBeInTheDocument();
    expect(mockGetAttention).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state and a zero count when nothing needs attention', async () => {
    mockGetAttention.mockResolvedValue(makeAttention([]));
    renderHome(<Live />);

    expect(await screen.findByText('Nothing needs you right now.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Needs attention/ })).toHaveTextContent('(0)');
  });

  it('shows the count in the heading and the first eight rows with Show all (n)', async () => {
    mockGetAttention.mockResolvedValue(lateData(10));
    renderHome(<Live />);

    await screen.findByText('Task 1');
    expect(screen.getByRole('heading', { name: /Needs attention/ })).toHaveTextContent('(10)');
    expect(screen.getAllByTestId(/^needs-attention-row-N1:work_item:wi-\d+$/)).toHaveLength(8);

    await userEvent.click(screen.getByRole('button', { name: 'Show all (10)' }));
    expect(screen.getAllByTestId(/^needs-attention-row-N1:work_item:wi-\d+$/)).toHaveLength(10);
  });

  it('does not offer Show all with eight rows or fewer', async () => {
    mockGetAttention.mockResolvedValue(lateData(8));
    renderHome(<Live />);

    await screen.findByText('Task 1');
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('shows no catch-up line below three late tasks', async () => {
    mockGetAttention.mockResolvedValue(lateData(2));
    renderHome(<Live />);

    await screen.findByText('Task 1');
    expect(screen.queryByTestId('home-catch-up-line')).toBeNull();
  });

  it('shows the catch-up line and opens the dialog from Review all', async () => {
    mockGetAttention.mockResolvedValue(lateData(4, { catchUp: { lateTaskCount: 4 } }));
    renderHome(<Live />);

    const line = await screen.findByTestId('home-catch-up-line');
    expect(line).toHaveTextContent('4 tasks are late');
    await userEvent.click(within(line).getByRole('button', { name: 'Review all' }));

    expect(await screen.findByRole('dialog', { name: 'Late tasks (4)' })).toBeInTheDocument();
  });

  it('returns focus to Review all when the catch-up dialog is closed', async () => {
    mockGetAttention.mockResolvedValue(lateData(4, { catchUp: { lateTaskCount: 4 } }));
    renderHome(<Live />);
    const review = await screen.findByRole('button', { name: 'Review all' });
    await userEvent.click(review);

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(review).toHaveFocus());
  });

  it('returns focus to Review all when the dialog was opened without focusing it', async () => {
    mockGetAttention.mockResolvedValue(lateData(4, { catchUp: { lateTaskCount: 4 } }));
    renderHome(<Live />);
    const review = await screen.findByRole('button', { name: 'Review all' });
    // A synthetic click does not move focus, so the opener the dialog remembers is the body.
    fireEvent.click(review);

    await userEvent.click(await screen.findByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(review).toHaveFocus());
  });

  it('falls back to the section heading when Review all is gone after closing', async () => {
    mockGetAttention.mockResolvedValue(lateData(3, { catchUp: { lateTaskCount: 3 } }));
    renderHome(<Live />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review all' }));
    const dialog = await screen.findByRole('dialog');

    // Hiding one task drops the late count below three; the line (and its button) disappears.
    mockNotNow.mockResolvedValue({ key: 'x', snoozedUntil: '2026-03-17' });
    mockGetAttention.mockResolvedValue(lateData(2));
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Not now' })[0]!);
    await waitFor(() => expect(screen.queryByTestId('home-catch-up-line')).toBeNull());

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Needs attention/ })).toHaveFocus(),
    );
  });

  it('hides a row with Not now, counts it as hidden and offers Undo', async () => {
    mockGetAttention.mockResolvedValue(lateData(2));
    mockNotNow.mockResolvedValue({ key: 'N1:work_item:wi-1', snoozedUntil: '2026-03-17' });
    renderHome(<Live />);
    const row = await screen.findByTestId('needs-attention-row-N1:work_item:wi-1');

    // The silent refetch after the action returns the server's truth.
    mockGetAttention.mockResolvedValue(
      lateData(1, { snoozedCount: 1, rows: taskRows(2).slice(1) }),
    );
    await userEvent.click(within(row).getByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(screen.queryByText('Task 1')).toBeNull());
    expect(mockNotNow).toHaveBeenCalledWith('N1:work_item:wi-1');
    expect(screen.getByTestId('home-attention-hidden')).toHaveTextContent('1 hidden for now');
    expect(await screen.findByText(/Hidden for 7 days\./)).toBeInTheDocument();
  });

  it('shows the hidden-for-now line only with snoozed rows and toggles them in and out', async () => {
    mockGetAttention.mockResolvedValue(lateData(1, { snoozedCount: 2 }));
    renderHome(<Live />);

    const hidden = await screen.findByTestId('home-attention-hidden');
    expect(hidden).toHaveTextContent('2 hidden for now');
    const show = within(hidden).getByRole('button', { name: 'Show hidden' });
    expect(show.className).toMatch(/btnText/);
    await userEvent.click(show);

    await waitFor(() =>
      expect(mockGetAttention).toHaveBeenLastCalledWith({ includeSnoozed: true }),
    );
    expect(await screen.findByRole('button', { name: 'Hide again' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Hide again' }));
    await waitFor(() =>
      expect(mockGetAttention).toHaveBeenLastCalledWith({ includeSnoozed: false }),
    );
  });

  it('shows no hidden-for-now line when nothing is hidden', async () => {
    mockGetAttention.mockResolvedValue(lateData(1));
    renderHome(<Live />);

    await screen.findByText('Task 1');
    expect(screen.queryByTestId('home-attention-hidden')).toBeNull();
  });
});

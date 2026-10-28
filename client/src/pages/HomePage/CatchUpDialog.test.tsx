/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import type { AttentionResponse } from '@cornerstone/shared';
import type * as AttentionApiTypes from '../../lib/attentionApi.js';
import type * as DialogModule from './CatchUpDialog.js';
import type * as HookModule from '../../hooks/useAttention.js';
import { installMatchMedia } from '../../test/matchMediaControl.js';
import type { MatchMediaControl } from '../../test/matchMediaControl.js';
import { renderHome } from '../../test/homeRender.js';
import { makeAttention, makeRow } from '../../test/attentionFixtures.js';

const mockNotNow = jest.fn<typeof AttentionApiTypes.notNow>();
jest.unstable_mockModule('../../lib/attentionApi.js', () => ({
  getAttention: jest.fn<typeof AttentionApiTypes.getAttention>(),
  notNow: mockNotNow,
  undoNotNow: jest.fn<typeof AttentionApiTypes.undoNotNow>(),
}));

let CatchUpDialog: typeof DialogModule.CatchUpDialog;
let removeAttentionRow: typeof HookModule.removeAttentionRow;
let media: MatchMediaControl;

function late(id: string, rule: 'N1' | 'N2' = 'N1') {
  return makeRow(rule, {
    subject: { type: 'work_item', id, label: `Task ${id}`, area: null },
    link: { route: 'workItem', params: { id }, query: {} },
  });
}

function group(ids: string[]) {
  return makeRow('N2', {
    subject: { type: 'group', id: 'g1', label: null, area: null },
    params: {
      rule: 'N2',
      kind: 'group',
      plannedStartDate: '2026-03-06',
      items: ids.map((id) => ({
        id,
        label: `Member ${id}`,
        area: null,
        daysLate: 4,
        holdsUp: { count: 0, startingWithin14Days: 0 },
      })),
    },
  });
}

function Harness({ initial, onCloseSpy }: { initial: AttentionResponse; onCloseSpy?: () => void }) {
  const [data, setData] = useState(initial);
  const returnRef = useRef<HTMLElement>(null);
  return (
    <CatchUpDialog
      data={data}
      onRemove={(key, reason) => setData((prev) => removeAttentionRow(prev, key, reason))}
      onRefresh={() => {}}
      onClose={() => onCloseSpy?.()}
      returnFocusRef={returnRef}
    />
  );
}

beforeEach(async () => {
  if (!CatchUpDialog) {
    ({ CatchUpDialog } = await import('./CatchUpDialog.js'));
    ({ removeAttentionRow } = await import('../../hooks/useAttention.js'));
  }
  mockNotNow.mockReset();
  media = installMatchMedia({ '(min-width: 768px)': true });
});

afterEach(() => media.restore());

const THREE = makeAttention([late('wi-1'), late('wi-2'), late('wi-3', 'N2')], [], {
  catchUp: { lateTaskCount: 3 },
});

describe('CatchUpDialog', () => {
  it('lists every late task with the count in the title', () => {
    renderHome(<Harness initial={THREE} />);

    const dialog = screen.getByRole('dialog', { name: 'Late tasks (3)' });
    expect(within(dialog).getByText('Task wi-1')).toBeInTheDocument();
    expect(within(dialog).getByText('Task wi-3')).toBeInTheDocument();
    expect(within(dialog).getByText('3 late tasks left')).toHaveAttribute('role', 'status');
  });

  it('gives each task of a group its own row with Start and Reschedule', () => {
    const data = makeAttention([late('wi-1'), group(['m1', 'm2'])], [], {
      catchUp: { lateTaskCount: 3 },
    });
    renderHome(<Harness initial={data} />);

    expect(screen.getByRole('dialog', { name: 'Late tasks (3)' })).toBeInTheDocument();
    const member = screen.getByTestId('catch-up-row-N2:work_item:m1');
    expect(within(member).getByText('Member m1')).toBeInTheDocument();
    expect(within(member).getByTestId('catch-up-row-N2:work_item:m1-start')).toBeInTheDocument();
    expect(within(member).getByRole('link', { name: 'Reschedule' })).toHaveAttribute(
      'href',
      '/project/work-items/m1?tab=timing#reschedule',
    );
  });

  it('leaves out snoozed rows and non-task rows', () => {
    const snoozed = { ...late('wi-9'), snoozedUntil: '2026-03-17' };
    const data = makeAttention([late('wi-1'), snoozed, makeRow('N3')], [], {
      catchUp: { lateTaskCount: 3 },
    });
    renderHome(<Harness initial={data} />);

    expect(screen.getByRole('dialog', { name: 'Late tasks (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Task wi-9')).toBeNull();
  });

  it('updates the title and status when a row is hidden with Not now', async () => {
    mockNotNow.mockResolvedValue({ key: 'k', snoozedUntil: '2026-03-17' });
    renderHome(<Harness initial={THREE} />);

    const first = screen.getByTestId('catch-up-row-N1:work_item:wi-1');
    await userEvent.click(within(first).getByRole('button', { name: 'Not now' }));

    expect(await screen.findByRole('dialog', { name: 'Late tasks (2)' })).toBeInTheDocument();
    expect(screen.getByText('2 late tasks left')).toBeInTheDocument();
    expect(screen.queryByText('Task wi-1')).toBeNull();
  });

  it('uses the singular status wording for one task left', () => {
    renderHome(<Harness initial={makeAttention([late('wi-1')])} />);
    expect(screen.getByText('1 late task left')).toBeInTheDocument();
  });

  it('shows All caught up when the last row is cleared', async () => {
    mockNotNow.mockResolvedValue({ key: 'k', snoozedUntil: '2026-03-17' });
    renderHome(<Harness initial={makeAttention([late('wi-1')])} />);

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(await screen.findByText('All caught up.')).toBeInTheDocument();
    expect(screen.getByText('No late tasks left')).toBeInTheDocument();
  });

  it('shows the empty state at once when it opens with no late task left', () => {
    renderHome(<Harness initial={makeAttention([])} />);

    expect(screen.getByText('All caught up.')).toBeInTheDocument();
    expect(screen.getByText('No late tasks left')).toHaveAttribute('role', 'status');
  });

  it('moves focus to Close when the last row is cleared', async () => {
    mockNotNow.mockResolvedValue({ key: 'k', snoozedUntil: '2026-03-17' });
    renderHome(<Harness initial={makeAttention([late('wi-1')])} />);

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await screen.findByText('All caught up.');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus(), {
      timeout: 500,
    });
  });

  it('shows the empty state at once when no late task is left', () => {
    renderHome(<Harness initial={makeAttention([])} />);
    expect(screen.getByText('All caught up.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Late tasks (0)' })).toBeInTheDocument();
  });

  it('closes itself before Reschedule navigates', async () => {
    const onClose = jest.fn();
    renderHome(<Harness initial={THREE} onCloseSpy={onClose} />);

    const first = screen.getByTestId('catch-up-row-N1:work_item:wi-1');
    await userEvent.click(within(first).getByRole('link', { name: 'Reschedule' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/project/work-items/wi-1?tab=timing#reschedule',
    );
  });

  it('closes with the Close button', async () => {
    const onClose = jest.fn();
    renderHome(<Harness initial={THREE} onCloseSpy={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a full-screen sheet below 768 px with the same rows', () => {
    media.set('(min-width: 768px)', false);
    renderHome(<Harness initial={THREE} />);

    expect(screen.getByTestId('home-catch-up-sheet')).toBeInTheDocument();
    expect(screen.getByText('Task wi-2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

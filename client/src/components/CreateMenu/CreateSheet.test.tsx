/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { routeUrl } from '@cornerstone/shared';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { CreateMenuProvider, useCreateContext } from './CreateMenuContext.js';
import { CreateSheet } from './CreateSheet.js';
import { LAST_QUICK_LOG_KEY } from './quickLogStorage.js';

function Context({ areaId, date }: { areaId?: string; date?: string }) {
  useCreateContext({ areaId, date });
  return null;
}

function setup(options: { money?: boolean; open?: boolean; onChange?: (o: boolean) => void } = {}) {
  const log = createRouterLog();
  const onChange = options.onChange ?? (() => {});
  render(
    <RecordingRouter entries={['/budget/invoices']} log={log}>
      <CreateMenuProvider
        moneyPage={options.money ?? false}
        wide={false}
        sheetOpen={options.open ?? true}
        onSheetOpenChange={onChange}
      >
        <Context areaId="a1" date="2026-03-01" />
        <CreateSheet />
      </CreateMenuProvider>
    </RecordingRouter>,
  );
  return log;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete document.documentElement.dataset.scrollLocked;
  localStorage.clear();
});

const ROW_IDS = [
  'create-sheet-diaryEntry',
  'create-sheet-task',
  'create-sheet-purchase',
  'create-sheet-invoice',
  'create-sheet-offer',
  'create-sheet-company',
  'create-sheet-milestone',
];
const tileIds = () =>
  Array.from(document.querySelectorAll('[data-testid^="quick-log-"]'))
    .map((el) => el.getAttribute('data-testid'))
    .filter((id) => id !== 'quick-log');
const rowIds = () =>
  within(screen.getByRole('dialog'))
    .getAllByRole('link')
    .map((a) => a.getAttribute('data-testid'))
    .filter((id) => id?.startsWith('create-sheet-'));

function Controlled({ open }: { open: boolean }) {
  return (
    <RecordingRouter entries={['/budget/invoices']} log={createRouterLog()}>
      <CreateMenuProvider
        moneyPage={false}
        wide={false}
        sheetOpen={open}
        onSheetOpenChange={() => {}}
      >
        <CreateSheet />
      </CreateMenuProvider>
    </RecordingRouter>
  );
}

describe('CreateSheet', () => {
  it('is a dialog named "New" while open and inert while closed', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'New' })).toBe(screen.getByTestId('create-sheet'));
  });

  it('exposes no dialog while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('create-sheet')).toHaveAttribute('inert');
  });

  it('lists the three tiles first, then the rows in order as links with pre-fill', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('link')
        .map((a) => a.getAttribute('data-testid')),
    ).toEqual(['quick-log-photo', 'quick-log-note', 'quick-log-delivery', ...ROW_IDS]);
    expect(rowIds()).toEqual(ROW_IDS);
    expect(screen.getByTestId('create-sheet-task')).toHaveAttribute(
      'href',
      routeUrl('workItemNew', undefined, { areaId: 'a1' }),
    );
    expect(screen.getByTestId('create-sheet-milestone')).toHaveAttribute(
      'href',
      routeUrl('milestoneNew', undefined, { date: '2026-03-01' }),
    );
  });

  it('shows the Money group (a second list) only on Money pages', () => {
    setup({ money: true });
    expect(screen.getByTestId('create-sheet-fundingSource')).toBeInTheDocument();
    expect(screen.getByTestId('create-sheet-grant')).toBeInTheDocument();
    expect(screen.getAllByRole('list')).toHaveLength(2);
  });

  it('has a single list without the Money rows off the Money pages', () => {
    setup();
    expect(screen.queryByTestId('create-sheet-fundingSource')).toBeNull();
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  it('a plain click closes the sheet and pushes the target with state', () => {
    const onChange = jest.fn<(open: boolean) => void>();
    const log = setup({ onChange });
    fireEvent.click(screen.getByTestId('create-sheet-task'));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(log.actions).toEqual([`PUSH ${routeUrl('workItemNew', undefined, { areaId: 'a1' })}`]);
    expect(log.states[0]).toMatchObject({ createOpener: true, background: expect.anything() });
  });

  it('a modified click does not close the sheet', () => {
    const onChange = jest.fn<(open: boolean) => void>();
    setup({ onChange });
    fireEvent.click(screen.getByTestId('create-sheet-task'), { ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape closes the sheet', () => {
    const onChange = jest.fn<(open: boolean) => void>();
    setup({ onChange });
    fireEvent.keyDown(screen.getByTestId('create-sheet'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith(false);
  });

  describe('Log now tiles', () => {
    it('come before the first row in DOM order and the first tile is focused on open', () => {
      setup();
      const tile = screen.getByTestId('quick-log-photo');
      const row = screen.getByTestId('create-sheet-diaryEntry');
      expect(tile.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(tile).toHaveFocus();
    });

    it('are not a list: the list count stays 1 and no tile carries a create-sheet id', () => {
      setup();
      expect(screen.getAllByRole('list')).toHaveLength(1);
      expect(within(screen.getByRole('list')).queryByTestId('quick-log-photo')).toBeNull();
      expect(tileIds().every((id) => !id?.startsWith('create-sheet-'))).toBe(true);
    });

    it('PO guard: all 7 general rows stay, in order, below the tiles', () => {
      setup();
      expect(rowIds()).toEqual(ROW_IDS);
      const lastTile = screen.getByTestId('quick-log-delivery');
      for (const id of ROW_IDS) {
        expect(
          lastTile.compareDocumentPosition(screen.getByTestId(id)) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('PO guard: both Money rows stay on Money pages, after the general rows', () => {
      setup({ money: true });
      expect(rowIds()).toEqual([...ROW_IDS, 'create-sheet-fundingSource', 'create-sheet-grant']);
      expect(screen.getAllByRole('list')).toHaveLength(2);
      expect(tileIds()).toEqual(['quick-log-photo', 'quick-log-note', 'quick-log-delivery']);
    });

    it('choosing a tile stores it, closes the sheet and pushes the capture screen', () => {
      const onChange = jest.fn<(open: boolean) => void>();
      const log = setup({ onChange });
      fireEvent.click(screen.getByTestId('quick-log-delivery'));
      expect(localStorage.getItem(LAST_QUICK_LOG_KEY)).toBe('delivery');
      expect(onChange).toHaveBeenCalledWith(false);
      expect(log.actions).toEqual(['PUSH /diary/new?areaId=a1&start=delivery']);
    });

    it('a modified click on a tile neither stores nor closes', () => {
      const onChange = jest.fn<(open: boolean) => void>();
      setup({ onChange });
      fireEvent.click(screen.getByTestId('quick-log-note'), { metaKey: true });
      expect(localStorage.getItem(LAST_QUICK_LOG_KEY)).toBeNull();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('reads the stored tile when the sheet is open at mount', () => {
      localStorage.setItem(LAST_QUICK_LOG_KEY, 'note');
      setup();
      expect(tileIds()).toEqual(['quick-log-note', 'quick-log-photo', 'quick-log-delivery']);
      expect(screen.getByTestId('quick-log-note')).toHaveFocus();
    });

    it('reopening after a choice puts that tile first and focused', () => {
      const { rerender } = render(<Controlled open />);
      expect(tileIds()[0]).toBe('quick-log-photo');
      rerender(<Controlled open={false} />);
      localStorage.setItem(LAST_QUICK_LOG_KEY, 'note');
      rerender(<Controlled open />);
      expect(tileIds()).toEqual(['quick-log-note', 'quick-log-photo', 'quick-log-delivery']);
      expect(screen.getByTestId('quick-log-note')).toHaveFocus();
    });

    it('does not reorder while open when storage changes (read on open only)', () => {
      const { rerender } = render(<Controlled open />);
      localStorage.setItem(LAST_QUICK_LOG_KEY, 'delivery');
      rerender(<Controlled open />);
      expect(tileIds()[0]).toBe('quick-log-photo');
    });
  });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { routeUrl } from '@cornerstone/shared';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { CreateMenuProvider, useCreateContext } from './CreateMenuContext.js';
import { CreateSheet } from './CreateSheet.js';

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

afterEach(() => {
  delete document.documentElement.dataset.scrollLocked;
});

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

  it('lists the rows in order as links with pre-fill', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog)
        .getAllByRole('link')
        .map((a) => a.getAttribute('data-testid')),
    ).toEqual([
      'create-sheet-diaryEntry',
      'create-sheet-task',
      'create-sheet-purchase',
      'create-sheet-invoice',
      'create-sheet-offer',
      'create-sheet-company',
      'create-sheet-milestone',
    ]);
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
});

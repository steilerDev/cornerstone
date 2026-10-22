/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Stored column order that disagrees with the declared columns: a stale key, and a declared
// column the stored order does not know yet.
const mockMoveColumn = jest.fn();
jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: () => ({
    visibleColumns: new Set(['a', 'b', 'c']),
    columnOrder: ['ghost', 'b', 'a'],
    toggleColumn: jest.fn(),
    moveColumn: mockMoveColumn,
    resetToDefaults: jest.fn(),
  }),
}));

import type * as ObjectListModule from './ObjectList.js';
import type * as UseObjectListModule from './useObjectList.js';
import type * as CommandSearchModule from '../CommandSearch/CommandSearchContext.js';
import type { ObjectListConfig } from './types.js';

interface Row {
  id: string;
}
const CONFIG: ObjectListConfig<Row> = {
  listKey: 'rows',
  testIdPrefix: 'rows',
  sort: { options: [{ value: 'id', label: 'Id' }], defaultValue: 'id', defaultOrder: 'asc' },
};

let ObjectList: (typeof ObjectListModule)['ObjectList'];
let useObjectList: (typeof UseObjectListModule)['useObjectList'];
let CommandSearchProvider: (typeof CommandSearchModule)['CommandSearchProvider'];

function Host() {
  const list = useObjectList<Row>({
    config: CONFIG,
    getKey: (r) => r.id,
    fetchPage: () => Promise.resolve({ items: [{ id: 'r1' }], totalItems: 1 }),
  });
  return (
    <ObjectList<Row>
      list={list}
      config={CONFIG}
      labels={{
        title: 'Rows',
        search: 'Search rows',
        resultCount: (n) => `${n} rows`,
        empty: 'none',
        noMatch: 'no match',
        loadFailed: 'failed',
      }}
      primary={{ label: 'New row', onClick: jest.fn() }}
      title={(r) => ({ text: r.id, to: `/rows/${r.id}` })}
      titleHeader="Row"
      columns={[
        { key: 'a', label: 'Alpha', render: () => 'a' },
        { key: 'b', label: 'Beta', render: () => 'b' },
        { key: 'c', label: 'Gamma', render: () => 'c' },
      ]}
      facts={() => [
        { key: '1', content: 'x' },
        { key: '2', content: 'y' },
        { key: '3', content: 'z' },
      ]}
    />
  );
}

beforeEach(async () => {
  mockMoveColumn.mockReset();
  ({ ObjectList } = (await import('./ObjectList.js')) as typeof ObjectListModule);
  ({ useObjectList } = (await import('./useObjectList.js')) as typeof UseObjectListModule);
  ({ CommandSearchProvider } =
    (await import('../CommandSearch/CommandSearchContext.js')) as typeof CommandSearchModule);
});

async function openDialog() {
  const { ToastProvider } = await import('../Toast/ToastContext.js');
  render(
    <MemoryRouter>
      <ToastProvider>
        <CommandSearchProvider isOpen={false} onOpen={() => undefined} onClose={() => undefined}>
          <Host />
        </CommandSearchProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByTestId('rows-row-r1');
  await userEvent.click(screen.getByTestId('rows-page-menu'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Columns…' }));
  return screen.findByRole('dialog', { name: 'Columns' });
}

function drag(from: HTMLElement, to: HTMLElement) {
  jest.spyOn(to, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 10 } as DOMRect);
  const dataTransfer = { effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(from, { dataTransfer });
  fireEvent.dragOver(to, { dataTransfer, clientY: 9 });
  fireEvent.drop(to, { dataTransfer });
}

describe('ObjectList column order with stale stored keys', () => {
  it('orders stored keys first, appends unknown columns and skips ghost keys', async () => {
    await openDialog();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(0, 4)).toEqual(['Row', 'Beta', 'Alpha', 'Gamma']);
  });

  it('maps a dialog move to indexes of the stored order', async () => {
    const dialog = await openDialog();
    const items = within(dialog)
      .getAllByRole('checkbox')
      .map((c) => c.closest('div[draggable]') as HTMLElement);
    // Dialog rows: Beta, Alpha, Gamma. Beta -> Alpha is positions 1 -> 2 of ['ghost','b','a'].
    drag(items[0] as HTMLElement, items[1] as HTMLElement);
    await waitFor(() => expect(mockMoveColumn).toHaveBeenCalledWith(1, 2));
  });

  it('ignores a move whose column is not in the stored order', async () => {
    const dialog = await openDialog();
    const items = within(dialog)
      .getAllByRole('checkbox')
      .map((c) => c.closest('div[draggable]') as HTMLElement);
    // Gamma is declared but unknown to the stored order: moving it (or onto it) does nothing.
    drag(items[2] as HTMLElement, items[1] as HTMLElement);
    drag(items[1] as HTMLElement, items[2] as HTMLElement);
    expect(mockMoveColumn).not.toHaveBeenCalled();
  });
});

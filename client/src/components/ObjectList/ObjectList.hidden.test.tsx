/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Stored order: a, h (hidden by the host), b; c is declared but unknown to the stored order.
const mockMoveColumn = jest.fn();
jest.unstable_mockModule('../../hooks/useColumnPreferences.js', () => ({
  useColumnPreferences: () => ({
    visibleColumns: new Set(['a', 'h', 'b', 'c']),
    columnOrder: ['a', 'h', 'b'],
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
interface Child {
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

function Host({ hidden }: { hidden?: readonly string[] }) {
  const list = useObjectList<Row>({
    config: CONFIG,
    getKey: (r) => r.id,
    fetchPage: () => Promise.resolve({ items: [{ id: 'r1' }], totalItems: 1 }),
  });
  return (
    <ObjectList<Row, undefined, Child>
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
      hiddenColumnKeys={hidden}
      columns={[
        { key: 'a', label: 'Alpha', render: () => 'cell-a' },
        { key: 'h', label: 'Hidden', render: () => 'cell-h' },
        { key: 'b', label: 'Beta', render: () => 'cell-b' },
        { key: 'c', label: 'Gamma', render: () => 'cell-c' },
      ]}
      expandable={{
        getChildren: () => [{ id: 'c1' }],
        getChildKey: (c) => c.id,
        isDefaultExpanded: () => true,
        getExpandLabel: () => 'Toggle',
        renderChildCells: (_c, _p, keys) =>
          keys.map((key) => (
            <td key={key} data-testid={`child-cell-${key}`}>
              child
            </td>
          )),
        renderChildCard: () => <span>card</span>,
      }}
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

async function renderHost(hidden?: readonly string[]) {
  const { ToastProvider } = await import('../Toast/ToastContext.js');
  render(
    <MemoryRouter>
      <ToastProvider>
        <CommandSearchProvider isOpen={false} onOpen={() => undefined} onClose={() => undefined}>
          <Host hidden={hidden} />
        </CommandSearchProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByTestId('rows-row-r1');
}

async function openDialog() {
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

describe('ObjectList hiddenColumnKeys', () => {
  it('shows every visible column when nothing is hidden', async () => {
    await renderHost();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers.slice(0, 5)).toEqual(['Row', 'Alpha', 'Hidden', 'Beta', 'Gamma']);
  });

  it('renders no header and no cell for a hidden column, in the rows and the child rows', async () => {
    await renderHost(['h']);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Hidden');
    expect(screen.queryByText('cell-h')).toBeNull();
    expect(screen.queryByTestId('child-cell-h')).toBeNull();
    expect(screen.getByTestId('child-cell-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-cell-c')).toBeInTheDocument();
  });

  it('does not list a hidden column in Columns…', async () => {
    await renderHost(['h']);
    const dialog = await openDialog();
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(dialog).getByText('Alpha')).toBeInTheDocument();
    expect(within(dialog).getByText('Gamma')).toBeInTheDocument();
    expect(within(dialog).queryByText('Hidden')).toBeNull();
  });

  it('moves the right column when a hidden key sits between the two in the stored order', async () => {
    await renderHost(['h']);
    const dialog = await openDialog();
    const items = within(dialog)
      .getAllByRole('checkbox')
      .map((c) => c.closest('div[draggable]') as HTMLElement);
    // Dialog rows: Alpha, Beta, Gamma. Alpha -> Beta is stored indexes 0 -> 2 (h sits at 1).
    drag(items[0] as HTMLElement, items[1] as HTMLElement);
    await waitFor(() => expect(mockMoveColumn).toHaveBeenCalledWith(0, 2));
  });

  it('keeps the Columns… entry while at least one column is listed, and drops it when all are hidden', async () => {
    await renderHost(['a', 'h', 'b', 'c']);
    await userEvent.click(screen.getByTestId('rows-page-menu'));
    expect(screen.queryByRole('menuitem', { name: 'Columns…' })).toBeNull();
  });
});

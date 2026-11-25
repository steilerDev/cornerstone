/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ObjectList } from './ObjectList.js';
import { useObjectList } from './useObjectList.js';
import { CommandSearchProvider } from '../CommandSearch/CommandSearchContext.js';
import { ToastProvider } from '../Toast/ToastContext.js';
import type { ObjectListColumn, ObjectListConfig } from './types.js';

interface Row {
  id: string;
}
const CONFIG: ObjectListConfig<Row> = {
  listKey: 'rows',
  testIdPrefix: 'rows',
  sort: {
    options: [
      { value: 'id', label: 'Id' },
      { value: 'wait', label: 'Waits for' },
    ],
    defaultValue: 'id',
    defaultOrder: 'asc',
  },
};

const COLUMNS: ObjectListColumn<Row>[] = [
  {
    key: 'wait',
    label: 'Waits for',
    render: () => 'a',
    sortValue: 'wait',
    termHints: ['waitsFor', 'holdsUp'],
  },
  { key: 'plain', label: 'Plain', render: () => 'b' },
  { key: 'end', label: 'Amount', render: () => 'c', align: 'end', termHints: ['range'] },
];

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
      columns={COLUMNS}
      facts={() => [
        { key: '1', content: 'x' },
        { key: '2', content: 'y' },
        { key: '3', content: 'z' },
      ]}
    />
  );
}

async function renderList() {
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
}

describe('ObjectList column termHints (#2258)', () => {
  it('renders the info button after the sort button, never inside it', async () => {
    await renderList();
    const sortButton = screen.getByTestId('rows-sort-header-wait');
    const info = screen.getByRole('button', { name: 'Explain these terms' });
    expect(sortButton).not.toContainElement(info);
    expect(info.parentElement).toBe(sortButton.parentElement);
    expect(sortButton.nextElementSibling).toBe(info);
  });

  it('does not sort when the info button is clicked, and opens the definitions', async () => {
    await renderList();
    const header = screen.getByTestId('rows-sort-header-wait').closest('th')!;
    expect(header).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header).getByRole('button', { name: 'Explain these terms' }));
    expect(header).toHaveAttribute('aria-sort', 'none');
    const dialog = await screen.findByRole('dialog', { name: 'What these terms mean' });
    expect(dialog).toHaveTextContent('Waits for');
    expect(dialog).toHaveTextContent('Holds up');
  });

  it('labels a single-term header button with the term and omits the button on other headers', async () => {
    await renderList();
    expect(screen.getByRole('button', { name: 'Explain “Range”' })).toBeInTheDocument();
    const plain = screen.getByRole('columnheader', { name: 'Plain' });
    expect(within(plain).queryByRole('button')).toBeNull();
  });
});

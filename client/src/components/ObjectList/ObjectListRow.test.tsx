/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OriginProbe, probedPath } from '../../test/originProbe';
import { findDuplicateTestIds } from '../../test/findDuplicateTestIds';
import { ObjectListRow } from './ObjectListRow.js';
import type { ObjectListRowProps } from './ObjectListRow.js';
import type { ObjectListFact } from './types.js';

interface Task {
  id: string;
  title: string;
  steps: string[];
}
const task: Task = { id: 't1', title: 'Tile the hallway', steps: ['Buy tiles', 'Lay tiles'] };

const facts = (): readonly [ObjectListFact, ObjectListFact, ObjectListFact] => [
  { key: 'area', content: 'House › Ground floor › Kitchen', keep: true },
  { key: 'due', content: 'Due 3 Mar' },
  { key: 'who', content: 'Example Plumbing Co' },
];

function baseProps(overrides: Partial<ObjectListRowProps<Task, string>> = {}) {
  const props: ObjectListRowProps<Task, string> = {
    surface: 'table',
    item: task,
    itemKey: 't1',
    testIdPrefix: 'tasks',
    title: { text: task.title, to: '/tasks/t1' },
    lang: 'en',
    originState: { origin: { to: '/tasks', name: 'Tasks' } },
    columns: [
      { key: 'area', label: 'Area', render: () => 'Kitchen' },
      { key: 'cost', label: 'Cost', render: () => '120', align: 'end' },
    ],
    hasStatus: false,
    hasCommand: false,
    hasMenu: false,
    facts,
    expanded: false,
    onToggleExpanded: jest.fn(),
    selection: null,
    onRowFocus: jest.fn(),
    ...overrides,
  };
  return props;
}

function renderRow(overrides: Partial<ObjectListRowProps<Task, string>> = {}) {
  const props = baseProps(overrides);
  const row = <ObjectListRow<Task, string> {...props} />;
  const view = render(
    <MemoryRouter initialEntries={['/tasks']}>
      <OriginProbe />
      {props.surface === 'table' ? (
        <table>
          <tbody>{row}</tbody>
        </table>
      ) : (
        <ul>{row}</ul>
      )}
    </MemoryRouter>,
  );
  return { props, ...view };
}

const expandable = {
  getChildren: (item: Task) => item.steps,
  getChildKey: (child: string) => child,
  renderChildCells: (child: string, _p: Task, keys: readonly string[]) =>
    keys.map((k) => <td key={k}>{`${child}-${k}`}</td>),
  renderChildCard: (child: string) => <span>{child}</span>,
  getExpandLabel: (_i: Task, expanded: boolean, n: number) =>
    `${expanded ? 'Hide' : 'Show'} ${n} steps`,
};

describe('ObjectListRow', () => {
  it('W1: the title is a real anchor with href, no target, carrying the origin state', () => {
    renderRow();
    const link = screen.getByTestId('tasks-title-t1');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/tasks/t1');
    expect(link).not.toHaveAttribute('target');
    fireEvent.click(link);
    expect(probedPath()).toBe('/tasks/t1');
    expect(JSON.parse(screen.getByTestId('probe-state').textContent ?? '{}')).toEqual({
      origin: { to: '/tasks', name: 'Tasks' },
    });
  });

  it('table: renders columns with alignment and fires onRowFocus on focus', () => {
    const { props } = renderRow();
    const row = screen.getByTestId('tasks-row-t1');
    expect(within(row).getByText('Kitchen')).toBeInTheDocument();
    expect(within(row).getByText('120')).toBeInTheDocument();
    fireEvent.focus(screen.getByTestId('tasks-title-t1'));
    expect(props.onRowFocus).toHaveBeenCalledWith('t1');
  });

  it('table: renders secondary content under the title', () => {
    renderRow({ renderSecondary: (item) => <em>{`secondary ${item.id}`}</em> });
    expect(screen.getByText('secondary t1')).toBeInTheDocument();
  });

  it('UX2: the row checkbox sits in a label and clicking the label toggles it', () => {
    const onChange = jest.fn();
    renderRow({ selection: { selected: false, onChange } });
    const box = screen.getByTestId('tasks-select-t1');
    expect(box.closest('label')).not.toBeNull();
    expect(box).toHaveAccessibleName('Select Tile the hallway');
    fireEvent.click(box.closest('label') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('W2: checkbox, status, command and menu are siblings of the link, not inside it', () => {
    const onChange = jest.fn();
    renderRow({
      selection: { selected: true, onChange },
      hasStatus: true,
      hasCommand: true,
      hasMenu: true,
      renderStatus: () => <span data-testid="status">Open</span>,
      renderCommand: () => <button type="button">Mark done</button>,
      rowMenu: () => [{ id: 'edit', label: 'Edit', onClick: jest.fn() }],
    });
    const link = screen.getByTestId('tasks-title-t1');
    for (const el of [
      screen.getByTestId('tasks-select-t1'),
      screen.getByTestId('status'),
      screen.getByRole('button', { name: 'Mark done' }),
      screen.getByTestId('tasks-row-menu-t1'),
    ]) {
      expect(link.contains(el)).toBe(false);
    }
    const box = screen.getByRole('checkbox', { name: 'Select Tile the hallway' });
    expect(box).toBeChecked();
    expect(screen.getByTestId('tasks-row-t1')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Actions for Tile the hallway' })).toBeVisible();
  });

  it('table: no row menu when the host returns no entries; no checkbox without selection', () => {
    renderRow({ hasMenu: true, rowMenu: () => [] });
    expect(screen.queryByTestId('tasks-row-menu-t1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tasks-select-t1')).not.toBeInTheDocument();
    expect(screen.getByTestId('tasks-row-t1')).not.toHaveAttribute('data-selected');
  });

  it('table: empty status/command cells when the host gives no renderers', () => {
    renderRow({ hasStatus: true, hasCommand: true });
    expect(screen.getByTestId('tasks-row-t1').querySelectorAll('td')).toHaveLength(5);
  });

  it('W3: card surface shows three facts with aria-hidden separators and data-keep', () => {
    renderRow({
      surface: 'card',
      renderSecondary: () => <span>second line</span>,
      renderStatus: () => <span data-testid="status">Open</span>,
      selection: { selected: false, onChange: jest.fn() },
      rowMenu: () => [{ id: 'edit', label: 'Edit', onClick: jest.fn() }],
    });
    const card = screen.getByTestId('tasks-row-mobile-t1');
    expect(card.tagName).toBe('LI');
    expect(within(card).getByText('House › Ground floor › Kitchen')).toHaveAttribute(
      'data-keep',
      'true',
    );
    expect(within(card).getByText('Due 3 Mar')).not.toHaveAttribute('data-keep');
    const separators = card.querySelectorAll('[aria-hidden="true"]');
    expect(separators).toHaveLength(2);
    // Two-line cards: the secondary line (area and company chips) is table-only.
    expect(within(card).queryByText('second line')).not.toBeInTheDocument();
    expect(within(card).getByTestId('status')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-select-mobile-t1')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-title-mobile-t1')).toHaveAttribute('href', '/tasks/t1');
  });

  it('card: no status, secondary or menu when absent; focus reports the key', () => {
    const { props } = renderRow({ surface: 'card' });
    fireEvent.focus(screen.getByTestId('tasks-title-mobile-t1'));
    expect(props.onRowFocus).toHaveBeenCalledWith('t1');
    expect(screen.queryByTestId('tasks-row-menu-mobile-t1')).not.toBeInTheDocument();
  });

  it('W4: user text gets lang only when isUserText', () => {
    const { unmount } = renderRow({
      lang: 'de',
      title: { text: 'Fliesen', to: '/t', isUserText: true },
    });
    expect(screen.getByTestId('tasks-title-t1')).toHaveAttribute('lang', 'de');
    unmount();
    renderRow({ lang: 'de', title: { text: 'Untitled task', to: '/t' } });
    expect(screen.getByTestId('tasks-title-t1')).not.toHaveAttribute('lang');
  });

  it('W4: user text without an entries language sets no lang', () => {
    renderRow({ lang: null, title: { text: 'Fliesen', to: '/t', isUserText: true } });
    expect(screen.getByTestId('tasks-title-t1')).not.toHaveAttribute('lang');
  });

  it('W5: table child rows toggle hidden and the button names the count', () => {
    const onToggleExpanded = jest.fn();
    const { rerender, props } = renderRow({ expandable, onToggleExpanded });
    const toggle = screen.getByTestId('tasks-expand-t1');
    expect(toggle).toHaveAccessibleName('Show 2 steps');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const child = screen.getByTestId('tasks-child-Buy tiles');
    expect(child).toHaveAttribute('hidden');
    expect(child).toHaveTextContent('Buy tiles-area');
    expect(toggle.getAttribute('aria-controls')).toContain(child.id);
    fireEvent.click(toggle);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    rerender(
      <MemoryRouter>
        <table>
          <tbody>
            <ObjectListRow<Task, string> {...props} expanded />
          </tbody>
        </table>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tasks-child-Buy tiles')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('tasks-expand-t1')).toHaveAccessibleName('Hide 2 steps');
  });

  it('table: expandable with no children has no toggle and no child rows', () => {
    renderRow({ expandable: { ...expandable, getChildren: () => [] } });
    expect(screen.queryByTestId('tasks-expand-t1')).not.toBeInTheDocument();
  });

  it('W5: card children are a hidden list toggled by the expand button', () => {
    renderRow({ surface: 'card', expandable });
    const toggle = screen.getByTestId('tasks-expand-mobile-t1');
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(list).toHaveAttribute('hidden');
    expect(within(list as HTMLElement).getByText('Lay tiles')).toBeInTheDocument();
  });

  it('card: expandable with no children renders nothing extra', () => {
    renderRow({ surface: 'card', expandable: { ...expandable, getChildren: () => [] } });
    expect(screen.queryByTestId('tasks-expand-mobile-t1')).not.toBeInTheDocument();
  });

  it('W6: both surfaces mounted together have unique test ids, with a row menu open', () => {
    const rowMenu = () => [{ id: 'edit', label: 'Edit', onClick: jest.fn() }];
    const common = baseProps({
      hasMenu: true,
      rowMenu,
      selection: { selected: false, onChange: jest.fn() },
      expandable,
    });
    const { container } = render(
      <MemoryRouter>
        <table>
          <tbody>
            <ObjectListRow<Task, string> {...common} surface="table" />
          </tbody>
        </table>
        <ul>
          <ObjectListRow<Task, string> {...common} surface="card" />
        </ul>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('tasks-row-menu-t1'));
    expect(findDuplicateTestIds(container)).toEqual([]);
    expect(findDuplicateTestIds(document.body)).toEqual([]);
  });
});

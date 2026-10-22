/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ObjectListGroup } from './ObjectListGroup.js';
import type { ObjectListGroupProps } from './ObjectListGroup.js';

function renderGroup(overrides: Partial<Omit<ObjectListGroupProps, 'children'>> = {}) {
  const props: Omit<ObjectListGroupProps, 'children'> = {
    surface: 'table',
    groupKey: 'ground',
    label: 'Ground floor',
    count: 3,
    loaded: 3,
    open: true,
    onToggle: jest.fn(),
    select: null,
    columnCount: 4,
    testIdPrefix: 'tasks',
    ...overrides,
  };
  const body =
    props.surface === 'table' ? (
      <table>
        <ObjectListGroup {...props}>
          <tr>
            <td>Tile the hallway</td>
          </tr>
        </ObjectListGroup>
      </table>
    ) : (
      <ObjectListGroup {...props}>
        <li>Tile the hallway</li>
      </ObjectListGroup>
    );
  return { props, ...render(body) };
}

function controlled(toggle: HTMLElement): HTMLElement | null {
  return document.getElementById(toggle.getAttribute('aria-controls') ?? '');
}

describe('ObjectListGroup', () => {
  it('table surface: heading cell spans the columns and the closed body is hidden', () => {
    renderGroup({ open: false });
    const toggle = screen.getByTestId('tasks-group-toggle-ground');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const body = controlled(toggle);
    expect(body?.tagName).toBe('TBODY');
    expect(body).toHaveAttribute('hidden');
    expect(document.querySelector('th[colspan="4"]')).not.toBeNull();
  });

  it('table surface: open body is visible and the toggle calls onToggle', () => {
    const { props } = renderGroup();
    const toggle = screen.getByTestId('tasks-group-toggle-ground');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(controlled(toggle)).not.toHaveAttribute('hidden');
    fireEvent.click(toggle);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the count, and "n of m" when fewer rows are loaded', () => {
    const { unmount } = renderGroup();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Ground floor(3)');
    unmount();
    renderGroup({ loaded: 2, count: 5 });
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('(2 of 5)');
  });

  it('renders a badge in the toggle', () => {
    renderGroup({ badge: <span data-testid="late-badge">Late</span> });
    expect(
      within(screen.getByTestId('tasks-group-toggle-ground')).getByTestId('late-badge'),
    ).toBeInTheDocument();
  });

  it('card surface: labelled section with mobile test ids and a hidden list', () => {
    renderGroup({ surface: 'card', open: false });
    const section = screen.getByTestId('tasks-group-mobile-ground');
    expect(section).toHaveAttribute('aria-labelledby');
    const toggle = screen.getByTestId('tasks-group-toggle-mobile-ground');
    const list = controlled(toggle);
    expect(list?.tagName).toBe('UL');
    expect(list).toHaveAttribute('hidden');
  });

  it('has no group checkbox without bulk actions', () => {
    renderGroup();
    expect(screen.queryByRole('checkbox', { hidden: true })).not.toBeInTheDocument();
  });

  it('group checkbox reflects state and reports changes', () => {
    const onChange = jest.fn();
    renderGroup({ select: { checked: false, indeterminate: true, onChange } });
    const box = screen.getByLabelText('Select Ground floor') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalled();
  });
});

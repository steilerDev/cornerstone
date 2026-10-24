/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest } from '@jest/globals';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { ColumnSettingsList } from './ColumnSettingsList.js';

const COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'amount', label: 'Amount' },
  { key: 'owner', label: 'Owner' },
];

function setup(props: Partial<React.ComponentProps<typeof ColumnSettingsList>> = {}) {
  const onToggleColumn = jest.fn<(key: string) => void>();
  const onMoveColumn = jest.fn<(from: number, to: number) => void>();
  const onResetToDefaults = jest.fn<() => void>();
  render(
    <ColumnSettingsList
      columns={COLUMNS}
      visibleColumns={new Set(['title', 'amount'])}
      onToggleColumn={onToggleColumn}
      onMoveColumn={onMoveColumn}
      onResetToDefaults={onResetToDefaults}
      {...props}
    />,
  );
  return { onToggleColumn, onMoveColumn, onResetToDefaults };
}

function rows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[draggable]'));
}

function rect(top: number, height: number): DOMRect {
  return { top, height } as DOMRect;
}

/** jsdom has no DragEvent, so clientY is defined by hand. */
function dragOver(el: HTMLElement, dataTransfer: object, clientY: number) {
  const event = createEvent.dragOver(el, { dataTransfer });
  Object.defineProperty(event, 'clientY', { value: clientY });
  fireEvent(el, event);
}

describe('ColumnSettingsList', () => {
  it('lists every column as a checkbox reflecting visibility', () => {
    setup();
    expect(screen.getByLabelText('Title')).toBeChecked();
    expect(screen.getByLabelText('Amount')).toBeChecked();
    expect(screen.getByLabelText('Owner')).not.toBeChecked();
  });

  it('toggles a column through its checkbox', () => {
    const { onToggleColumn } = setup();
    fireEvent.click(screen.getByLabelText('Owner'));
    expect(onToggleColumn).toHaveBeenCalledWith('owner');
  });

  it('resets to defaults', () => {
    const { onResetToDefaults } = setup();
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(onResetToDefaults).toHaveBeenCalledTimes(1);
  });

  it('renders the h3 title only when given', () => {
    setup({ title: 'Columns' });
    expect(screen.getByRole('heading', { level: 3, name: 'Columns' })).toBeInTheDocument();
  });

  it('renders no heading without a title', () => {
    setup();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('prefixes checkbox ids with idPrefix (default col)', () => {
    setup({ idPrefix: 'tasks' });
    expect(screen.getByLabelText('Owner')).toHaveAttribute('id', 'tasks-owner');
    expect(document.getElementById('col-owner')).toBeNull();
  });

  it('uses col- ids by default', () => {
    setup();
    expect(screen.getByLabelText('Owner')).toHaveAttribute('id', 'col-owner');
  });

  it('keeps the first column fixed: not draggable and no drag handle', () => {
    setup();
    const [first, second] = rows();
    expect(first).toHaveAttribute('draggable', 'false');
    expect(second).toHaveAttribute('draggable', 'true');
    expect(first!.querySelector('button')).toBeNull();
    expect(second!.querySelector('button')).not.toBeNull();
  });

  it('moves a dragged column to the drop target', () => {
    const { onMoveColumn } = setup();
    const [, amount, owner] = rows();
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    amount!.getBoundingClientRect = () => rect(0, 20);
    fireEvent.dragStart(owner!, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('move');
    dragOver(amount!, dataTransfer, 1);
    expect(amount!.className).toContain('columnCheckboxItemDropAbove');
    fireEvent.drop(amount!, { dataTransfer });
    expect(onMoveColumn).toHaveBeenCalledWith(2, 1);
    expect(amount!.className).not.toContain('columnCheckboxItemDropAbove');
  });

  it('marks the lower half of a target as drop-below and the dragged row as dragging', () => {
    setup();
    const [, amount, owner] = rows();
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    amount!.getBoundingClientRect = () => rect(0, 20);
    fireEvent.dragStart(owner!, { dataTransfer });
    expect(owner!.className).toContain('columnCheckboxItemDragging');
    dragOver(amount!, dataTransfer, 19);
    expect(amount!.className).toContain('columnCheckboxItemDropBelow');
  });

  it('clears the indicator on drag leave and on drag end', () => {
    setup();
    const [, amount, owner] = rows();
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    amount!.getBoundingClientRect = () => rect(0, 20);
    fireEvent.dragStart(owner!, { dataTransfer });
    dragOver(amount!, dataTransfer, 1);
    fireEvent.dragLeave(amount!);
    expect(amount!.className).not.toContain('DropAbove');
    dragOver(amount!, dataTransfer, 1);
    fireEvent.dragEnd(owner!);
    expect(amount!.className).not.toContain('DropAbove');
    expect(owner!.className).not.toContain('Dragging');
  });

  it('does not move when dropped on itself, on the fixed first column, or with no drag', () => {
    const { onMoveColumn } = setup();
    const [first, amount, owner] = rows();
    const dataTransfer = { effectAllowed: '', dropEffect: '' };
    amount!.getBoundingClientRect = () => rect(0, 20);
    fireEvent.dragStart(amount!, { dataTransfer });
    dragOver(amount!, dataTransfer, 1);
    fireEvent.drop(amount!, { dataTransfer });
    fireEvent.dragStart(owner!, { dataTransfer });
    dragOver(first!, dataTransfer, 1);
    fireEvent.drop(first!, { dataTransfer });
    fireEvent.drop(owner!, { dataTransfer });
    expect(onMoveColumn).not.toHaveBeenCalled();
  });
});

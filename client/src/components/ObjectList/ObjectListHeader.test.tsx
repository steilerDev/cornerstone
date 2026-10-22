/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ObjectListHeader } from './ObjectListHeader.js';
import type { ObjectListHeaderProps } from './ObjectListHeader.js';

afterEach(() => {
  jest.restoreAllMocks();
});

function renderHeader(overrides: Partial<ObjectListHeaderProps> = {}) {
  const props: ObjectListHeaderProps = {
    title: 'Tasks',
    count: '(12)',
    primary: { label: 'New task', onClick: jest.fn() },
    testIdPrefix: 'tasks',
    ...overrides,
  };
  return {
    props,
    ...render(
      <MemoryRouter>
        <ObjectListHeader {...props} />
      </MemoryRouter>,
    ),
  };
}

describe('ObjectListHeader', () => {
  it('shows the count next to the title (H1)', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tasks');
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('shows "(n of m)" content passed by the host (H2)', () => {
    renderHeader({ count: '(3 of 12)' });
    expect(screen.getByText('(3 of 12)')).toBeInTheDocument();
  });

  it('shows no count while the count is unknown (H3)', () => {
    renderHeader({ count: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Tasks$/);
  });

  it('renders exactly one primary button that calls onClick, with the default test id (H4)', () => {
    const { props } = renderHeader();
    const button = screen.getByTestId('tasks-new');
    expect(button).toHaveTextContent('New task');
    fireEvent.click(button);
    expect(props.primary.onClick).toHaveBeenCalledTimes(1);
  });

  it('uses the primary testId when given', () => {
    renderHeader({ primary: { label: 'New task', onClick: jest.fn(), testId: 'custom-new' } });
    expect(screen.getByTestId('custom-new')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-new')).not.toBeInTheDocument();
  });

  it('lists the list entries and Print, without Columns when not on the table surface', () => {
    renderHeader({
      menuItems: [{ id: 'export', label: 'Export tasks', onClick: jest.fn() }],
    });
    fireEvent.click(screen.getByTestId('tasks-page-menu'));
    expect(screen.getByRole('menuitem', { name: 'Export tasks' })).toBeInTheDocument();
    expect(screen.getByTestId('tasks-print')).toBeInTheDocument();
    expect(screen.queryByTestId('tasks-columns')).not.toBeInTheDocument();
  });

  it('offers Columns… when onColumns is given and calls it', () => {
    const onColumns = jest.fn();
    renderHeader({ onColumns });
    fireEvent.click(screen.getByTestId('tasks-page-menu'));
    fireEvent.click(screen.getByTestId('tasks-columns'));
    expect(onColumns).toHaveBeenCalledTimes(1);
  });

  it('prints on the next animation frame so the menu is not in the printout', () => {
    let frame: FrameRequestCallback | null = null;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 7;
    });
    const print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    renderHeader();
    fireEvent.click(screen.getByTestId('tasks-page-menu'));
    fireEvent.click(screen.getByTestId('tasks-print'));
    expect(print).not.toHaveBeenCalled();
    (frame as unknown as FrameRequestCallback)(0);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending print frame on unmount', () => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 42);
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { unmount } = renderHeader();
    fireEvent.click(screen.getByTestId('tasks-page-menu'));
    fireEvent.click(screen.getByTestId('tasks-print'));
    unmount();
    expect(cancel).toHaveBeenCalledWith(42);
  });

  it('does not cancel anything on unmount when no print is pending', () => {
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const { unmount } = renderHeader();
    unmount();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('forwards headingRef and menuTriggerRef', () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const menuTriggerRef = createRef<HTMLButtonElement>();
    renderHeader({ headingRef, menuTriggerRef });
    expect(headingRef.current?.tagName).toBe('H1');
    expect(menuTriggerRef.current).toBe(screen.getByTestId('tasks-page-menu'));
  });
});

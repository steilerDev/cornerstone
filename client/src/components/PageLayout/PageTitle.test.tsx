/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { createRef } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter';
import { resolveNavActive } from '../../navigation/navActive.js';
import { navSections } from '../../navigation/navConfig.js';
import { ViewMenuContext, viewMenuFor } from '../../navigation/viewMenu.js';
import type { ViewMenuModel } from '../../navigation/viewMenu.js';
import { PageTitle } from './PageTitle.js';

const sections = navSections({ role: 'admin', paperlessConfigured: true });

function modelAt(path: string): ViewMenuModel {
  const model = viewMenuFor(resolveNavActive(path, sections), sections);
  if (!model) throw new Error(`no view menu at ${path}`);
  return model;
}

function renderTitle(options: {
  model: ViewMenuModel | null;
  path?: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  entries?: string[];
}) {
  const log = createRouterLog();
  const path = options.path ?? '/project/work-items';
  render(
    <RecordingRouter entries={options.entries ?? [path]} log={log}>
      <ViewMenuContext value={options.model}>
        <PageTitle title="Tasks" className="title" headingRef={options.headingRef} />
      </ViewMenuContext>
    </RecordingRouter>,
  );
  return { log };
}

describe('PageTitle without a view menu', () => {
  it('renders a plain h1 with no button and no tabIndex', () => {
    renderTitle({ model: null });
    const h1 = screen.getByRole('heading', { level: 1, name: 'Tasks' });
    expect(h1).toHaveClass('title');
    expect(h1).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button')).toBeNull();
    expect(h1.innerHTML).toBe('Tasks');
  });

  it('makes the h1 programmatically focusable when given a headingRef', () => {
    const ref = createRef<HTMLHeadingElement>();
    renderTitle({ model: null, headingRef: ref });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(ref.current).toBe(h1);
  });
});

describe('PageTitle with a view menu', () => {
  it('wraps a menu button in the single h1 and keeps the heading text clean', () => {
    renderTitle({ model: modelAt('/project/work-items') });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveClass('title');
    expect(h1.textContent).toBe('Tasks');
    const trigger = within(h1).getByRole('button', { name: 'Tasks' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toBe(screen.getByTestId('view-menu-trigger'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('hides the chevron from assistive technology', () => {
    renderTitle({ model: modelAt('/project/work-items') });
    expect(screen.getByTestId('view-menu-trigger').querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('keeps the heading focusable with a headingRef', () => {
    const ref = createRef<HTMLHeadingElement>();
    renderTitle({ model: modelAt('/project/work-items'), headingRef: ref });
    expect(ref.current).toBe(screen.getByRole('heading', { level: 1 }));
    expect(ref.current).toHaveAttribute('tabindex', '-1');
  });

  it('omits tabindex without a headingRef', () => {
    renderTitle({ model: modelAt('/project/work-items') });
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('tabindex');
  });

  it('lists the main view first and marks the current one with aria-current and a check mark', () => {
    renderTitle({ model: modelAt('/project/work-items') });
    fireEvent.click(screen.getByTestId('view-menu-trigger'));
    const items = within(screen.getByTestId('view-menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent?.replace('✓', ''))).toEqual([
      'Tasks',
      'Schedule',
      'Calendar',
      'Milestones',
    ]);
    expect(items[0]).toBe(screen.getByTestId('view-menu-main-workItems'));
    expect(items[1]).toBe(screen.getByTestId('view-menu-item-scheduleGantt'));
    expect(items[0]).toHaveAttribute('aria-current', 'page');
    expect(items[0]).toHaveTextContent('✓');
    expect(items[1]).not.toHaveAttribute('aria-current');
  });

  it('marks the active view, not the main one, on a view page', () => {
    renderTitle({ model: modelAt('/schedule/gantt'), path: '/schedule/gantt' });
    fireEvent.click(screen.getByTestId('view-menu-trigger'));
    expect(screen.getByTestId('view-menu-item-scheduleGantt')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('view-menu-main-workItems')).not.toHaveAttribute('aria-current');
  });

  it('links each entry to its route', () => {
    renderTitle({ model: modelAt('/project/work-items') });
    fireEvent.click(screen.getByTestId('view-menu-trigger'));
    expect(screen.getByTestId('view-menu-item-scheduleCalendar')).toHaveAttribute(
      'href',
      '/schedule/calendar',
    );
  });

  it('switching a view REPLACEs the history entry (no new entry)', () => {
    const { log } = renderTitle({ model: modelAt('/project/work-items') });
    fireEvent.click(screen.getByTestId('view-menu-trigger'));
    fireEvent.click(screen.getByTestId('view-menu-item-scheduleGantt'));
    expect(log.actions).toEqual(['REPLACE /schedule/gantt']);
    expect(log.entries).toEqual(['/schedule/gantt']);
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['middle button', { button: 1 }],
  ])('does not intercept a %s click (the browser handles it)', (_label, init) => {
    const { log } = renderTitle({ model: modelAt('/project/work-items') });
    fireEvent.click(screen.getByTestId('view-menu-trigger'));
    fireEvent.click(screen.getByTestId('view-menu-item-scheduleGantt'), init);
    expect(log.actions).toEqual([]);
  });

  it('closes the menu after a view is picked', () => {
    renderTitle({ model: modelAt('/project/work-items') });
    fireEvent.click(screen.getByTestId('view-menu-trigger'));
    expect(screen.getByTestId('view-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('view-menu-item-milestones'));
    expect(screen.queryByTestId('view-menu')).toBeNull();
  });
});

/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SubNav } from './SubNav.js';
import type { SubNavTab } from './SubNav.js';

// CSS modules are mocked via identity-obj-proxy (classNames returned as-is)
// i18next is initialized with English translations by setupTests.ts

function renderSubNav(tabs: SubNavTab[], ariaLabel = 'Test navigation', initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SubNav tabs={tabs} ariaLabel={ariaLabel} />
    </MemoryRouter>,
  );
}

const BASIC_TABS: SubNavTab[] = [
  { labelKey: 'button.save', to: '/items/save' },
  { labelKey: 'button.cancel', to: '/items/cancel' },
  { labelKey: 'button.edit', to: '/items/edit' },
  { labelKey: 'button.delete', to: '/items/delete' },
];

describe('SubNav', () => {
  // ── ariaLabel prop ────────────────────────────────────────────────────────

  it('renders a nav element with the given aria-label', () => {
    renderSubNav(BASIC_TABS, 'Test navigation');

    expect(screen.getByRole('navigation', { name: 'Test navigation' })).toBeInTheDocument();
  });

  // ── visible tabs ──────────────────────────────────────────────────────────

  it('renders all tabs when all are visible', () => {
    renderSubNav(BASIC_TABS);

    // 4 tabs → 4 NavLink elements with role="listitem"
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('filters out tabs with visible set to false', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/a' },
      { labelKey: 'button.cancel', to: '/b', visible: false },
      { labelKey: 'button.edit', to: '/c' },
    ];
    renderSubNav(tabs);

    // Only 2 tabs should be in the DOM
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders tabs with visible set to true', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/a', visible: true },
      { labelKey: 'button.cancel', to: '/b', visible: false },
    ];
    renderSubNav(tabs);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('does not render the hidden tab label', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/a' },
      // 'button.cancel' resolves to 'Cancel' via i18next
      { labelKey: 'button.cancel', to: '/b', visible: false },
    ];
    renderSubNav(tabs);

    expect(screen.queryByText('Cancel')).toBeNull();
  });

  // ── role attributes ───────────────────────────────────────────────────────

  it('renders each tab with role="listitem"', () => {
    renderSubNav(BASIC_TABS);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(4);
    listItems.forEach((item) => {
      expect(item).toHaveAttribute('role', 'listitem');
    });
  });

  it('renders the tab container with role="list"', () => {
    const { container } = renderSubNav(BASIC_TABS);

    const tabList = container.querySelector('[role="list"]');
    expect(tabList).not.toBeNull();
  });

  // ── testId prop ───────────────────────────────────────────────────────────

  it('applies data-testid to the NavLink when testId is provided', () => {
    const tabs: SubNavTab[] = [{ labelKey: 'button.save', to: '/a', testId: 'my-tab' }];
    renderSubNav(tabs);

    expect(screen.getByTestId('my-tab')).toBeInTheDocument();
  });

  it('does not add data-testid when testId is omitted', () => {
    const tabs: SubNavTab[] = [{ labelKey: 'button.save', to: '/a' }];
    renderSubNav(tabs);

    const listItem = screen.getByRole('listitem');
    expect(listItem).not.toHaveAttribute('data-testid');
  });

  // ── href / routing ────────────────────────────────────────────────────────

  it('renders NavLink with the correct href', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/schedule/gantt', testId: 'gantt-tab' },
    ];
    renderSubNav(tabs);

    expect(screen.getByTestId('gantt-tab')).toHaveAttribute('href', '/schedule/gantt');
  });

  it('renders multiple NavLinks with distinct href values', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/a', testId: 'tab-a' },
      { labelKey: 'button.cancel', to: '/b', testId: 'tab-b' },
    ];
    renderSubNav(tabs);

    expect(screen.getByTestId('tab-a')).toHaveAttribute('href', '/a');
    expect(screen.getByTestId('tab-b')).toHaveAttribute('href', '/b');
  });

  // ── active class ──────────────────────────────────────────────────────────

  it('applies the active class to the tab matching the current route', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/schedule/gantt', testId: 'gantt-tab' },
      { labelKey: 'button.cancel', to: '/schedule/calendar', testId: 'calendar-tab' },
    ];
    renderSubNav(tabs, 'Schedule nav', '/schedule/gantt');

    // identity-obj-proxy returns CSS module class names as-is
    const ganttTab = screen.getByTestId('gantt-tab');
    expect(ganttTab.className).toContain('tabActive');

    const calendarTab = screen.getByTestId('calendar-tab');
    expect(calendarTab.className).not.toContain('tabActive');
  });

  it('does not apply the active class to tabs that do not match the current route', () => {
    const tabs: SubNavTab[] = [
      { labelKey: 'button.save', to: '/a', testId: 'tab-a' },
      { labelKey: 'button.cancel', to: '/b', testId: 'tab-b' },
    ];
    renderSubNav(tabs, 'Nav', '/b');

    expect(screen.getByTestId('tab-a').className).not.toContain('tabActive');
    expect(screen.getByTestId('tab-b').className).toContain('tabActive');
  });

  // ── custom namespace ──────────────────────────────────────────────────────

  it('renders translated label from the schedule namespace when ns="schedule"', () => {
    // 'schedule.navigation.gantt' in the schedule namespace resolves to 'Gantt'
    const tabs: SubNavTab[] = [
      { labelKey: 'schedule.navigation.gantt', to: '/schedule/gantt', ns: 'schedule' },
    ];
    renderSubNav(tabs);

    expect(screen.getByText('Gantt')).toBeInTheDocument();
  });

  it('renders translated label from default common namespace when ns is omitted', () => {
    // 'button.save' in the common namespace resolves to 'Save'
    const tabs: SubNavTab[] = [{ labelKey: 'button.save', to: '/a' }];
    renderSubNav(tabs);

    expect(screen.getByText('Save')).toBeInTheDocument();
  });
});

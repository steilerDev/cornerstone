/**
 * @jest-environment jsdom
 */
import { describe, it, expect } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { routeUrl } from '@cornerstone/shared';
import { createRouterLog, RecordingRouter } from '../../test/recordingRouter.js';
import { CreateMenu } from './CreateMenu.js';
import { CreateMenuProvider, useCreateContext } from './CreateMenuContext.js';

function Context({
  areaId,
  companyId,
  date,
}: {
  areaId?: string;
  companyId?: string;
  date?: string;
}) {
  useCreateContext({ areaId, companyId, date });
  return null;
}

function setup(options: { money?: boolean; context?: React.ReactNode } = {}) {
  const log = createRouterLog();
  render(
    <RecordingRouter entries={['/project/work-items?q=x']} log={log}>
      <CreateMenuProvider
        moneyPage={options.money ?? false}
        wide
        sheetOpen={false}
        onSheetOpenChange={() => {}}
      >
        {options.context}
        <CreateMenu triggerClassName="newBtn" />
      </CreateMenuProvider>
    </RecordingRouter>,
  );
  return log;
}

const open = () => fireEvent.click(screen.getByTestId('top-bar-new'));
const rowIds = () =>
  within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((el) => el.getAttribute('data-testid'));

describe('CreateMenu', () => {
  it('renders a trigger named "New" with menu semantics and the given class', () => {
    setup();
    const trigger = screen.getByTestId('top-bar-new');
    expect(trigger).toHaveAccessibleName('New');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-create-trigger');
    expect(trigger).toHaveClass('newBtn');
  });

  it('lists the rows in order (AC1) with no separator off the Money pages', () => {
    setup();
    open();
    expect(rowIds()).toEqual([
      'create-menu-diaryEntry',
      'create-menu-task',
      'create-menu-purchase',
      'create-menu-invoice',
      'create-menu-offer',
      'create-menu-company',
      'create-menu-milestone',
    ]);
    expect(screen.getByRole('menu').querySelector('[role="separator"]')).toBeNull();
  });

  it('adds Funding source and Grant after a separator on Money pages', () => {
    setup({ money: true });
    open();
    expect(rowIds().slice(-2)).toEqual(['create-menu-fundingSource', 'create-menu-grant']);
    const menu = screen.getByRole('menu');
    const separator = menu.querySelector('[role="separator"]');
    expect(separator).not.toBeNull();
    expect(separator?.nextElementSibling).toBe(screen.getByTestId('create-menu-fundingSource'));
  });

  it('gives each row its href, including the page context the target accepts', () => {
    setup({ context: <Context areaId="a1" companyId="c1" date="2026-03-01" /> });
    open();
    const href = (id: string) => screen.getByTestId(`create-menu-${id}`).getAttribute('href');
    expect(href('task')).toBe(routeUrl('workItemNew', undefined, { areaId: 'a1' }));
    expect(href('purchase')).toBe(
      routeUrl('householdItemNew', undefined, { areaId: 'a1', companyId: 'c1' }),
    );
    expect(href('milestone')).toBe(routeUrl('milestoneNew', undefined, { date: '2026-03-01' }));
    expect(href('diaryEntry')).toBe(routeUrl('diaryEntryNew', undefined, { date: '2026-03-01' }));
    expect(href('offer')).toBe(
      routeUrl('invoices', undefined, { create: '1', kind: 'offer', companyId: 'c1' }),
    );
    expect(href('company')).toBe(routeUrl('vendors', undefined, { create: '1' }));
  });

  it('a plain click pushes the target with the background, origin and createOpener state', () => {
    const log = setup();
    open();
    fireEvent.click(screen.getByTestId('create-menu-task'));
    expect(log.actions).toEqual([`PUSH ${routeUrl('workItemNew')}`]);
    expect(log.states[0]).toMatchObject({
      createOpener: true,
      origin: { to: '/project/work-items?q=x' },
      background: { pathname: '/project/work-items', search: '?q=x' },
    });
  });

  it('closes the menu after navigating', () => {
    setup();
    open();
    fireEvent.click(screen.getByTestId('create-menu-task'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
  ])('a %s click is left to the browser (no in-app navigation)', (_n, init) => {
    const log = setup();
    open();
    fireEvent.click(screen.getByTestId('create-menu-task'), init);
    expect(log.actions).toEqual([]);
  });
});

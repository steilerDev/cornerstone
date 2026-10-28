/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as ListModule from './TaskPurchasesList.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());

let List: typeof ListModule;
const ORIGIN = { origin: { to: '/project/work-items/wi-1?tab=timing', name: 'Pour slab' } };

function purchase(
  id: string,
  over: Partial<WorkItemLinkedHouseholdItemSummary> = {},
): WorkItemLinkedHouseholdItemSummary {
  return {
    id,
    name: `Purchase ${id}`,
    category: 'hic-furniture',
    status: 'planned',
    targetDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    ...over,
  } as WorkItemLinkedHouseholdItemSummary;
}

function renderList(purchases: readonly WorkItemLinkedHouseholdItemSummary[] | null) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <OriginProbe />
        <List.TaskPurchasesList purchases={purchases} originState={ORIGIN} />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('TaskPurchasesList', () => {
  beforeEach(async () => {
    if (!List) List = await import('./TaskPurchasesList.js');
  });

  it.each([
    ['not loaded', null],
    ['empty', []],
  ] as const)('renders nothing when %s', (_name, purchases) => {
    renderList(purchases);
    expect(screen.queryByTestId('task-purchases')).toBeNull();
  });

  it('titles the list "Purchases waiting for this task" with one row per purchase and its status', () => {
    renderList([purchase('h1', { status: 'purchased' }), purchase('h2')]);
    expect(screen.getByTestId('task-purchases')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Purchases waiting for this task/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('task-purchases-row-h1')).toHaveTextContent('Purchase h1');
    expect(screen.getByTestId('task-purchase-status-h1')).toHaveTextContent(/Ordered/);
    expect(screen.getByTestId('task-purchase-status-h2')).toBeInTheDocument();
  });

  it('is read-only: no add button, no row actions', () => {
    renderList([purchase('h1')]);
    expect(screen.queryByTestId('task-purchases-add')).toBeNull();
    expect(screen.queryByTestId('task-purchases-actions-h1')).toBeNull();
    expect(screen.queryByTestId('task-purchases-edit-h1')).toBeNull();
  });

  it('links to the purchase and carries the origin', () => {
    renderList([purchase('h1')]);
    const link = screen.getByTestId('task-purchases-link-h1');
    expect(link).toHaveAttribute('href', '/project/household-items/h1');
    fireEvent.click(link);
    expect(probedOrigin()).toEqual(ORIGIN.origin);
  });

  it('shows the delivery window when both ends are known', () => {
    renderList([
      purchase('h1', {
        earliestDeliveryDate: '2026-04-01',
        latestDeliveryDate: '2026-04-10',
        targetDeliveryDate: '2026-04-05',
      }),
    ]);
    expect(screen.getByTestId('task-purchases-row-h1')).toHaveTextContent(/2026.* – .*2026/);
  });

  it('shows the target date when there is no complete window', () => {
    renderList([
      purchase('h1', { targetDeliveryDate: '2026-04-05', earliestDeliveryDate: '2026-04-01' }),
    ]);
    const row = screen.getByTestId('task-purchases-row-h1');
    expect(row).toHaveTextContent('2026');
    expect(row).not.toHaveTextContent(' – ');
  });

  it('shows no date line when there is no delivery date at all', () => {
    renderList([purchase('h1')]);
    expect(screen.getByTestId('task-purchases-row-h1')).not.toHaveTextContent('2026');
  });
});

/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { VendorRelationsResponse } from '@cornerstone/shared';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as PanelTypes from './CompanyWorkPanel.js';
import type { UseCompanyRelationsResult } from './useCompanyRelations.js';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => {
  const localeValue = {
    locale: 'en',
    resolvedLocale: 'en',
    currency: 'EUR',
    vatRate: 0.19,
    setLocale: jest.fn(),
    syncWithServer: jest.fn(),
  };
  return {
    LocaleProvider: ({ children }: { children: unknown }) => children,
    useLocale: () => localeValue,
  };
});
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

let Panel: typeof PanelTypes;

const DATA: VendorRelationsResponse = {
  workItems: [
    { id: 'w1', title: 'Screed', status: 'in_progress', startDate: null, endDate: '2026-05-01' },
    { id: 'w2', title: 'Plaster', status: 'completed', startDate: null, endDate: null },
  ],
  householdItems: [
    {
      id: 'h1',
      name: 'Sofa',
      status: 'arrived',
      targetDeliveryDate: '2026-06-01',
      actualDeliveryDate: '2026-06-10',
    },
    {
      id: 'h2',
      name: 'Lamp',
      status: 'planned',
      targetDeliveryDate: '2026-07-01',
      actualDeliveryDate: null,
    },
    {
      id: 'h3',
      name: 'Rug',
      status: 'planned',
      targetDeliveryDate: null,
      actualDeliveryDate: null,
    },
  ],
  budgetLines: [
    {
      id: 'b1',
      description: 'Plastering labour',
      plannedAmount: 250,
      parent: { type: 'work_item', id: 'w1', title: 'Screed' },
    },
    {
      id: 'b2',
      description: null,
      plannedAmount: 90,
      parent: { type: 'household_item', id: 'h1', title: 'Sofa' },
    },
    { id: 'b3', description: 'Loose line', plannedAmount: 10, parent: null },
    { id: 'b4', description: null, plannedAmount: 5, parent: null },
  ],
};

const rel = (
  data: VendorRelationsResponse | null,
  failure: UseCompanyRelationsResult['failure'] = null,
): UseCompanyRelationsResult => ({ data, failure, retry: jest.fn() });

function renderPanel(relations: UseCompanyRelationsResult) {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <Panel.CompanyWorkPanel
          relations={relations}
          originState={{ origin: { to: '/companies/v1', label: 'Sample Co' } } as never}
        />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(async () => {
  if (!Panel) Panel = await import('./CompanyWorkPanel.js');
});

describe('CompanyWorkPanel', () => {
  it('lists tasks with status badge, end date and a link to the task', () => {
    renderPanel(rel(DATA));

    const row = screen.getByTestId('company-tasks-row-w1');
    expect(row).toHaveTextContent('Screed');
    expect(row).toHaveTextContent('In progress');
    expect(row).toHaveTextContent('Ends');
    expect(screen.getByTestId('company-tasks-link-w1')).toHaveAttribute(
      'href',
      '/project/work-items/w1',
    );
    expect(screen.getByTestId('company-tasks-row-w2')).not.toHaveTextContent('Ends');
    expect(screen.getByTestId('company-tasks-row-w2')).toHaveTextContent('Done');
  });

  // Mutation: preferring the target over the actual date shows "Delivery" for a delivered item.
  it('shows Delivered for an actual date, Delivery for a target date and nothing for neither', () => {
    renderPanel(rel(DATA));

    expect(screen.getByTestId('company-purchases-row-h1')).toHaveTextContent('Delivered');
    expect(screen.getByTestId('company-purchases-row-h1')).not.toHaveTextContent('Delivery');
    expect(screen.getByTestId('company-purchases-row-h2')).toHaveTextContent('Delivery');
    expect(screen.getByTestId('company-purchases-row-h3')).not.toHaveTextContent(/Deliver/);
    expect(screen.getByTestId('company-purchases-link-h1')).toHaveAttribute(
      'href',
      '/project/household-items/h1',
    );
  });

  it('shows cost lines with their amount: description first, parent as the fact, parent title when no description', () => {
    renderPanel(rel(DATA));

    const withBoth = screen.getByTestId('company-cost-lines-row-b1');
    expect(withBoth).toHaveTextContent('Plastering labour');
    expect(withBoth).toHaveTextContent('Screed');
    expect(withBoth).toHaveTextContent('€250.00');
    expect(screen.getByTestId('company-cost-lines-row-b2')).toHaveTextContent('Sofa');
    expect(screen.getByTestId('company-cost-lines-link-b1')).toHaveAttribute(
      'href',
      '/project/work-items/w1',
    );
    expect(screen.getByTestId('company-cost-lines-link-b2')).toHaveAttribute(
      'href',
      '/project/household-items/h1',
    );
  });

  it('shows an orphan cost line as plain text, with "Cost line" when it has no description', () => {
    renderPanel(rel(DATA));

    expect(screen.queryByTestId('company-cost-lines-link-b3')).toBeNull();
    expect(screen.getByTestId('company-cost-lines-row-b3')).toHaveTextContent('Loose line');
    expect(screen.getByTestId('company-cost-lines-row-b4')).toHaveTextContent('Cost line');
  });

  it('shows the three empty messages for an empty response', () => {
    renderPanel(rel({ workItems: [], householdItems: [], budgetLines: [] }));

    expect(screen.getByText('No tasks are assigned to this company.')).toBeInTheDocument();
    expect(screen.getByText('No purchases name this company as supplier.')).toBeInTheDocument();
    expect(screen.getByText('No cost lines name this company.')).toBeInTheDocument();
  });

  it('shows the load error in each list when the first load failed, and Retry reloads', () => {
    const relations = rel(null, { kind: 'other' });
    renderPanel(relations);

    expect(screen.getAllByText("This company's work could not be loaded. Try again.")).toHaveLength(
      3,
    );
    fireEvent.click(
      within(screen.getByTestId('company-tasks')).getByRole('button', { name: /try again/i }),
    );
    expect(relations.retry).toHaveBeenCalled();
  });

  it('translates an API failure code and keeps lists loading while there is neither data nor failure', () => {
    const { unmount } = renderPanel(
      rel(null, { kind: 'api', code: 'INTERNAL_ERROR', notFound: false }),
    );
    expect(screen.queryByText("This company's work could not be loaded. Try again.")).toBeNull();
    unmount();

    renderPanel(rel(null));
    expect(screen.getByTestId('company-tasks')).toBeInTheDocument();
    expect(screen.queryByText("This company's work could not be loaded. Try again.")).toBeNull();
  });

  it('keeps the data and shows no error when a reload failed after data was loaded', () => {
    renderPanel(rel(DATA, { kind: 'other' }));

    expect(screen.getByTestId('company-tasks-row-w1')).toBeInTheDocument();
    expect(screen.queryByText("This company's work could not be loaded. Try again.")).toBeNull();
  });
});

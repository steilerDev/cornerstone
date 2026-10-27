/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { routeUrl } from '@cornerstone/shared';
import type { MoneySourceFigures } from '@cornerstone/shared';
import { LocaleProvider } from '../../contexts/LocaleContext.js';
import { OriginProbe, probedOrigin } from '../../test/originProbe.js';
import { makeMoney } from '../../test/breakdownFixtures.js';
import type * as FundingModule from './FundingSection.js';

let mockEntriesLanguage: string | null = null;

jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => mockEntriesLanguage,
}));

let FundingSection: (typeof FundingModule)['FundingSection'];

beforeAll(async () => {
  ({ FundingSection } = (await import('./FundingSection.js')) as typeof FundingModule);
});

beforeEach(() => {
  mockEntriesLanguage = null;
});

const SOURCES_URL = routeUrl('financing');

function renderSection(sources: readonly MoneySourceFigures[]) {
  return render(
    <LocaleProvider>
      <MemoryRouter initialEntries={['/budget/overview']}>
        <FundingSection sources={sources} />
        <OriginProbe />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

describe('FundingSection', () => {
  const [savings, loan] = makeMoney().sources as [MoneySourceFigures, MoneySourceFigures];

  it('is a region named Funding sources with one row per source in the given order', () => {
    renderSection([loan, savings]);
    const region = screen.getByRole('region', { name: 'Funding sources' });
    expect(region).toBe(screen.getByTestId('money-funding'));
    const rows = within(region).getAllByRole('listitem');
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'money-funding-row-bs-b',
      'money-funding-row-bs-a',
    ]);
  });

  it('states "Allocated x of y" for each source', () => {
    renderSection([savings, loan]);
    const first = screen.getByTestId('money-funding-row-bs-a');
    expect(within(first).getByText('Savings')).toBeInTheDocument();
    expect(first).toHaveTextContent('Allocated');
    expect(first).toHaveTextContent('€1,400.00 of €6,000.00');
    expect(screen.getByTestId('money-funding-row-bs-b')).toHaveTextContent('€500.00 of €400.00');
  });

  it('draws a bar capped at the source amount and shows no extra amount without over-allocation', () => {
    renderSection([savings]);
    const row = screen.getByTestId('money-funding-row-bs-a');
    expect(within(row).getByRole('img')).toHaveAccessibleName(/Allocated/);
    expect(within(row).queryByTestId('budget-bar-overflow-note')).toBeNull();
    expect(row).not.toHaveTextContent(/over-allocated/i);
  });

  it('shows the over-allocated amount only for a source that is over-allocated', () => {
    renderSection([savings, loan]);
    const over = screen.getByTestId('money-funding-row-bs-b');
    expect(within(over).getByTestId('budget-bar-overflow-note')).toHaveTextContent(
      'Over-allocated by €100.00',
    );
    expect(within(over).getByRole('img')).toHaveAccessibleName(/€100\.00/);
    expect(
      within(screen.getByTestId('money-funding-row-bs-a')).queryByTestId(
        'budget-bar-overflow-note',
      ),
    ).toBeNull();
  });

  it('has no Unallocated or Remaining amount and rows are not links', () => {
    renderSection([savings, loan]);
    const list = screen.getByRole('list');
    expect(list).not.toHaveTextContent(/unallocated|remaining/i);
    expect(within(list).queryAllByRole('link')).toEqual([]);
  });

  it('links "Edit or add funding sources" to Money > Financing with the origin', async () => {
    const user = userEvent.setup();
    renderSection([savings]);
    const link = screen.getByRole('link', { name: /Edit or add funding sources/ });
    expect(link).toBe(screen.getByTestId('money-funding-manage'));
    await user.click(link);
    expect(screen.getByTestId('probe-path')).toHaveTextContent(SOURCES_URL);
    expect(probedOrigin()?.to).toContain('/budget/overview');
  });

  it('hides the arrow of the manage link from assistive technology', () => {
    renderSection([savings]);
    const arrow = screen.getByTestId('money-funding-manage').querySelector('[aria-hidden="true"]');
    expect(arrow).toHaveTextContent('›');
  });

  it('shows an empty state with an add action when there are no sources', async () => {
    const user = userEvent.setup();
    renderSection([]);
    expect(screen.getByText('No funding sources added yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Add your first funding source' }));
    expect(screen.getByTestId('probe-path')).toHaveTextContent(SOURCES_URL);
    expect(probedOrigin()?.to).toContain('/budget/overview');
  });

  it('marks the source name as user text in its own language', () => {
    mockEntriesLanguage = 'de';
    renderSection([{ ...savings, name: 'Sparkonto' }]);
    const name = screen.getByText('Sparkonto');
    expect(name).toHaveAttribute('lang', 'de');
    expect(name.className).toContain('userText');
  });
});

/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntrySummary } from '@cornerstone/shared';
import type * as PanelTypes from './CompanyDiaryPanel.js';
import type { UseCompanyDiaryResult } from './useCompanyDiary.js';

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

const entry = (id: string): DiaryEntrySummary =>
  ({
    id,
    entryType: 'daily_log',
    entryDate: '2026-03-01',
    title: `Log ${id}`,
    body: `Body ${id}`,
    status: 'saved',
    isAutomatic: false,
    photoCount: 0,
    thumbnails: [],
    metadata: null,
    sourceEntityType: null,
    sourceEntityId: null,
  }) as unknown as DiaryEntrySummary;

const diary = (
  items: DiaryEntrySummary[] | null,
  totalItems: number | null,
  failure: UseCompanyDiaryResult['failure'] = null,
): UseCompanyDiaryResult => ({ items, totalItems, failure, reload: jest.fn() });

function renderPanel(value: UseCompanyDiaryResult) {
  return render(
    <MemoryRouter>
      <Panel.CompanyDiaryPanel
        vendorId="v1"
        diary={value}
        originState={{ origin: { to: '/companies/v1', label: 'Sample Co' } } as never}
      />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  if (!Panel) Panel = await import('./CompanyDiaryPanel.js');
});

describe('CompanyDiaryPanel', () => {
  it('shows a loading skeleton before the first load', () => {
    renderPanel(diary(null, null));

    expect(screen.getByRole('status', { name: 'Loading company' })).toBeInTheDocument();
    expect(screen.queryByTestId('company-diary')).toBeNull();
  });

  it('shows the load error with Try again, which reloads', () => {
    const value = diary(null, null, { kind: 'other' });
    renderPanel(value);

    expect(
      screen.getByText('The site diary entries could not be loaded. Try again.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(value.reload).toHaveBeenCalledTimes(1);
  });

  it('translates an API failure code instead of the generic text', () => {
    renderPanel(diary(null, null, { kind: 'api', code: 'INTERNAL_ERROR', notFound: false }));

    expect(screen.queryByText('The site diary entries could not be loaded. Try again.')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('keeps the entries when a reload failed after they were loaded', () => {
    renderPanel(diary([entry('e1')], 1, { kind: 'other' }));

    expect(screen.getByTestId('company-diary')).toBeInTheDocument();
    expect(screen.queryByText('The site diary entries could not be loaded. Try again.')).toBeNull();
  });

  it('shows the empty state for no entries', () => {
    renderPanel(diary([], 0));

    expect(screen.getByText('No site diary entry names this company yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('company-diary-show-all')).toBeNull();
  });

  it('lists the entries under a Site diary heading with an entry count for screen readers', () => {
    renderPanel(diary([entry('e1'), entry('e2')], 2));

    const group = screen.getByTestId('company-diary');
    expect(group).toHaveTextContent('Site diary');
    expect(group).toHaveTextContent('2 entries');
    expect(group).toHaveTextContent('Log e1');
    expect(group).toHaveTextContent('Log e2');
  });

  // Mutation: showing the link whenever total >= listed would offer "Show all" for a full list.
  it('shows Show all only when there are more entries than listed, linking to the filtered Site diary', () => {
    const { unmount } = renderPanel(diary([entry('e1'), entry('e2')], 2));
    expect(screen.queryByTestId('company-diary-show-all')).toBeNull();
    unmount();

    const twenty = Array.from({ length: 20 }, (_, i) => entry(`e${i}`));
    const exact = renderPanel(diary(twenty, 20));
    expect(screen.queryByTestId('company-diary-show-all')).toBeNull();
    exact.unmount();

    renderPanel(diary(twenty, 21));
    const link = screen.getByTestId('company-diary-show-all');
    expect(link).toHaveTextContent('Show all in Site diary');
    expect(link).toHaveAttribute('href', expect.stringContaining('companyId=v1'));
  });

  it('shows no Show all link while the total is not known', () => {
    renderPanel(diary([entry('e1')], null));

    expect(screen.queryByTestId('company-diary-show-all')).toBeNull();
  });
});

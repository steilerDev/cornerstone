/**
 * @jest-environment jsdom
 *
 * Companies here (#2251): read-only RelatedList of the companies on the subtree's tasks and
 * purchases, each with a trade fact, the task/purchase split and Call when it has a phone.
 *
 * Mutations these tests catch:
 *  - Call shown for a company without a phone (or missing for one with a phone), Call naming the
 *    wrong company;
 *  - the split facts showing a zero count ("0 purchases"), or missing the "here" wording;
 *  - the trade not translated through its translation key, the trade shown for a company without;
 *  - the name not linking to /companies/:id with the origin state, an Add or row menu appearing
 *    (the list is read-only), the empty state wording wrong.
 */
import { jest, describe, it, expect, beforeAll } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AreaPageCompany } from '@cornerstone/shared';
import { OriginProbe, probedOrigin, probedPath } from '../../test/originProbe.js';
import { makeLocaleContextMock } from '../../test/photoSpotFixtures.js';
import { makeAreaCompany } from '../../test/areaPageFixtures.js';
import { ToastProvider } from '../../components/Toast/ToastContext.js';
import type * as ListModule from './AreaCompaniesList.js';
import enAreas from '../../i18n/en/areas.json';
import enCommon from '../../i18n/en/common.json';

jest.unstable_mockModule('../../contexts/LocaleContext.js', () => makeLocaleContextMock());
jest.unstable_mockModule('../../contexts/HouseNameContext.js', () => ({
  useEntriesLanguage: () => 'en',
}));

let AreaCompaniesList: typeof ListModule.AreaCompaniesList;

beforeAll(async () => {
  ({ AreaCompaniesList } = await import('./AreaCompaniesList.js'));
});

const ORIGIN = { origin: { to: '/areas/floor', name: 'Ground floor' } };
const heading = enAreas.detail.sections.companies;

function renderList(companies: AreaPageCompany[], areaName = 'Ground floor') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/areas/floor']}>
        <AreaCompaniesList companies={companies} areaName={areaName} originState={ORIGIN} />
        <OriginProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const row = (id: string) => screen.getByTestId(`area-companies-row-${id}`);
const callLabel = (name: string, phone: string) =>
  enCommon.callButton.aria.replace('{{name}}', name).replace('{{number}}', phone);

describe('AreaCompaniesList', () => {
  it('titles the section "Companies here" with the number of companies', () => {
    renderList([makeAreaCompany('c1'), makeAreaCompany('c2')]);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${heading} (2)`);
    expect(screen.getByTestId('area-companies')).toBeInTheDocument();
  });

  it('shows the empty state with the area name and no list', () => {
    renderList([], 'Attic');

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`${heading} (0)`);
    expect(
      screen.getByText(enAreas.detail.companies.empty.replace('{{area}}', 'Attic')),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('is read-only: no Add button and no row menu', () => {
    renderList([makeAreaCompany('c1', { workItemCount: 1 })]);

    expect(screen.queryByTestId('area-companies-add')).toBeNull();
    expect(screen.queryByTestId('area-companies-actions-c1')).toBeNull();
    expect(screen.queryByTestId('area-companies-edit-c1')).toBeNull();
  });

  describe('rows', () => {
    it('links the name to the company page and carries the origin', () => {
      renderList([makeAreaCompany('c1', { name: 'Alpha Build' })]);

      const link = within(row('c1')).getByRole('link', { name: 'Alpha Build' });
      expect(link).toHaveAttribute('href', '/companies/c1');
      fireEvent.click(link);
      expect(probedPath()).toBe('/companies/c1');
      expect(probedOrigin()).toEqual(ORIGIN.origin);
    });

    it('keeps the given order', () => {
      renderList([
        makeAreaCompany('c2', { name: 'Beta' }),
        makeAreaCompany('c1', { name: 'Alpha' }),
      ]);

      expect(
        screen.getAllByTestId(/^area-companies-row-/).map((el) => el.getAttribute('data-testid')),
      ).toEqual(['area-companies-row-c2', 'area-companies-row-c1']);
    });

    it('shows the trade and the task and purchase split with "here"', () => {
      renderList([
        makeAreaCompany('c1', {
          trade: { id: 't', name: 'Synthetic trade', color: null, translationKey: null },
          workItemCount: 2,
          householdItemCount: 1,
        }),
      ]);

      expect(row('c1')).toHaveTextContent('Synthetic trade · 2 tasks · 1 purchase here');
    });

    it('translates a trade with a translation key and falls back to its name otherwise', () => {
      renderList([
        makeAreaCompany('c1', {
          trade: { id: 't', name: 'Raw name', color: null, translationKey: 'trades.plumbing' },
          workItemCount: 1,
        }),
        makeAreaCompany('c2', {
          trade: { id: 't2', name: 'Custom trade', color: null, translationKey: null },
          workItemCount: 1,
        }),
      ]);

      expect(row('c1')).toHaveTextContent('Plumbing · 1 task here');
      expect(row('c1')).not.toHaveTextContent('Raw name');
      expect(row('c2')).toHaveTextContent('Custom trade · 1 task here');
    });

    it('lists only the non-zero counts, never "0 purchases"', () => {
      renderList([
        makeAreaCompany('tasks-only', { workItemCount: 3 }),
        makeAreaCompany('buys-only', { householdItemCount: 2 }),
      ]);

      expect(row('tasks-only')).toHaveTextContent('3 tasks here');
      expect(row('tasks-only')).not.toHaveTextContent('purchase');
      expect(row('buys-only')).toHaveTextContent('2 purchases here');
      expect(row('buys-only')).not.toHaveTextContent('task');
    });

    it('shows no facts for a company without trade and without counts', () => {
      renderList([makeAreaCompany('c1', { name: 'Quiet Co' })]);

      expect(row('c1').textContent).toBe('Quiet Co');
    });

    it('shows the trade alone when the company has no counts', () => {
      renderList([
        makeAreaCompany('c1', {
          trade: { id: 't', name: 'Synthetic trade', color: null, translationKey: null },
        }),
      ]);

      expect(row('c1')).toHaveTextContent('Synthetic trade');
      expect(row('c1')).not.toHaveTextContent('here');
    });
  });

  describe('Call', () => {
    it('shows Call only on a company with a phone, named after the company', () => {
      renderList([
        makeAreaCompany('c1', { name: 'Alpha Build', phone: '+49 30 1111' }),
        makeAreaCompany('c2', { name: 'Beta Paint', phone: null }),
      ]);

      const call = screen.getByTestId('area-companies-call-c1');
      expect(call).toHaveAttribute('href', 'tel:+49301111');
      expect(call).toHaveAccessibleName(callLabel('Alpha Build', '+49 30 1111'));
      expect(within(row('c1')).getByTestId('area-companies-call-c1')).toBe(call);
      expect(screen.queryByTestId('area-companies-call-c2')).toBeNull();
      expect(screen.getAllByRole('link', { name: /^Call / })).toHaveLength(1);
    });

    it('marks only the row with Call as a call row', () => {
      renderList([
        makeAreaCompany('c1', { phone: '+49 30 1111' }),
        makeAreaCompany('c2', { phone: null }),
      ]);

      expect(row('c1')).toHaveClass('rowWithCall');
      expect(row('c2')).not.toHaveClass('rowWithCall');
    });
  });
});

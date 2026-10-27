/**
 * @jest-environment jsdom
 *
 * Every lazily loaded route of App (#2240 standing coverage rule): each path below is rendered
 * through the real router, auth guard and shell, with the page module replaced by a stub that
 * names itself. The stubs prove the route table points at the right page module; the pages have
 * their own tests, and App.test.tsx covers the pages that render for real.
 *
 * Mutations these tests catch: a route pointing at another page's lazy component, or a lazy
 * loader importing the wrong module.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { routeUrl } from '@cornerstone/shared';
import type * as AuthApiTypes from './lib/authApi.js';
import type * as SettingsApiTypes from './lib/settingsApi.js';
import type * as AppTypes from './App.js';

const mockGetAuthMe = jest.fn<typeof AuthApiTypes.getAuthMe>();
jest.unstable_mockModule('./lib/authApi.js', () => ({
  getAuthMe: mockGetAuthMe,
  login: jest.fn(),
  logout: jest.fn(),
  oidcLoginUrl: jest.fn(),
}));
jest.unstable_mockModule('./lib/settingsApi.js', () => ({
  fetchHouseholdSettings: jest.fn<typeof SettingsApiTypes.fetchHouseholdSettings>(async () => ({
    householdName: 'Synthetic House',
    householdAddress: null,
    entriesLanguage: 'en',
  })),
  updateHouseholdSettings: jest.fn(),
}));

const PAGES = [
  ['setup', './pages/SetupPage/SetupPage.js'],
  ['workItem', './pages/WorkItemDetailPage/WorkItemDetailPage.js'],
  ['budgetOverview', './pages/BudgetOverviewPage/BudgetOverviewPage.js'],
  ['financing', './pages/BudgetSourcesPage/FinancingPage.js'],
  ['fundingSource', './pages/BudgetSourcesPage/FundingSourcePage.js'],
  ['grant', './pages/SubsidyProgramsPage/GrantPage.js'],
  ['householdItem', './pages/HouseholdItemDetailPage/HouseholdItemDetailPage.js'],
  ['householdItemEdit', './pages/HouseholdItemEditPage/HouseholdItemEditPage.js'],
  ['milestone', './pages/MilestoneDetailPage/MilestoneDetailPage.js'],
  ['settingsProfile', './pages/ProfilePage/ProfilePage.js'],
  ['invoice', './pages/InvoiceDetailPage/InvoiceDetailPage.js'],
  ['invoiceAutoItemize', './pages/AutoItemizePage/index.js'],
  ['bankReport', './pages/ReportWizardPage/index.js'],
  ['invoicePaperlessReview', './pages/PaperlessInvoiceReviewPage/index.js'],
  ['diary', './pages/DiaryPage/DiaryPage.js'],
  ['history', './pages/HistoryPage/HistoryPage.js'],
  ['diaryEntry', './pages/DiaryEntryDetailPage/DiaryEntryDetailPage.js'],
] as const;

for (const [id, path] of PAGES) {
  jest.unstable_mockModule(path, () => ({
    default: () => <div data-testid={`page-${id}`} />,
  }));
}

const PARAMS = { id: 'x-1', documentId: '7' };
const url = (id: (typeof PAGES)[number][0]): string => {
  const build = routeUrl as unknown as (id: string, params?: unknown) => string;
  return build(id, PARAMS);
};

const USER = {
  id: 'u-1',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'member' as const,
  authProvider: 'local' as const,
  oidcLinked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deactivatedAt: null,
};

let App: typeof AppTypes.App;

beforeEach(async () => {
  ({ App } = (await import('./App.js')) as typeof AppTypes);
  mockGetAuthMe.mockReset().mockResolvedValue({
    user: USER,
    setupRequired: false,
    oidcEnabled: false,
  });
});

describe('App lazy routes', () => {
  it.each(
    PAGES.map(([id]) => id).filter((id) => id !== 'setup' && id !== 'invoicePaperlessReview'),
  )(
    'renders the %s page module at its route',
    async (id) => {
      window.history.pushState({}, id, url(id));
      render(<App />);
      expect(
        await screen.findByTestId(`page-${id}`, undefined, { timeout: 5000 }),
      ).toBeInTheDocument();
    },
    15000,
  );

  it('renders the setup page module while the first account is still to be created', async () => {
    mockGetAuthMe.mockResolvedValue({ user: null, setupRequired: true, oidcEnabled: false });
    window.history.pushState({}, 'setup', '/setup');
    render(<App />);
    expect(
      await screen.findByTestId('page-setup', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 15000);

  it('renders the Paperless review page module at its route', async () => {
    window.history.pushState({}, 'review', url('invoicePaperlessReview'));
    render(<App />);
    expect(
      await screen.findByTestId('page-invoicePaperlessReview', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 15000);
});

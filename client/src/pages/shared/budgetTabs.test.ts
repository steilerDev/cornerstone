/**
 * Unit tests for client/src/pages/shared/budgetTabs.ts
 *
 * Covers: array shape/order of the hoisted BUDGET_TABS, including the new Reports tab.
 */
import { describe, it, expect } from '@jest/globals';
import { BUDGET_TABS } from './budgetTabs.js';

describe('BUDGET_TABS', () => {
  it('has exactly 5 tabs (overview, invoices, sources, subsidies, reports)', () => {
    expect(BUDGET_TABS).toHaveLength(5);
  });

  it('lists tabs in the exact order: overview, invoices, sources, subsidies, reports', () => {
    expect(BUDGET_TABS.map((tab) => tab.labelKey)).toEqual([
      'subnav.budget.overview',
      'subnav.budget.invoices',
      'subnav.budget.sources',
      'subnav.budget.subsidies',
      'subnav.budget.reports',
    ]);
  });

  it('maps each tab to its expected route', () => {
    expect(BUDGET_TABS.map((tab) => tab.to)).toEqual([
      '/budget/overview',
      '/budget/invoices',
      '/budget/sources',
      '/budget/subsidies',
      '/budget/reports',
    ]);
  });

  it('includes the new Reports tab pointing at /budget/reports', () => {
    const reportsTab = BUDGET_TABS.find((tab) => tab.to === '/budget/reports');
    expect(reportsTab).toBeDefined();
    expect(reportsTab?.labelKey).toBe('subnav.budget.reports');
  });

  it('does not include a Vendors tab (VendorsPage intentionally excluded — lives under /settings)', () => {
    const vendorsTab = BUDGET_TABS.find((tab) => tab.to.includes('vendors'));
    expect(vendorsTab).toBeUndefined();
  });
});

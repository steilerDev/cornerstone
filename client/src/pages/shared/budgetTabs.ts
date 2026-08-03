import type { SubNavTab } from '../../components/SubNav/SubNav.js';

export const BUDGET_TABS: SubNavTab[] = [
  { labelKey: 'subnav.budget.overview', to: '/budget/overview', ns: 'common' },
  { labelKey: 'subnav.budget.invoices', to: '/budget/invoices', ns: 'common' },
  { labelKey: 'subnav.budget.sources', to: '/budget/sources', ns: 'common' },
  { labelKey: 'subnav.budget.subsidies', to: '/budget/subsidies', ns: 'common' },
  { labelKey: 'subnav.budget.reports', to: '/budget/reports', ns: 'common' },
];

import type { SubNavTab } from '../../components/SubNav/SubNav.js';
import { routeUrl } from '@cornerstone/shared';

export const BUDGET_TABS: SubNavTab[] = [
  { labelKey: 'subnav.budget.overview', to: routeUrl('budgetOverview'), ns: 'common' },
  { labelKey: 'subnav.budget.invoices', to: routeUrl('invoices'), ns: 'common' },
  { labelKey: 'subnav.budget.sources', to: routeUrl('budgetSources'), ns: 'common' },
  { labelKey: 'subnav.budget.subsidies', to: routeUrl('budgetSubsidies'), ns: 'common' },
  { labelKey: 'subnav.budget.reports', to: routeUrl('bankReport'), ns: 'common' },
];

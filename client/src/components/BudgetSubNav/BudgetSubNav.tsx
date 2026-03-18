import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './BudgetSubNav.module.css';

const BUDGET_TABS = [
  { labelKey: 'subnav.budget.overview', to: '/budget/overview' },
  { labelKey: 'subnav.budget.invoices', to: '/budget/invoices' },
  { labelKey: 'subnav.budget.vendors', to: '/budget/vendors' },
  { labelKey: 'subnav.budget.sources', to: '/budget/sources' },
  { labelKey: 'subnav.budget.subsidies', to: '/budget/subsidies' },
] as const;

/**
 * BudgetSubNav — horizontal tab-style navigation for the Budget section.
 *
 * Renders a scrollable row of tab links for all budget sub-pages.
 * The currently active tab is highlighted using the primary design token.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function BudgetSubNav() {
  const { t } = useTranslation('common');

  return (
    <nav className={styles.subNav} aria-label="Budget section navigation">
      <div className={styles.tabList} role="list">
        {BUDGET_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            role="listitem"
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default BudgetSubNav;

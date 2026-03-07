import { NavLink } from 'react-router-dom';
import styles from './BudgetSubNav.module.css';

const BUDGET_TABS = [
  { label: 'Overview', to: '/budget/overview' },
  { label: 'Categories', to: '/budget/categories' },
  { label: 'Vendors', to: '/budget/vendors' },
  { label: 'Sources', to: '/budget/sources' },
  { label: 'Subsidies', to: '/budget/subsidies' },
] as const;

/**
 * BudgetSubNav — horizontal tab-style navigation for the Budget section.
 *
 * Renders a scrollable row of tab links for all budget sub-pages.
 * The currently active tab is highlighted using the primary design token.
 * On mobile the row scrolls horizontally so all tabs remain reachable.
 */
export function BudgetSubNav() {
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
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default BudgetSubNav;

import { Link } from 'react-router-dom';
import styles from './QuickActionsCard.module.css';

/**
 * Quick actions card for the dashboard.
 * Provides prominent "New Work Item" button and quick navigation links
 * to common sections of the application.
 */
export function QuickActionsCard() {
  return (
    <div className={styles.container}>
      {/* Primary action: New Work Item */}
      <Link to="/project/work-items/new" className={styles.primaryAction}>
        New Work Item
      </Link>

      {/* Quick navigation links grid */}
      <div className={styles.linksGrid}>
        <Link to="/project/work-items" className={styles.quickLink} aria-label="Work Items">
          Work Items
        </Link>
        <Link to="/schedule" className={styles.quickLink} aria-label="Timeline">
          Timeline
        </Link>
        <Link to="/budget/overview" className={styles.quickLink} aria-label="Budget">
          Budget
        </Link>
        <Link to="/budget/invoices" className={styles.quickLink} aria-label="Invoices">
          Invoices
        </Link>
        <Link to="/budget/vendors" className={styles.quickLink} aria-label="Vendors">
          Vendors
        </Link>
      </div>
    </div>
  );
}

export default QuickActionsCard;

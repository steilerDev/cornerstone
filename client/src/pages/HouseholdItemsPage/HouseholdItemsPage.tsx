import styles from './HouseholdItemsPage.module.css';

export function HouseholdItemsPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Household Items</h1>
      <p className={styles.description}>
        Track household items and furnishings for your new home. Manage purchase orders, delivery
        dates, and item status.
      </p>
    </div>
  );
}

export default HouseholdItemsPage;

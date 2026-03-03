import styles from './HouseholdItemCreatePage.module.css';

export function HouseholdItemCreatePage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>New Household Item</h1>
      <p className={styles.description}>Create a new household item to track.</p>
    </div>
  );
}

export default HouseholdItemCreatePage;

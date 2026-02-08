import styles from './BudgetPage.module.css';

export function BudgetPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Budget</h1>
      <p className={styles.description}>
        Track your project budget, expenses, and financial sources. Monitor spending across
        categories and manage creditors and subsidies.
      </p>
    </div>
  );
}

export default BudgetPage;

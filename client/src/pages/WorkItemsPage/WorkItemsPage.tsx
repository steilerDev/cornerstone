import styles from './WorkItemsPage.module.css';

export function WorkItemsPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Work Items</h1>
      <p className={styles.description}>
        Manage all construction tasks and work items for your project. Track status, dependencies,
        and progress of each work item.
      </p>
    </div>
  );
}

export default WorkItemsPage;

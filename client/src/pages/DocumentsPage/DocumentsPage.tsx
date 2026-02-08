import styles from './DocumentsPage.module.css';

export function DocumentsPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Documents</h1>
      <p className={styles.description}>
        Access and manage project documents. View contracts, plans, permits, and other important
        files stored in Paperless-ngx.
      </p>
    </div>
  );
}

export default DocumentsPage;

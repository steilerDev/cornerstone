import { DocumentBrowser } from '../../components/documents/DocumentBrowser.js';
import styles from './DocumentsPage.module.css';

export function DocumentsPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Documents</h1>
      <DocumentBrowser mode="page" />
    </div>
  );
}

export default DocumentsPage;

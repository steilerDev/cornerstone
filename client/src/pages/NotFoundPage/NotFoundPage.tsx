import { Link } from 'react-router-dom';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>404 - Page Not Found</h1>
      <p className={styles.description}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" className={styles.homeLink}>
        Go back to Dashboard
      </Link>
    </div>
  );
}

export default NotFoundPage;

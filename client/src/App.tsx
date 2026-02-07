import { useEffect, useState } from 'react';
import styles from './App.module.css';

interface HealthResponse {
  status: string;
  timestamp: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>Cornerstone</h1>
        <p className={styles.subtitle}>Home Building Project Management</p>
        {health && (
          <div className={styles.statusSuccess}>
            Server: {health.status} | {health.timestamp}
          </div>
        )}
        {error && <div className={styles.statusError}>Server connection failed: {error}</div>}
      </div>
    </div>
  );
}

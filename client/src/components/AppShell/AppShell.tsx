import { Outlet } from 'react-router-dom';
import { Header } from '../Header/Header';
import { Sidebar } from '../Sidebar/Sidebar';
import styles from './AppShell.module.css';

export function AppShell() {
  const handleToggleSidebar = () => {
    // No-op for now; responsive toggle will be implemented in Story #29
  };

  return (
    <div className={styles.appShell}>
      <Sidebar />
      <div className={styles.mainContent}>
        <Header onToggleSidebar={handleToggleSidebar} />
        <main className={styles.pageContent}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

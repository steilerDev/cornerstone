import { Outlet } from 'react-router-dom';
import { Suspense, useState, useCallback, useEffect } from 'react';
import { Header } from '../Header/Header';
import { Sidebar } from '../Sidebar/Sidebar';
import styles from './AppShell.module.css';

export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isSidebarOpen]);

  return (
    <div className={styles.appShell}>
      <Sidebar isOpen={isSidebarOpen} onClose={handleCloseSidebar} />
      {isSidebarOpen && (
        <div className={styles.overlay} onClick={handleCloseSidebar} aria-hidden="true" />
      )}
      <div className={styles.mainContent}>
        <Header onToggleSidebar={handleToggleSidebar} isSidebarOpen={isSidebarOpen} />
        <main className={styles.pageContent}>
          <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

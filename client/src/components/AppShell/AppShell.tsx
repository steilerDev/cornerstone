import { Outlet } from 'react-router-dom';
import { Suspense, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShortcutRegistryProvider } from '../../hooks/shortcutRegistry.js';
import { BreadcrumbSlotContext } from '../../navigation/breadcrumbSlot.js';
import { Sidebar } from '../Sidebar/Sidebar';
import { TopBar } from '../TopBar/TopBar.js';
import styles from './AppShell.module.css';

export function AppShell() {
  const { t } = useTranslation('common');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null);

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
    <ShortcutRegistryProvider>
      <BreadcrumbSlotContext value={slotEl}>
        <div className={styles.appShell}>
          <Sidebar isOpen={isSidebarOpen} onClose={handleCloseSidebar} />
          {isSidebarOpen && (
            <div
              className={styles.overlay}
              onClick={handleCloseSidebar}
              aria-hidden="true"
              data-testid="sidebar-overlay"
            />
          )}
          <button
            type="button"
            className={styles.menuFab}
            onClick={handleToggleSidebar}
            aria-label={isSidebarOpen ? t('aria.closeMenu') : t('aria.openMenu')}
            data-testid="menu-fab"
          >
            {isSidebarOpen ? '✕' : '☰'}
          </button>
          <div className={styles.shellColumn}>
            <TopBar breadcrumbSlotRef={setSlotEl} />
            <div className={styles.mainContent}>
              <main className={styles.pageContent}>
                <Suspense fallback={<div className={styles.loading}>{t('loading')}</div>}>
                  <Outlet />
                </Suspense>
              </main>
            </div>
          </div>
        </div>
      </BreadcrumbSlotContext>
    </ShortcutRegistryProvider>
  );
}

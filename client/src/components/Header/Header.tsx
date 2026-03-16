import { useTranslation } from 'react-i18next';
import styles from './Header.module.css';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function Header({ onToggleSidebar, isSidebarOpen }: HeaderProps) {
  const { t } = useTranslation('common');

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onToggleSidebar}
        aria-label={isSidebarOpen ? t('aria.closeMenu') : t('aria.openMenu')}
      >
        {isSidebarOpen ? '✕' : '☰'}
      </button>
      <div className={styles.titleArea} data-testid="page-title"></div>
    </header>
  );
}

import styles from './Header.module.css';

interface HeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function Header({ onToggleSidebar, isSidebarOpen }: HeaderProps) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onToggleSidebar}
        aria-label={isSidebarOpen ? 'Close menu' : 'Open menu'}
      >
        {isSidebarOpen ? '✕' : '☰'}
      </button>
      <div className={styles.titleArea} data-testid="page-title"></div>
    </header>
  );
}

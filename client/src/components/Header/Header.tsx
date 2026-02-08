import styles from './Header.module.css';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onToggleSidebar}
        aria-label="Toggle navigation menu"
      >
        ☰
      </button>
      <div className={styles.titleArea} data-testid="page-title"></div>
    </header>
  );
}

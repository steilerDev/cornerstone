import { useTheme, type ThemePreference } from '../../contexts/ThemeContext.js';
import styles from './ThemeToggle.module.css';

/** Inline SVG icons — no external dependency, use currentColor */

function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

const THEME_CYCLE: ThemePreference[] = ['light', 'dark', 'system'];

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const handleClick = () => {
    setTheme(NEXT_THEME[theme]);
  };

  const nextTheme = NEXT_THEME[theme];
  const nextLabel = THEME_LABELS[nextTheme];

  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={handleClick}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Current: ${THEME_LABELS[theme]} — click to switch to ${nextLabel}`}
    >
      <span className={styles.icon}>
        {theme === 'light' && <SunIcon />}
        {theme === 'dark' && <MoonIcon />}
        {theme === 'system' && <MonitorIcon />}
      </span>
      <span className={styles.label}>{THEME_LABELS[theme]}</span>
    </button>
  );
}

// Export the cycle array for use in tests
export { THEME_CYCLE };

import styles from './DiaryEntryTypeSwitcher.module.css';

type FilterMode = 'all' | 'manual' | 'automatic';

interface DiaryEntryTypeSwitcherProps {
  value: FilterMode;
  onChange: (mode: FilterMode) => void;
}

export function DiaryEntryTypeSwitcher({ value, onChange }: DiaryEntryTypeSwitcherProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const modes: FilterMode[] = ['all', 'manual', 'automatic'];
      const currentIndex = modes.indexOf(value);
      const newIndex = e.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex >= 0 && newIndex < modes.length) {
        onChange(modes[newIndex]);
      }
    }
  };

  return (
    <div
      className={styles.switcher}
      role="radiogroup"
      aria-label="Filter entries by type"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'all'}
        onClick={() => onChange('all')}
        className={`${styles.button} ${value === 'all' ? styles.active : ''}`}
        data-testid="type-switcher-all"
      >
        All
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'manual'}
        onClick={() => onChange('manual')}
        className={`${styles.button} ${value === 'manual' ? styles.active : ''}`}
        data-testid="type-switcher-manual"
      >
        Manual
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'automatic'}
        onClick={() => onChange('automatic')}
        className={`${styles.button} ${value === 'automatic' ? styles.active : ''}`}
        data-testid="type-switcher-automatic"
      >
        Automatic
      </button>
    </div>
  );
}

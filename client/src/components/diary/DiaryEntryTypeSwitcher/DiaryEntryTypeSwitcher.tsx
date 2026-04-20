import { useTranslation } from 'react-i18next';
import styles from './DiaryEntryTypeSwitcher.module.css';

type FilterMode = 'all' | 'manual' | 'automatic';

interface DiaryEntryTypeSwitcherProps {
  value: FilterMode;
  onChange: (mode: FilterMode) => void;
}

export function DiaryEntryTypeSwitcher({ value, onChange }: DiaryEntryTypeSwitcherProps) {
  const { t } = useTranslation('diary');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const modes: FilterMode[] = ['all', 'manual', 'automatic'];
      const currentIndex = modes.indexOf(value);
      const newIndex = e.key === 'ArrowLeft' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex >= 0 && newIndex < modes.length) {
        onChange(modes[newIndex]!); // guard at line 20 ensures valid index
      }
    }
  };

  return (
    <div
      className={styles.switcher}
      role="radiogroup"
      aria-label={t('typeSwitcher.ariaLabel')}
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
        {t('filterBar.filterModeAll')}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'manual'}
        onClick={() => onChange('manual')}
        className={`${styles.button} ${value === 'manual' ? styles.active : ''}`}
        data-testid="type-switcher-manual"
      >
        {t('filterBar.filterModeManual')}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'automatic'}
        onClick={() => onChange('automatic')}
        className={`${styles.button} ${value === 'automatic' ? styles.active : ''}`}
        data-testid="type-switcher-automatic"
      >
        {t('filterBar.filterModeAutomatic')}
      </button>
    </div>
  );
}

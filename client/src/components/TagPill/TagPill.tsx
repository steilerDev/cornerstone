import styles from './TagPill.module.css';

interface TagPillProps {
  name: string;
  color: string | null;
  onRemove?: () => void;
}

/**
 * Determines if a color is light or dark (for contrast).
 * Returns true if the color is light (dark text needed).
 */
function isLightColor(hexColor: string): boolean {
  // Remove # prefix if present
  const hex = hexColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5;
}

export function TagPill({ name, color, onRemove }: TagPillProps) {
  const backgroundColor = color ?? '#e5e7eb'; // Default gray if no color
  const textColor = color && isLightColor(color) ? '#111827' : '#ffffff';

  const pillStyle = {
    backgroundColor,
    color: textColor,
  };

  return (
    <span className={styles.pill} style={pillStyle}>
      <span className={styles.name}>{name}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.removeButton}
          onClick={onRemove}
          aria-label={`Remove tag ${name}`}
          style={{ color: textColor }}
        >
          ×
        </button>
      )}
    </span>
  );
}

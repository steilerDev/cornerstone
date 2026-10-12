import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './CallButton.module.css';

export interface CallButtonProps {
  /** Number as stored; the href keeps only digits and '+'. */
  readonly phone: string;
  /** Company or person, for the accessible name. */
  readonly name: string;
  /** Visible text "Call ‹number›" instead of "Call" (phone cards). */
  readonly showNumber?: boolean;
  /** Full card width, touch-target high (phone cards). */
  readonly fullWidth?: boolean;
  readonly tabIndex?: number;
  readonly id?: string;
  readonly testId?: string;
  /** Rows call stopPropagation here so the row click does not also fire. */
  readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * The one Call control: a `tel:` link styled as a secondary button. The accessible name always
 * starts with the visible text (WCAG 2.5.3).
 */
export function CallButton({
  phone,
  name,
  showNumber = false,
  fullWidth = false,
  tabIndex,
  id,
  testId,
  onClick,
}: CallButtonProps) {
  const { t } = useTranslation('common');
  const label = showNumber
    ? t('callButton.ariaNumberFirst', { number: phone, name })
    : t('callButton.aria', { name, number: phone });
  const text = showNumber ? t('callButton.callNumber', { number: phone }) : t('callButton.call');

  return (
    <a
      id={id}
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      tabIndex={tabIndex}
      className={fullWidth ? `${styles.button} ${styles.fullWidth}` : styles.button}
      aria-label={label}
      title={phone}
      onClick={onClick}
      data-testid={testId}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={styles.icon}
      >
        <path d="M3 2.5h3l1 3-1.5 1a8 8 0 0 0 4 4l1-1.5 3 1v3a1.5 1.5 0 0 1-1.5 1.5A11 11 0 0 1 1.5 4 1.5 1.5 0 0 1 3 2.5z" />
      </svg>
      <span className={styles.text}>{text}</span>
    </a>
  );
}

export default CallButton;

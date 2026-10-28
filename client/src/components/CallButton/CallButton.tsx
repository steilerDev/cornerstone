import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneIcon } from './PhoneIcon.js';
import { telHref } from './telHref.js';
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
  /** Appended after the button's own classes (a host positions or stretches it). */
  readonly className?: string;
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
  className,
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
      href={telHref(phone)}
      tabIndex={tabIndex}
      className={[styles.button, fullWidth ? styles.fullWidth : null, className]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      title={phone}
      onClick={onClick}
      data-testid={testId}
    >
      <PhoneIcon className={styles.icon} />
      <span className={styles.text}>{text}</span>
    </a>
  );
}

export default CallButton;

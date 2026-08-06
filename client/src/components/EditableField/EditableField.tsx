/**
 * EditableField component — always-visible live input for ambient overrides.
 * Supports both <input> and <textarea> modes with optional reset button and edited indicator.
 */

import { useId } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import styles from './EditableField.module.css';

export interface EditableFieldProps {
  as: 'input' | 'textarea';
  id?: string;
  label?: string; // visible label mode (letter fields + mobile cards); when present use <label htmlFor>, no aria-label
  ariaLabel: string; // used directly (composed with editedSuffix when edited) ONLY when label absent (dense desktop cells)
  editedSuffix: string; // pre-translated, e.g. " (edited)"
  resetAriaLabel: string; // pre-translated, e.g. "Reset field to generated text"
  value: string;
  onChange: (value: string) => void;
  isEdited: boolean;
  onReset: () => void;
  rows?: number; // for textarea
  className?: string;
  lang?: string;
  uiLang?: string;
  maxLength?: number; // enforcement ceiling; omitted = unbounded (AC9)
  maxLengthHint?: string; // pre-translated, e.g. "Maximum 200 characters." — always-on description
  overMaxLengthHint?: string; // pre-translated; falls back to maxLengthHint if omitted while over limit
  maxLengthReachedAnnouncement?: string; // pre-translated, e.g. "Maximum length reached."
}

export function EditableField({
  as,
  id: providedId,
  label,
  ariaLabel,
  editedSuffix,
  resetAriaLabel,
  value,
  onChange,
  isEdited,
  onReset,
  rows = 6,
  className = '',
  lang,
  uiLang,
  maxLength,
  maxLengthHint,
  overMaxLengthHint,
  maxLengthReachedAnnouncement,
}: EditableFieldProps) {
  const generatedId = useId();
  const fieldId = providedId || generatedId;
  const editedHintId = `${fieldId}-edited-hint`;
  const limitHintId = `${fieldId}-limit-hint`;
  const limitLiveId = `${fieldId}-limit-live`;

  const containerClassName = [styles.container, className].filter(Boolean).join(' ');
  const fieldClassName = as === 'textarea' ? styles.fieldTextarea : styles.field;

  const hasMaxLength = maxLength !== undefined;
  const overLimit = hasMaxLength && value.length > maxLength!;
  const atLimit = hasMaxLength && value.length === maxLength;
  const showCounter = hasMaxLength && value.length >= Math.ceil(maxLength! * 0.9);

  const ariaDescribedBy =
    [
      isEdited && label ? editedHintId : null,
      hasMaxLength ? limitHintId : null,
      hasMaxLength ? limitLiveId : null,
    ]
      .filter((id): id is string => id !== null)
      .join(' ') || undefined;
  const effectiveAriaLabel = label
    ? undefined
    : isEdited
      ? `${ariaLabel}${editedSuffix}`
      : ariaLabel;

  // Extracted so the no-counter case (the common one) can render it as a direct child of
  // .container — matching #1932's original markup exactly, with no wrapper and no added margin —
  // while the showCounter case renders the identical button inside .metaRow next to the counter.
  const resetButton = isEdited && (
    <button
      type="button"
      className={styles.resetButton}
      onClick={onReset}
      aria-label={resetAriaLabel}
      title={resetAriaLabel}
      lang={uiLang}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
      </svg>
    </button>
  );

  return (
    <div className={containerClassName}>
      {label && <label htmlFor={fieldId}>{label}</label>}

      <div className={styles.fieldWrapper}>
        {as === 'textarea' ? (
          <textarea
            id={fieldId}
            className={fieldClassName}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            rows={rows}
            aria-label={effectiveAriaLabel}
            aria-describedby={ariaDescribedBy}
            lang={lang}
            maxLength={maxLength}
          />
        ) : (
          <input
            id={fieldId}
            type="text"
            className={fieldClassName}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            aria-label={effectiveAriaLabel}
            aria-describedby={ariaDescribedBy}
            lang={lang}
            maxLength={maxLength}
          />
        )}

        {isEdited && (
          <>
            <div className={styles.editedDot} aria-hidden="true" />
            {label && (
              <span id={editedHintId} className={sharedStyles.srOnly} lang={uiLang}>
                {editedSuffix}
              </span>
            )}
          </>
        )}
      </div>

      {showCounter ? (
        <div className={styles.metaRow}>
          <span className={overLimit ? styles.counterOverLimit : styles.counter} aria-hidden="true">
            {value.length}/{maxLength}
          </span>
          {resetButton}
        </div>
      ) : (
        resetButton
      )}

      {hasMaxLength && (
        <span id={limitHintId} className={sharedStyles.srOnly} lang={uiLang}>
          {overLimit ? (overMaxLengthHint ?? maxLengthHint) : maxLengthHint}
        </span>
      )}
      {hasMaxLength && (
        <span
          id={limitLiveId}
          aria-live="polite"
          aria-atomic="true"
          className={sharedStyles.srOnly}
          lang={uiLang}
        >
          {atLimit ? maxLengthReachedAnnouncement : ''}
        </span>
      )}
    </div>
  );
}

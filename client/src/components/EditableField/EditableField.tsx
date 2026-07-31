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
}: EditableFieldProps) {
  const generatedId = useId();
  const fieldId = providedId || generatedId;
  const editedHintId = `${fieldId}-edited-hint`;

  const containerClassName = [styles.container, className].filter(Boolean).join(' ');
  const fieldClassName = as === 'textarea' ? sharedStyles.textarea : sharedStyles.input;

  const ariaDescribedBy = isEdited && label ? editedHintId : undefined;
  const effectiveAriaLabel = label
    ? undefined
    : isEdited
      ? `${ariaLabel}${editedSuffix}`
      : ariaLabel;

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
          />
        )}

        {isEdited && (
          <>
            <div className={styles.editedDot} aria-hidden="true" />
            {label && (
              <span id={editedHintId} className={styles.visuallyHidden}>
                {editedSuffix}
              </span>
            )}
          </>
        )}
      </div>

      {isEdited && (
        <button
          type="button"
          className={styles.resetButton}
          onClick={onReset}
          aria-label={resetAriaLabel}
          title={resetAriaLabel}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
          </svg>
        </button>
      )}
    </div>
  );
}

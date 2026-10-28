import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormError } from '../FormError/FormError.js';
import sharedStyles from '../../styles/shared.module.css';
import styles from './SectionCardFields.module.css';

export interface FieldShellProps {
  readonly id: string;
  readonly label: string;
  readonly required?: boolean;
  readonly error?: string | undefined;
  readonly children: (aria: {
    readonly invalid: true | undefined;
    readonly describedBy: string | undefined;
  }) => ReactNode;
}

/** Label, control and the field error next to it, for the edit mode of a `SectionCard`. */
export function FieldShell({ id, label, required = false, error, children }: FieldShellProps) {
  const { t: tc } = useTranslation('common');
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required ? <span className={styles.required}> {tc('objectForm.required')}</span> : null}
      </label>
      {children({
        invalid: error ? true : undefined,
        describedBy: error ? errorId : undefined,
      })}
      <FormError variant="field" id={errorId} message={error} />
    </div>
  );
}

export interface DetailRowProps {
  readonly label: string;
  readonly testId: string;
  /** null renders an en dash with a screen-reader "Not set". */
  readonly children: ReactNode | null;
}

/** A read-mode row of a `SectionCard`'s `<dl>`: label and value. */
export function DetailRow({ label, testId, children }: DetailRowProps) {
  const { t: tc } = useTranslation('common');
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd data-testid={testId}>
        {children ?? (
          <>
            <span aria-hidden="true">–</span>
            <span className={sharedStyles.srOnly}>{tc('summaryStrip.notSet')}</span>
          </>
        )}
      </dd>
    </div>
  );
}

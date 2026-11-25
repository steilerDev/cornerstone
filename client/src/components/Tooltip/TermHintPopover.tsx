import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { TermHintTerm } from '../../lib/termHints.js';
import { AnchoredPanel } from '../Modal/AnchoredPanel.js';
import styles from './TermHint.module.css';

export interface TermHintPopoverProps {
  readonly terms: readonly [TermHintTerm, ...TermHintTerm[]];
  readonly align?: 'start' | 'end';
  readonly testId?: string;
}

/** An info button that opens a non-modal panel listing term and definition pairs. */
export function TermHintPopover({ terms, align = 'start', testId }: TermHintPopoverProps) {
  const { t } = useTranslation('common');
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const label =
    terms.length === 1
      ? t('termHint.explainTerm', { term: t(I18N_UNION_KEYS.termHintTerm.key(terms[0])) })
      : t('termHint.explain');

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={styles.info}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        data-testid={testId}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      {open && (
        <AnchoredPanel
          open
          anchorRef={buttonRef}
          role="dialog"
          id={panelId}
          ariaLabel={t('termHint.panelLabel')}
          placement={align === 'end' ? 'bottom-end' : 'bottom-start'}
          onDismiss={(reason) => {
            setOpen(false);
            if (reason === 'escape') buttonRef.current?.focus();
          }}
          testId={testId ? `${testId}-panel` : undefined}
        >
          <dl className={styles.list}>
            {terms.map((term) => (
              <div key={term} className={styles.pair}>
                <dt className={styles.name}>{t(I18N_UNION_KEYS.termHintTerm.key(term))}</dt>
                <dd className={styles.definition}>
                  {t(I18N_UNION_KEYS.termHintDefinition.key(term))}
                </dd>
              </div>
            ))}
          </dl>
        </AnchoredPanel>
      )}
    </>
  );
}

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { I18N_UNION_KEYS } from '../../i18n/unionKeys.js';
import type { TermHintTerm } from '../../lib/termHints.js';
import { Tooltip } from './Tooltip.js';
import styles from './TermHint.module.css';

export interface TermHintProps {
  readonly term: TermHintTerm;
  /** The visible label (the term as shown, e.g. t('…columns.waitsFor')). */
  readonly children: ReactNode;
  /** Put on the term text span (not on the tooltip), for hosts whose aria-labelledby must name the label only. */
  readonly id?: string;
  /** `end` for triggers in the right half / end-aligned cells. */
  readonly align?: 'center' | 'end';
  readonly testId?: string;
}

function stopClick(event: MouseEvent) {
  event.stopPropagation();
}

function stopActivationKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
}

/** A term label with a dotted underline and its fixed definition in a tooltip. */
export function TermHint({ term, children, id, align = 'center', testId }: TermHintProps) {
  const { t } = useTranslation('common');
  const definition = t(I18N_UNION_KEYS.termHintDefinition.key(term));

  return (
    <span className={styles.root} onClick={stopClick} onKeyDown={stopActivationKey}>
      <Tooltip content={definition} toggleOnClick multiline align={align}>
        <span id={id} tabIndex={0} className={styles.term} data-testid={testId}>
          {children}
        </span>
      </Tooltip>
    </span>
  );
}
